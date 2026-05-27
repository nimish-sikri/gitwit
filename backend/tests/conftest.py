import os
import pytest

# Point to a temp ChromaDB for tests
os.environ.setdefault("CHROMA_PERSIST_DIR", "/tmp/test_chromadb")
os.environ.setdefault("EMBEDDING_PROVIDER", "ollama")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")
