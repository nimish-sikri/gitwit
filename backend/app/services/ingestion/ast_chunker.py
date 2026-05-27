from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from tree_sitter import Language, Parser, Node

logger = logging.getLogger(__name__)

# Maps file extension → (module_name, language_attr)
# Using official tree-sitter language packages (tree-sitter 0.22+ API)
_LANGUAGE_REGISTRY: dict[str, tuple[str, str]] = {
    ".py":   ("tree_sitter_python", "language"),
    ".js":   ("tree_sitter_javascript", "language"),
    ".jsx":  ("tree_sitter_javascript", "language"),
    ".ts":   ("tree_sitter_typescript", "language_typescript"),
    ".tsx":  ("tree_sitter_typescript", "language_tsx"),
    ".java": ("tree_sitter_java", "language"),
    ".go":   ("tree_sitter_go", "language"),
    ".rs":   ("tree_sitter_rust", "language"),
    ".c":    ("tree_sitter_c", "language"),
    ".h":    ("tree_sitter_c", "language"),
    ".cpp":  ("tree_sitter_cpp", "language"),
    ".cc":   ("tree_sitter_cpp", "language"),
    ".cxx":  ("tree_sitter_cpp", "language"),
    ".hpp":  ("tree_sitter_cpp", "language"),
    ".cs":   ("tree_sitter_c_sharp", "language"),
    ".rb":   ("tree_sitter_ruby", "language"),
}

# Human-readable language name for metadata
_EXT_TO_LANG: dict[str, str] = {
    ".py": "python", ".js": "javascript", ".jsx": "javascript",
    ".ts": "typescript", ".tsx": "tsx", ".java": "java",
    ".go": "go", ".rs": "rust", ".c": "c", ".h": "c",
    ".cpp": "cpp", ".cc": "cpp", ".cxx": "cpp", ".hpp": "cpp",
    ".cs": "c_sharp", ".rb": "ruby",
}

# Cached Language objects
_lang_cache: dict[str, Language] = {}


def _get_language(ext: str) -> Language | None:
    if ext in _lang_cache:
        return _lang_cache[ext]
    entry = _LANGUAGE_REGISTRY.get(ext)
    if entry is None:
        return None
    module_name, attr = entry
    try:
        import importlib
        mod = importlib.import_module(module_name)
        lang_fn = getattr(mod, attr)
        lang = Language(lang_fn())
        _lang_cache[ext] = lang
        return lang
    except Exception as exc:
        logger.debug("Cannot load language for %s: %s", ext, exc)
        return None


# Node types that represent named, reviewable code units per language
FUNCTION_NODE_TYPES: dict[str, set[str]] = {
    "python":     {"function_definition", "async_function_definition"},
    "javascript": {"function_declaration", "arrow_function", "method_definition", "function_expression"},
    "typescript": {"function_declaration", "arrow_function", "method_definition", "function_expression"},
    "tsx":        {"function_declaration", "arrow_function", "method_definition", "function_expression"},
    "java":       {"method_declaration", "constructor_declaration"},
    "go":         {"function_declaration", "method_declaration"},
    "rust":       {"function_item"},
    "c":          {"function_definition"},
    "cpp":        {"function_definition"},
    "c_sharp":    {"method_declaration", "constructor_declaration"},
    "ruby":       {"method", "singleton_method"},
}

CLASS_NODE_TYPES: dict[str, set[str]] = {
    "python":     {"class_definition"},
    "javascript": {"class_declaration"},
    "typescript": {"class_declaration", "interface_declaration"},
    "tsx":        {"class_declaration"},
    "java":       {"class_declaration", "interface_declaration", "enum_declaration"},
    "go":         {"type_declaration"},
    "rust":       {"struct_item", "enum_item", "trait_item", "impl_item"},
    "c":          {"struct_specifier"},
    "cpp":        {"class_specifier", "struct_specifier"},
    "c_sharp":    {"class_declaration", "interface_declaration", "struct_declaration"},
    "ruby":       {"class", "module"},
}


@dataclass
class Chunk:
    text: str
    file_path: str
    language: str
    start_line: int
    end_line: int
    chunk_type: str  # function | class | fallback
    node_name: str
    file_hash: str = field(default="")

    @property
    def id(self) -> str:
        # Include file_hash so identical content at same lines in different files still collides,
        # but symlink duplicates (same path, same hash) are caught by the pipeline dedup.
        return hashlib.md5(
            f"{self.file_path}:{self.file_hash}:{self.start_line}:{self.end_line}".encode()
        ).hexdigest()


def chunk_file(file_path: Path, repo_root: Path, max_lines: int = 150) -> list[Chunk]:
    """Parse a source file into semantic chunks using tree-sitter AST."""
    suffix = file_path.suffix.lower()
    language_name = _EXT_TO_LANG.get(suffix, "")
    relative_path = str(file_path.relative_to(repo_root)).replace("\\", "/")

    try:
        source_bytes = file_path.read_bytes()
    except OSError:
        return []

    file_hash = hashlib.md5(source_bytes).hexdigest()
    source = source_bytes.decode(errors="replace")

    lang = _get_language(suffix)
    if lang is None:
        return _fallback_chunks(source, relative_path, language_name or "text", file_hash)

    try:
        parser = Parser(lang)
        tree = parser.parse(source_bytes)
        chunks = _extract_ast_chunks(
            tree.root_node, source, relative_path, language_name, file_hash, max_lines
        )
        if not chunks:
            chunks = _fallback_chunks(source, relative_path, language_name, file_hash)
        return chunks
    except Exception as exc:
        logger.debug("tree-sitter parse failed for %s: %s", relative_path, exc)
        return _fallback_chunks(source, relative_path, language_name, file_hash)


def _extract_ast_chunks(
    root_node: Node,
    source: str,
    file_path: str,
    language: str,
    file_hash: str,
    max_lines: int,
) -> list[Chunk]:
    lines = source.splitlines()
    chunks: list[Chunk] = []
    fn_types = FUNCTION_NODE_TYPES.get(language, set())
    cls_types = CLASS_NODE_TYPES.get(language, set())

    def visit(node: Node) -> None:
        if node.type in cls_types:
            name = _get_node_name(node, source)
            start_line = node.start_point[0] + 1
            end_line = node.end_point[0] + 1
            text = "\n".join(lines[node.start_point[0] : node.end_point[0] + 1])
            if end_line - start_line <= max_lines:
                chunks.append(Chunk(
                    text=text, file_path=file_path, language=language,
                    start_line=start_line, end_line=end_line,
                    chunk_type="class", node_name=name, file_hash=file_hash,
                ))
            else:
                for child in node.children:
                    visit(child)
        elif node.type in fn_types:
            name = _get_node_name(node, source)
            start_line = node.start_point[0] + 1
            end_line = node.end_point[0] + 1
            text = "\n".join(lines[node.start_point[0] : node.end_point[0] + 1])
            if end_line - start_line > max_lines:
                chunks.extend(_split_large_chunk(
                    text, file_path, language, start_line, "function", name, file_hash, max_lines
                ))
            else:
                chunks.append(Chunk(
                    text=text, file_path=file_path, language=language,
                    start_line=start_line, end_line=end_line,
                    chunk_type="function", node_name=name, file_hash=file_hash,
                ))
        else:
            for child in node.children:
                visit(child)

    visit(root_node)
    return chunks


def _get_node_name(node: Node, source: str) -> str:
    for child in node.children:
        if child.type in ("identifier", "name", "property_identifier", "field_identifier"):
            return source[child.start_byte : child.end_byte]
    return ""


def _split_large_chunk(
    text: str,
    file_path: str,
    language: str,
    base_start: int,
    chunk_type: str,
    node_name: str,
    file_hash: str,
    max_lines: int,
) -> list[Chunk]:
    lines = text.splitlines()
    chunks = []
    i = 0
    part = 0
    while i < len(lines):
        end = min(i + max_lines, len(lines))
        part += 1
        chunks.append(Chunk(
            text="\n".join(lines[i:end]),
            file_path=file_path,
            language=language,
            start_line=base_start + i,
            end_line=base_start + end - 1,
            chunk_type=chunk_type,
            node_name=f"{node_name} (part {part})" if node_name else f"part {part}",
            file_hash=file_hash,
        ))
        i = end
    return chunks


def _fallback_chunks(
    source: str,
    file_path: str,
    language: str,
    file_hash: str,
    window: int = 60,
    overlap: int = 10,
) -> list[Chunk]:
    lines = source.splitlines()
    if not lines:
        return []
    chunks = []
    i = 0
    while i < len(lines):
        end = min(i + window, len(lines))
        chunks.append(Chunk(
            text="\n".join(lines[i:end]),
            file_path=file_path,
            language=language,
            start_line=i + 1,
            end_line=end,
            chunk_type="fallback",
            node_name="",
            file_hash=file_hash,
        ))
        i += window - overlap
    return chunks
