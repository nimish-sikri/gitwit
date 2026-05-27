import type { AppSettings, Repo, ReviewEntry, SearchResult } from "./types"

// Use the Next.js rewrite proxy — always same origin, no CORS or env var issues
const BASE = "/api/backend"

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  listRepos: () => apiFetch<Repo[]>("/repos"),
  claimUnownedRepos: () => apiFetch<{ claimed: number; user_id: string }>("/repos/claim-unowned", { method: "POST" }),
  claimAllRepos: () => apiFetch<{ claimed: number; user_id: string }>("/repos/claim-all", { method: "POST" }),

  indexRepo: (repo_url: string, branch?: string, embed_provider?: string) =>
    apiFetch<{ repo_id: string; status: string }>("/repos", {
      method: "POST",
      body: JSON.stringify({ repo_url, branch, embed_provider }),
    }),

  getRepo: (repo_id: string) => apiFetch<Repo>(`/repos/${repo_id}`),

  deleteRepo: (repo_id: string) =>
    apiFetch<{ deleted: string }>(`/repos/${repo_id}`, { method: "DELETE" }),

  reindexRepo: (repo_id: string) =>
    apiFetch<{ status: string }>(`/repos/${repo_id}/reindex`, { method: "POST" }),

  search: (repo_id: string, query: string, top_k = 8) =>
    apiFetch<SearchResult[]>(`/repos/${repo_id}/search`, {
      method: "POST",
      body: JSON.stringify({ query, top_k }),
    }),

  listReviews: (repo_id: string) => apiFetch<ReviewEntry[]>(`/repos/${repo_id}/reviews`),

  triggerPrReview: (repo_id: string, pr_url: string) =>
    apiFetch<{ status: string; platform: string; pr: number }>(`/repos/${repo_id}/review-pr`, {
      method: "POST",
      body: JSON.stringify({ pr_url }),
    }),

  getRepoFiles: (repo_id: string) =>
    apiFetch<{ files: string[] }>(`/repos/${repo_id}/files`),

  getFileChunks: (repo_id: string, path: string) =>
    apiFetch<{ chunks: { text: string; file_path: string; start_line: number; end_line: number; chunk_type: string; node_name: string; language: string }[] }>(
      `/repos/${repo_id}/file-chunks?path=${encodeURIComponent(path)}`
    ),

  getDirChunks: (repo_id: string, path: string, limit = 10) =>
    apiFetch<{ chunks: { text: string; file_path: string; start_line: number; end_line: number; chunk_type: string; node_name: string; language: string }[] }>(
      `/repos/${repo_id}/dir-chunks?path=${encodeURIComponent(path)}&limit=${limit}`
    ),

  getSettings: () => apiFetch<AppSettings>("/settings"),

  updateSettings: (data: {
    anthropic_api_key?: string
    voyage_api_key?: string
    openai_api_key?: string
    default_model?: string
    default_embed_provider?: string
    llm_provider?: string
    ollama_llm_model?: string
    github_token?: string
    bitbucket_username?: string
    bitbucket_app_password?: string
    bitbucket_server_url?: string
  }) => apiFetch<{ status: string }>("/settings", {
    method: "POST",
    body: JSON.stringify(data),
  }),
}

export function chatStream(
  repo_id: string,
  message: string,
  history: { role: string; content: string }[]
): EventSource {
  // We use fetch + ReadableStream manually to support POST with body
  return new EventSource(`${BASE}/api/v1/repos/${repo_id}/chat`)
}

export async function* chatStreamGenerator(
  repo_id: string,
  message: string,
  history: { role: string; content: string }[],
  model?: string,
): AsyncGenerator<{ event: string; data: unknown }> {
  const res = await fetch(`/api/stream/${repo_id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history, model }),
  })
  if (!res.ok || !res.body) throw new Error(`Chat API error: ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split("\n\n")
    buffer = parts.pop() ?? ""
    for (const part of parts) {
      const eventLine = part.match(/^event: (.+)$/m)?.[1] ?? "message"
      const dataLine = part.match(/^data: (.+)$/m)?.[1]
      if (dataLine) {
        yield { event: eventLine, data: JSON.parse(dataLine) }
      }
    }
  }
}
