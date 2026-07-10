# GitWit — Frontend

The Next.js frontend for **GitWit**, an AI code-intelligence platform. It provides the dashboard UI (chat, search, file explorer, PR reviews), handles OAuth sign-in via NextAuth, and acts as an auth-aware proxy to the FastAPI backend.

> For the full product overview see the [root README](../README.md). For a deep architecture walkthrough see [`../ARCHITECTURE.md`](../ARCHITECTURE.md).

## Stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript**
- **NextAuth.js** — GitHub, Google, and Bitbucket OAuth (JWT sessions)
- **react-markdown** + **react-syntax-highlighter** — renders cited, syntax-highlighted answers
- **Tailwind CSS v4** · **Tabler Icons**

## Getting Started

```bash
npm install
cp .env.local.example .env.local   # then fill in the values below
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The backend must be running (default `http://localhost:8001`) — see the [root README](../README.md).

## Environment variables

Set these in `.env.local` (local) or the container environment (Docker):

| Variable | Description |
|---|---|
| `BACKEND_URL` | FastAPI backend URL (default `http://localhost:8001`) — where the proxy forwards requests |
| `NEXTAUTH_URL` | This app's URL (e.g. `http://localhost:3000`) |
| `NEXTAUTH_SECRET` | Random 32-char string (`openssl rand -base64 32`) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth app credentials |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth credentials (optional) |
| `BITBUCKET_CLIENT_ID` / `BITBUCKET_CLIENT_SECRET` | Bitbucket Cloud OAuth credentials (optional) |

Only providers whose credentials are set appear on the sign-in page.

## How it fits together

- `app/page.tsx` — the dashboard (sidebar + Chat / Reviews / Files / Search tabs)
- `app/api/backend/[...path]/route.ts` — reverse proxy to the backend; injects the `X-User-ID` header for per-user repo isolation
- `app/api/stream/[repoId]/route.ts` — streams the chat SSE response through from the backend
- `middleware.ts` — requires auth on all routes except sign-in
- `lib/api.ts` — typed API client · `lib/auth.ts` — NextAuth config · `lib/types.ts` — shared types

> Note: this project pins a newer Next.js than most tooling expects (see `AGENTS.md`). Treat the conventions in the code (async route `params`, streaming `fetch` with `duplex: "half"`) as authoritative.

## Scripts

```bash
npm run dev     # dev server
npm run build   # production build
npm run start   # serve the production build
npm run lint    # eslint
```
