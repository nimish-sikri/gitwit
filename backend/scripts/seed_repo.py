#!/usr/bin/env python
"""CLI to manually trigger full ingestion of a GitHub repo.

Usage:
    python scripts/seed_repo.py https://github.com/owner/repo
    python scripts/seed_repo.py https://github.com/owner/repo --branch main
"""
import asyncio
import argparse
import sys
from pathlib import Path

# Add backend root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.ingestion.pipeline import ingest_repo, get_repo


async def main() -> None:
    parser = argparse.ArgumentParser(description="Index a GitHub repository")
    parser.add_argument("url", help="GitHub repository URL")
    parser.add_argument("--branch", default=None, help="Branch to index (default: default branch)")
    parser.add_argument("--incremental", action="store_true", help="Only reindex changed files")
    args = parser.parse_args()

    print(f"Starting ingestion of {args.url}...")
    repo_id = await ingest_repo(args.url, branch=args.branch, incremental=args.incremental)
    info = get_repo(repo_id)
    print(f"\nDone! repo_id={repo_id}")
    if info:
        print(f"  Chunks: {info.get('total_chunks', '?')}")
        print(f"  Commit: {info.get('last_commit', '?')}")
        print(f"  Status: {info.get('status', '?')}")


if __name__ == "__main__":
    asyncio.run(main())
