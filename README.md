# GitWit — Chat with Your Code

> AI-powered code intelligence platform. Index any GitHub or Bitbucket repository and chat with it using natural language — with file and line citations grounded in your actual codebase.

---

## Features

### 🤖 AI Code Chat
- Chat with any indexed repository in natural language
- Every answer cites the exact **file path and line numbers** it used
- Streaming responses with real-time token display
- **Retrieved context panel** shows which chunks were used (with RRF, dense, BM25 scores)
- Chat history persisted per repo

### 🔍 Hybrid Search
- **RRF fusion** of dense (semantic) + BM25 (keyword) retrieval
- Language filter chips — filter results by Python, TypeScript, C#, etc.
- Syntax-highlighted code previews with line numbers
- **"Ask about this"** — click any result to pre-fill the chat

### 📂 File Explorer
- Full file tree with collapsible folders
- Click any file to view its indexed **code chunks** with syntax highlighting
- **"Ask about this file/project"** — hover any file or directory row
- Language breakdown stats + file count badges on folders

### 🔍 PR Code Review
- **Manual trigger** — paste any GitHub or Bitbucket PR URL to review it instantly
- **Webhook support** — auto-review every PR on open/update
- Reviews grounded in your codebase patterns (not generic rules)
- Inline comments posted directly to GitHub/Bitbucket PRs
- Review history with bug/security/suggestion/style severity counts

### 🔐 Authentication & Multi-user
- GitHub OAuth, Google OAuth sign-in
- **Per-user repo isolation** — each user sees only their own indexed repos
- OAuth token auto-saved as Git credential (private repos work without manual token entry)
- Browse and index your GitHub repos directly from the UI

### ⚙️ Technical
- **AST-based chunking** via tree-sitter — respects function/class boundaries across 15 languages
- **Three embedding providers**: Voyage AI (voyage-code-2, best for code), Ollama (local/free), OpenAI
- **Branch support** — index any branch, not just main
- **Git LFS skip** — skips binary assets, indexes only source code
- **Incremental re-index** — only re-embeds changed files
- Dark / light theme with smooth transition
- Background indexing with progress tracking (Celery + Redis in production)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, TypeScript, React, NextAuth.js |
| Backend | FastAPI (Python), Uvicorn |
| AI / LLM | Anthropic Claude (Haiku / Sonnet / Opus) |
| Embeddings | Voyage AI voyage-code-2 / Ollama / OpenAI |
| Vector DB | ChromaDB (cosine similarity) |
| Search | BM25 + Dense vectors with RRF fusion |
| AST Chunking | tree-sitter (15 languages) |
| Task Queue | Celery + Redis |
| Auth | NextAuth.js (GitHub, Google OAuth) |
| Deployment | Docker Compose |

---

## Quick Start (Local)

### Prerequisites
- Python 3.11+
- Node.js 20+
- [Ollama](https://ollama.ai) (for local embeddings) or a Voyage/OpenAI API key

### 1. Clone & install

```bash
git clone https://github.com/nimish-sikri/gitwit
cd gitwit
```

**Backend:**
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate      # Windows
# source .venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
cp .env.example .env
# Edit .env — add your ANTHROPIC_API_KEY and VOYAGE_API_KEY
```

**Frontend:**
```bash
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local — add NEXTAUTH_SECRET and GitHub OAuth credentials
```

### 2. Run

```bash
# Terminal 1 — Backend
cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8001

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Open **http://localhost:3000**

### 3. Index a repo
1. Sign in with GitHub
2. Click **Browse your GitHub repos** or paste any Git URL
3. Click **Index** — watch the progress bar
4. Click **Chat** and start asking questions

---

## Production Deployment (Docker Compose)

```bash
cp .env.example .env
# Fill in all values in .env

docker compose up -d
```

Services started: `backend`, `frontend`, `chromadb`, `redis`, `celery_worker`

### Environment Variables

See [`backend/.env.example`](backend/.env.example) and [`frontend/.env.example`](frontend/.env.example) for all required variables.

**Key variables:**

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key — get at [console.anthropic.com](https://console.anthropic.com) |
| `VOYAGE_API_KEY` | Voyage AI key — free 50M tokens at [voyageai.com](https://voyageai.com) |
| `GITHUB_CLIENT_ID/SECRET` | GitHub OAuth app credentials |
| `NEXTAUTH_SECRET` | Random 32-char string (`openssl rand -base64 32`) |
| `ALLOWED_ORIGINS` | Your frontend URL (e.g. `https://gitwit.up.railway.app`) |

---

## GitHub Actions — Auto Re-index

Add `.github/workflows/reindex.yml` (already included) and set two repo secrets:
- `GITWIT_URL` — your deployed backend URL
- `GITWIT_REPO_ID` — the repo ID shown in GitWit's URL

Every push to `main` will trigger an incremental re-index.

---

## Supported Languages

Python, TypeScript, JavaScript, Go, Rust, Java, C#, C++, C, Ruby, Kotlin, Swift, PHP, HTML, CSS

---

## License

MIT
