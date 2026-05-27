import tempfile
from pathlib import Path
from app.services.ingestion.ast_chunker import chunk_file, Chunk


PYTHON_SAMPLE = '''\
def hello(name: str) -> str:
    return f"Hello, {name}!"


def add(a: int, b: int) -> int:
    return a + b


class Calculator:
    def multiply(self, x: int, y: int) -> int:
        return x * y
'''

JS_SAMPLE = '''\
function greet(name) {
  return `Hello, ${name}!`;
}

const add = (a, b) => a + b;
'''


def write_tmp(content: str, suffix: str) -> tuple[Path, Path]:
    """Write content to a temp file and return (file_path, root)."""
    root = Path(tempfile.mkdtemp())
    fp = root / f"sample{suffix}"
    fp.write_text(content)
    return fp, root


def test_python_chunking():
    fp, root = write_tmp(PYTHON_SAMPLE, ".py")
    chunks = chunk_file(fp, root)
    assert len(chunks) >= 2, "Expected at least hello() and add()"
    names = {c.node_name for c in chunks}
    assert "hello" in names
    assert "add" in names
    for c in chunks:
        assert c.language == "python"
        assert c.start_line > 0
        assert c.end_line >= c.start_line


def test_js_chunking():
    fp, root = write_tmp(JS_SAMPLE, ".js")
    chunks = chunk_file(fp, root)
    assert len(chunks) >= 1
    for c in chunks:
        assert c.language == "javascript"


def test_unknown_extension_fallback():
    fp, root = write_tmp("line1\nline2\nline3\n", ".unknown_ext")
    chunks = chunk_file(fp, root)
    assert len(chunks) >= 1
    assert chunks[0].chunk_type == "fallback"


def test_chunk_ids_are_unique():
    fp, root = write_tmp(PYTHON_SAMPLE, ".py")
    chunks = chunk_file(fp, root)
    ids = [c.id for c in chunks]
    assert len(ids) == len(set(ids)), "Chunk IDs must be unique"


def test_file_hash_populated():
    fp, root = write_tmp(PYTHON_SAMPLE, ".py")
    chunks = chunk_file(fp, root)
    for c in chunks:
        assert c.file_hash, "file_hash must be non-empty"
