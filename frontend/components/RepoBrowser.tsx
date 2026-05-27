"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { api } from "@/lib/api"

interface GHRepo {
  id: number
  full_name: string
  description: string | null
  language: string | null
  private: boolean
  updated_at: string
  stargazers_count: number
  html_url: string
}

interface Props {
  onIndexed: (repo_id: string, url: string) => void
}

const LANG_COLOR: Record<string, string> = {
  Python: "#3b82f6", TypeScript: "#60a5fa", JavaScript: "#f59e0b",
  Go: "#22d3ee", Rust: "#f97316", Java: "#ef4444",
  "C#": "#a78bfa", "C++": "#6366f1", Ruby: "#f43f5e",
  Swift: "#f97316", Kotlin: "#f59e0b", PHP: "#8b5cf6",
}

export default function RepoBrowser({ onIndexed }: Props) {
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)
  const [repos, setRepos] = useState<GHRepo[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState("")
  const [indexing, setIndexing] = useState<Record<string, boolean>>({})
  const [indexed, setIndexed] = useState<Record<string, boolean>>({})
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  const s = session as typeof session & { accessToken?: string; provider?: string }

  async function fetchRepos(p = 1, append = false) {
    if (!s?.accessToken) return
    setLoading(true)
    try {
      let data: GHRepo[] = []
      if (s.provider === "github") {
        const res = await fetch(
          `https://api.github.com/user/repos?per_page=30&sort=updated&page=${p}`,
          { headers: { Authorization: `Bearer ${s.accessToken}`, Accept: "application/vnd.github+json" } }
        )
        data = await res.json()
        setHasMore(data.length === 30)
      } else if (s.provider === "bitbucket") {
        const res = await fetch(
          `https://api.bitbucket.org/2.0/repositories?role=member&pagelen=30&page=${p}&sort=-updated_on`,
          { headers: { Authorization: `Bearer ${s.accessToken}` } }
        )
        const json = await res.json()
        data = (json.values ?? []).map((r: Record<string, unknown>) => ({
          id: r.uuid as number,
          full_name: r.full_name as string,
          description: r.description as string | null,
          language: r.language as string | null,
          private: r.is_private as boolean,
          updated_at: r.updated_on as string,
          stargazers_count: 0,
          html_url: ((r.links as Record<string, Record<string, string>>)?.html?.href ?? "") as string,
        }))
        setHasMore(!!json.next)
      }
      setRepos((prev) => append ? [...prev, ...data] : data)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  function handleOpen() {
    setOpen(true)
    if (repos.length === 0) fetchRepos(1)
  }

  async function handleIndex(repo: GHRepo) {
    setIndexing((p) => ({ ...p, [repo.full_name]: true }))
    try {
      const res = await api.indexRepo(repo.html_url)
      setIndexed((p) => ({ ...p, [repo.full_name]: true }))
      onIndexed(res.repo_id, repo.html_url)
    } catch { /* ignore */ }
    finally { setIndexing((p) => ({ ...p, [repo.full_name]: false })) }
  }

  function loadMore() {
    const next = page + 1
    setPage(next)
    fetchRepos(next, true)
  }

  // Only show for git providers (not Google — no repos)
  if (!s?.accessToken || s.provider === "google") return null

  const filtered = filter
    ? repos.filter((r) => r.full_name.toLowerCase().includes(filter.toLowerCase()) || r.description?.toLowerCase().includes(filter.toLowerCase()))
    : repos

  return (
    <>
      <button
        onClick={handleOpen}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "var(--bg2)", border: "1px solid var(--border2)", borderRadius: 7, padding: "7px 10px", fontSize: 11, fontWeight: 500, color: "var(--txt1)", cursor: "pointer", transition: "all .15s", marginBottom: 6 }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--blue)"; e.currentTarget.style.color = "var(--blue)" }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--txt1)" }}
      >
        <i className={`ti ti-brand-${s.provider === "bitbucket" ? "bitbucket" : "github"}`} style={{ fontSize: 13 }} />
        Browse your {s.provider === "bitbucket" ? "Bitbucket" : "GitHub"} repos
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 200 }} />

          {/* Modal */}
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 201, width: 560, maxHeight: "80vh", display: "flex", flexDirection: "column", background: "var(--bg1)", border: "1px solid var(--border2)", borderRadius: 12, boxShadow: "0 32px 80px rgba(0,0,0,.6)", overflow: "hidden" }}>

            {/* Header */}
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <i className={`ti ti-brand-${s.provider === "bitbucket" ? "bitbucket" : "github"}`} style={{ fontSize: 18, color: "var(--txt1)" }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--txt0)" }}>Your {s.provider === "bitbucket" ? "Bitbucket" : "GitHub"} Repositories</div>
                <div style={{ fontSize: 11, color: "var(--txt2)", marginTop: 1 }}>Select repos to index in GitWit</div>
              </div>
              <button onClick={() => setOpen(false)} style={{ width: 28, height: 28, background: "none", border: "1px solid transparent", borderRadius: 6, color: "var(--txt2)", cursor: "pointer", display: "grid", placeItems: "center", transition: "all .15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg2)"; e.currentTarget.style.borderColor = "var(--border2)" }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.borderColor = "transparent" }}>
                <i className="ti ti-x" style={{ fontSize: 14 }} />
              </button>
            </div>

            {/* Search */}
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, background: "var(--bg0)", border: "1px solid var(--border2)", borderRadius: 7, padding: "7px 11px" }}>
                <i className="ti ti-search" style={{ fontSize: 12, color: "var(--txt2)" }} />
                <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter repositories…"
                  style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 12, color: "var(--txt0)" }} />
                {filter && <button onClick={() => setFilter("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--txt2)", padding: 0 }}><i className="ti ti-x" style={{ fontSize: 11 }} /></button>}
              </div>
            </div>

            {/* Repo list */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {loading && repos.length === 0 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 0", gap: 8, color: "var(--txt2)", fontSize: 12 }}>
                  <i className="ti ti-loader-2" style={{ fontSize: 16, animation: "spin 1s linear infinite" }} /> Loading repositories…
                </div>
              )}

              {filtered.map((repo) => {
                const isIndexing = indexing[repo.full_name]
                const isIndexed  = indexed[repo.full_name]
                const langColor  = LANG_COLOR[repo.language ?? ""] ?? "var(--txt2)"

                return (
                  <div key={repo.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderBottom: "1px solid var(--border)", transition: "background .1s" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg2)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--txt0)", fontFamily: "var(--mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {repo.full_name}
                        </span>
                        {repo.private && (
                          <span style={{ fontSize: 9, fontWeight: 600, color: "var(--amber)", background: "var(--amber-dim)", border: "1px solid rgba(245,158,11,.2)", borderRadius: 3, padding: "1px 5px", flexShrink: 0, textTransform: "uppercase", letterSpacing: ".04em" }}>Private</span>
                        )}
                      </div>
                      {repo.description && (
                        <div style={{ fontSize: 11, color: "var(--txt2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>
                          {repo.description}
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 10, color: "var(--txt2)" }}>
                        {repo.language && (
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: langColor, flexShrink: 0 }} />
                            {repo.language}
                          </span>
                        )}
                        {repo.stargazers_count > 0 && (
                          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                            <i className="ti ti-star" style={{ fontSize: 10 }} />
                            {repo.stargazers_count.toLocaleString()}
                          </span>
                        )}
                        <span>{new Date(repo.updated_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {/* Action */}
                    <button
                      onClick={() => !isIndexed && !isIndexing && handleIndex(repo)}
                      disabled={isIndexing || isIndexed}
                      style={{
                        flexShrink: 0, borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 600,
                        cursor: isIndexed || isIndexing ? "default" : "pointer", transition: "all .15s",
                        background: isIndexed ? "var(--green-dim)" : isIndexing ? "var(--bg3)" : "var(--blue-dim)",
                        border: `1px solid ${isIndexed ? "rgba(34,197,94,.25)" : isIndexing ? "var(--border2)" : "rgba(59,130,246,.25)"}`,
                        color: isIndexed ? "var(--green)" : isIndexing ? "var(--txt2)" : "var(--blue)",
                        display: "flex", alignItems: "center", gap: 5,
                      }}
                      onMouseEnter={(e) => { if (!isIndexed && !isIndexing) { e.currentTarget.style.background = "var(--blue)"; e.currentTarget.style.color = "#fff" } }}
                      onMouseLeave={(e) => { if (!isIndexed && !isIndexing) { e.currentTarget.style.background = "var(--blue-dim)"; e.currentTarget.style.color = "var(--blue)" } }}
                    >
                      {isIndexed ? (
                        <><i className="ti ti-check" style={{ fontSize: 11 }} />Queued</>
                      ) : isIndexing ? (
                        <><i className="ti ti-loader-2" style={{ fontSize: 11, animation: "spin 1s linear infinite" }} />Indexing…</>
                      ) : (
                        <><i className="ti ti-download" style={{ fontSize: 11 }} />Index</>
                      )}
                    </button>
                  </div>
                )
              })}

              {filtered.length === 0 && !loading && (
                <div style={{ textAlign: "center", padding: "28px 0", color: "var(--txt2)", fontSize: 12 }}>
                  No repos match "{filter}"
                </div>
              )}

              {/* Load more */}
              {hasMore && !filter && repos.length > 0 && (
                <div style={{ padding: "12px", textAlign: "center" }}>
                  <button onClick={loadMore} disabled={loading}
                    style={{ background: "none", border: "1px solid var(--border2)", borderRadius: 6, padding: "6px 16px", fontSize: 11, color: "var(--txt2)", cursor: "pointer", transition: "all .15s" }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--blue)"; e.currentTarget.style.color = "var(--blue)" }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--txt2)" }}>
                    {loading ? "Loading…" : "Load more"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
