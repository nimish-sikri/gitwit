import logging
import os
import hashlib
from pathlib import Path
from urllib.parse import urlparse, urlunparse, quote
import git
from app import runtime
from app.config import settings

logger = logging.getLogger(__name__)


def repo_id_from_url(url: str) -> str:
    """Stable, filesystem-safe ID derived from the repo URL."""
    clean = url.lower().strip().rstrip("/").removesuffix(".git")
    return hashlib.md5(clean.encode()).hexdigest()[:16]


def _is_bitbucket_host(host: str) -> bool:
    """True for bitbucket.org AND self-hosted Bitbucket Server instances."""
    if "bitbucket.org" in host:
        return True
    server_url = runtime.get_key("bitbucket_server_url", settings.bitbucket_server_url)
    if server_url:
        server_host = (urlparse(server_url).hostname or "").lower()
        return bool(server_host) and host == server_host
    return False


def _inject_auth(url: str) -> str:
    """Return url with credentials embedded for private repo access.

    GitHub: token@github.com  (token acts as username)
    Bitbucket Cloud: username:app_password@bitbucket.org
    Bitbucket Server: username:http_access_token@your-server.com
    The original url (without creds) is kept for display/storage.
    """
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()

    if "github.com" in host:
        token = runtime.get_key("github_token", settings.github_token)
        if token:
            return urlunparse(parsed._replace(netloc=f"{token}@{parsed.hostname}"))

    elif _is_bitbucket_host(host):
        username = runtime.get_key("bitbucket_username", settings.bitbucket_username)
        password = runtime.get_key("bitbucket_app_password", settings.bitbucket_app_password)
        if username and password:
            return urlunparse(parsed._replace(
                netloc=f"{quote(username, safe='')}:{quote(password, safe='')}@{parsed.hostname}"
            ))

    return url


def local_path(repo_id: str) -> Path:
    return Path(settings.repos_dir) / repo_id


def clone_or_pull(url: str, repo_id: str, branch: str | None = None) -> git.Repo:
    """Clone if not present, pull latest if already cloned. Returns git.Repo."""
    path = local_path(repo_id)
    auth_url = _inject_auth(url)

    # Disable interactive credential prompts and skip LFS downloads entirely.
    # LFS objects are large binaries we can't index; skipping avoids multi-GB downloads.
    # credential.helper="" disables GCM so wrong credentials fail immediately.
    no_prompt_env = {
        **os.environ,
        "GIT_TERMINAL_PROMPT": "0",
        "GCM_INTERACTIVE": "Never",
        "GIT_LFS_SKIP_SMUDGE": "1",    # skip LFS file downloads during clone/checkout
        "GIT_CONFIG_COUNT": "2",
        "GIT_CONFIG_KEY_0": "credential.helper",
        "GIT_CONFIG_VALUE_0": "",       # empty = disable all credential helpers
        "GIT_CONFIG_KEY_1": "lfs.fetchexclude",
        "GIT_CONFIG_VALUE_1": "**",     # exclude all LFS paths from fetch
    }

    if path.exists() and (path / ".git").exists():
        logger.info("Pulling latest for %s", url)
        repo = git.Repo(path)
        repo.remotes.origin.set_url(auth_url)
        with repo.git.custom_environment(**no_prompt_env):
            if branch:
                # Fetch the specific branch (it may not exist locally in a shallow clone)
                repo.remotes.origin.fetch(
                    refspec=f"refs/heads/{branch}:refs/remotes/origin/{branch}",
                    depth=1,
                )
                repo.git.checkout("-B", branch, f"origin/{branch}")
            else:
                repo.remotes.origin.pull()
        return repo
    else:
        logger.info("Cloning %s → %s", url, path)
        path.mkdir(parents=True, exist_ok=True)
        kwargs: dict = {"url": auth_url, "to_path": str(path), "depth": 1, "env": no_prompt_env}
        if branch:
            kwargs["branch"] = branch
        return git.Repo.clone_from(**kwargs)


def get_changed_files(repo_id: str, base_ref: str = "HEAD~1") -> list[str]:
    """Returns relative paths of files changed since base_ref."""
    path = local_path(repo_id)
    repo = git.Repo(path)
    try:
        diff = repo.git.diff("--name-only", base_ref, "HEAD")
        return [f.strip() for f in diff.splitlines() if f.strip()]
    except git.GitCommandError:
        # If only one commit exists, return all files
        return []


def walk_repo_files(repo_id: str, extensions: set[str] | None = None) -> list[Path]:
    """Walk repo directory and return all code files matching extensions."""
    path = local_path(repo_id)
    if extensions is None:
        extensions = {
            ".py", ".js", ".ts", ".tsx", ".jsx",
            ".java", ".cpp", ".c", ".h", ".hpp",
            ".go", ".rs", ".rb", ".cs", ".kt",
            ".swift", ".php",
        }
    files = []
    skip_dirs = {".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build", ".next"}
    for root, dirs, filenames in os.walk(path):
        dirs[:] = [d for d in dirs if d not in skip_dirs]
        for filename in filenames:
            fp = Path(root) / filename
            if fp.suffix in extensions:
                # Skip files > 1MB to avoid binary/generated files
                if fp.stat().st_size < 1_000_000:
                    files.append(fp)
    return files
