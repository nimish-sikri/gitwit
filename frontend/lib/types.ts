export interface Repo {
  repo_id: string
  repo_url: string
  status: "indexing" | "ready" | "error" | "unknown"
  total_chunks?: number
  last_commit?: string
  branch?: string
  indexed_at?: string
  embed_provider?: string
  progress?: { status: string; message: string; pct: number }
}

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
  citations?: Citation[]
}

export interface Citation {
  file: string
  start_line: number
  end_line: number
  preview: string
}

export interface ReviewComment {
  filename: string
  severity: "bug" | "security" | "suggestion" | "style"
  description: string
}

export interface ReviewEntry {
  repo_full_name: string
  pr_number: number
  pr_url?: string
  head_sha: string
  reviewed_at: string
  status: "running" | "completed" | "error"
  comment_count: number
  comments: ReviewComment[]
  error?: string
}

export interface AppSettings {
  anthropic_configured: boolean
  voyage_configured: boolean
  openai_configured: boolean
  ollama_configured: boolean
  default_model: string
  default_embed_provider: string
  llm_provider: string
  ollama_llm_model: string
  github_configured: boolean
  bitbucket_configured: boolean
  bitbucket_server_url: string
}

export interface SearchResult {
  chunk_id: string
  file_path: string
  start_line: number
  end_line: number
  language: string
  chunk_type: string
  node_name: string
  text: string
  rrf_score: number
  dense_rank: number
  bm25_rank: number
}
