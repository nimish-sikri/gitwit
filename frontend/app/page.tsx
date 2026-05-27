"use client"

import { useEffect, useRef, useState } from "react"
import { useSession, signIn, signOut } from "next-auth/react"
import RepoBrowser from "@/components/RepoBrowser"
import ErrorBoundary from "@/components/ErrorBoundary"
import Logo from "@/components/Logo"
import RepoIndexer from "@/components/RepoIndexer"
import RepoCard from "@/components/RepoCard"
import ChatPanel from "@/components/ChatPanel"
import ReviewList from "@/components/ReviewList"
import FileTree from "@/components/FileTree"
import SearchPanel from "@/components/SearchPanel"
import SettingsPanel from "@/components/SettingsPanel"
import { api } from "@/lib/api"
import type { Repo } from "@/lib/types"

type Tab = "chat" | "reviews" | "files" | "search"

function shortRepoName(url: string): string {
  return url
    .replace(/^https?:\/\/[^/]+\//, "")
    .replace(/\.git$/, "")
}

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "chat",    icon: "ti-messages",        label: "Chat" },
  { id: "reviews", icon: "ti-git-pull-request", label: "Reviews" },
  { id: "files",   icon: "ti-folder-open",      label: "Files" },
  { id: "search",  icon: "ti-database-search",  label: "Search" },
]

export default function Dashboard() {
  const [repos, setRepos] = useState<Repo[]>([])
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>("chat")
  const [chatPrefill, setChatPrefill] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { data: session } = useSession()
  const [theme, setTheme] = useState<"dark" | "light">("dark")

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark"
    const html = document.documentElement
    html.classList.add("theme-transitioning")
    setTheme(next)
    localStorage.setItem("gitwit-theme", next)
    if (next === "light") {
      html.setAttribute("data-theme", "light")
    } else {
      html.removeAttribute("data-theme")
    }
    setTimeout(() => html.classList.remove("theme-transitioning"), 400)
  }

  const prevStatusRef = useRef<Record<string, string>>({})

  // Auto-sync OAuth access token to backend when user signs in
  // Also claim any repos that were indexed before user isolation was added
  useEffect(() => {
    if (!session) return
    const s = session as typeof session & { accessToken?: string; provider?: string }

    // Sync git credentials
    if (s.accessToken) {
      const payload: Record<string, string> = {}
      if (s.provider === "github")    payload.github_token           = s.accessToken
      if (s.provider === "bitbucket") payload.bitbucket_app_password = s.accessToken
      if (Object.keys(payload).length > 0) api.updateSettings(payload).catch(() => {})
    }

    // Claim all unowned (legacy) repos for this user
    api.claimUnownedRepos().catch(() => {})
  }, [session])

  useEffect(() => {
    // Sync theme from localStorage after hydration (avoids SSR mismatch)
    const saved = localStorage.getItem("gitwit-theme") as "dark" | "light" | null
    if (saved && saved !== "dark") {
      setTheme(saved)
      // data-theme was already set by the inline script in layout.tsx
    }
  }, [])

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission()
    }
    loadRepos()
    const interval = setInterval(loadRepos, 5000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadRepos() {
    try {
      const data = await api.listRepos()

      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        for (const repo of data) {
          const prev = prevStatusRef.current[repo.repo_id]
          if (prev === "indexing" && repo.status === "ready") {
            new Notification("Indexing complete", {
              body: repo.repo_url.replace("https://github.com/", ""),
              icon: "/favicon.ico",
            })
          }
        }
      }
      prevStatusRef.current = Object.fromEntries(data.map((r) => [r.repo_id, r.status]))

      setRepos(data)
    } catch {
      // Silently ignore transient errors (backend restart, network blip)
    } finally {
      setLoading(false)
    }
  }

  function handleIndexed(repo_id: string) {
    setRepos((prev) => {
      if (prev.find((r) => r.repo_id === repo_id)) return prev
      return [...prev, { repo_id, repo_url: "", status: "indexing", progress: { status: "queued", message: "Queued…", pct: 0 } }]
    })
  }

  function handleDeleted(repo_id: string) {
    setRepos((prev) => prev.filter((r) => r.repo_id !== repo_id))
    if (selectedRepoId === repo_id) setSelectedRepoId(null)
  }

  function handleSelect(repo_id: string) {
    setSelectedRepoId(repo_id)
    setActiveTab("chat")
  }

  const selectedRepo = repos.find((r) => r.repo_id === selectedRepoId)

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--bg0)" }}>

      {/* ── Sidebar ── */}
      <div style={{ width: 300, minWidth: 300, background: "var(--bg1)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column" }}>

        {/* Brand */}
        <div style={{ padding: "16px 14px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
          <Logo size={34} radius={8} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, letterSpacing: "-0.03em", lineHeight: 1 }}>
              <span style={{ fontWeight: 500, color: "var(--txt1)" }}>Git</span>
              <span style={{ fontWeight: 800, color: "var(--txt0)" }}>Wit</span>
            </div>
            <div style={{ fontSize: 10, color: "var(--txt2)", marginTop: 3 }}>Chat with your code</div>
          </div>
        </div>

        {/* Add repo */}
        <div style={{ padding: "12px 10px", borderBottom: "1px solid var(--border)" }}>
          <RepoBrowser onIndexed={(repo_id, url) => {
            setRepos((p) => p.find((r) => r.repo_id === repo_id) ? p : [...p, { repo_id, repo_url: url, status: "indexing", progress: { status: "queued", message: "Queued…", pct: 0 } }])
          }} />
          <RepoIndexer onIndexed={handleIndexed} />
        </div>

        {/* Stats bar */}
        {repos.length > 0 && (
          <div style={{ display: "flex", padding: "8px 12px", gap: 0, borderBottom: "1px solid var(--border)" }}>
            {[
              { label: "Repos",  value: repos.length },
              { label: "Ready",  value: repos.filter((r) => r.status === "ready").length },
              { label: "Chunks", value: repos.reduce((s, r) => s + (r.total_chunks ?? 0), 0).toLocaleString() },
            ].map(({ label, value }, i) => (
              <div key={label} style={{ flex: 1, textAlign: "center", borderRight: i < 2 ? "1px solid var(--border)" : "none", padding: "2px 0" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--txt0)", fontFamily: "var(--mono)", lineHeight: 1.2 }}>{value}</div>
                <div style={{ fontSize: 9, color: "var(--txt2)", marginTop: 2, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Section header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px 6px" }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".07em", color: "var(--txt2)", textTransform: "uppercase" }}>Repositories</span>
          <span style={{ fontSize: 10, color: "var(--txt2)", background: "var(--bg2)", border: "1px solid var(--border)", padding: "1px 6px", borderRadius: 20, fontFamily: "var(--mono)" }}>{repos.length}</span>
        </div>

        {/* Repo list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 8px" }}>
          {loading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "4px 0" }}>
              {[1,2].map((i) => (
                <div key={i} style={{ height: 72, borderRadius: 8, background: "var(--bg2)", border: "1px solid var(--border)", opacity: .5, animation: "pulse 1.5s infinite" }} />
              ))}
            </div>
          )}
          {!loading && repos.length === 0 && (
            <div style={{ padding: "24px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 9, padding: "14px 12px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--txt0)", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <i className="ti ti-sparkles" style={{ fontSize: 12, color: "var(--blue)" }} /> Getting started
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[
                    { icon: "ti-brand-github", text: "Sign in to browse your repos" },
                    { icon: "ti-link", text: "Or paste any git URL above" },
                    { icon: "ti-messages", text: "Chat, search & review code" },
                  ].map((item, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: "var(--txt2)" }}>
                      <i className={`ti ${item.icon}`} style={{ fontSize: 12, color: "var(--txt2)", flexShrink: 0 }} />
                      {item.text}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {repos.map((repo) => (
            <RepoCard
              key={repo.repo_id}
              repo={repo}
              selected={repo.repo_id === selectedRepoId}
              onSelect={handleSelect}
              onDeleted={handleDeleted}
            />
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: "10px 12px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
          {session ? (
            /* Signed in */
            <button
              onClick={() => { setRepos([]); setSelectedRepoId(null); signOut({ callbackUrl: "/signin" }) }}
              title="Sign out"
              style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, background: "none", border: "1px solid transparent", borderRadius: 7, padding: "4px 6px", cursor: "pointer", transition: "all .15s", textAlign: "left" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg2)"; e.currentTarget.style.borderColor = "var(--border2)" }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.borderColor = "transparent" }}
            >
              {session.user?.image ? (
                <img src={session.user.image} alt="" style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0 }} />
              ) : (
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--blue-dim)", border: "1px solid rgba(59,130,246,.25)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, color: "var(--blue)", flexShrink: 0 }}>
                  {session.user?.name?.[0]?.toUpperCase() ?? "U"}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--txt0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.user?.name ?? "User"}</div>
                <div style={{ fontSize: 10, color: "var(--txt2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Click to sign out</div>
              </div>
            </button>
          ) : (
            /* Sign in button */
            <button
              onClick={() => signIn()}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "var(--blue-dim)", border: "1px solid rgba(59,130,246,.25)", borderRadius: 7, padding: "7px 10px", fontSize: 12, fontWeight: 600, color: "var(--blue)", cursor: "pointer", transition: "all .15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--blue)"; e.currentTarget.style.color = "#fff" }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "var(--blue-dim)"; e.currentTarget.style.color = "var(--blue)" }}
            >
              <i className="ti ti-login" style={{ fontSize: 13 }} />
              Sign in
            </button>
          )}
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            style={{ width: 28, height: 28, background: "none", border: "1px solid transparent", borderRadius: 6, cursor: "pointer", color: "var(--txt2)", display: "grid", placeItems: "center", transition: "all .15s", flexShrink: 0 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg2)"; e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--txt0)" }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.color = "var(--txt2)" }}
          >
            <i className={`ti ti-${theme === "dark" ? "sun" : "moon"}`} style={{ fontSize: 14 }} />
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            style={{ width: 28, height: 28, background: "none", border: "1px solid transparent", borderRadius: 6, cursor: "pointer", color: "var(--txt2)", display: "grid", placeItems: "center", transition: "all .15s", flexShrink: 0 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg2)"; e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--txt0)" }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.color = "var(--txt2)" }}
          >
            <i className="ti ti-settings" style={{ fontSize: 14 }} />
          </button>
        </div>
      </div>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* ── Main ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg0)" }}>
        {selectedRepo ? (
          <>
            {/* Header */}
            <div style={{ borderBottom: "1px solid var(--border)", background: "var(--bg1)", flexShrink: 0 }}>
              {/* Top row: repo name + chips */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px 0", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 5, background: "var(--blue-dim)", border: "1px solid rgba(59,130,246,.2)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <i className="ti ti-git-branch" style={{ fontSize: 10, color: "var(--blue)" }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--txt0)", fontFamily: "var(--mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {shortRepoName(selectedRepo.repo_url)}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                  {selectedRepo.branch && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", background: "rgba(59,130,246,.08)", border: "1px solid rgba(59,130,246,.18)", borderRadius: 20, fontSize: 10, color: "var(--blue)", fontFamily: "var(--mono)", fontWeight: 500 }}>
                      <i className="ti ti-git-branch" style={{ fontSize: 9 }} />{selectedRepo.branch}
                    </span>
                  )}
                  {selectedRepo.last_commit && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", background: "var(--bg2)", border: "1px solid var(--border2)", borderRadius: 20, fontSize: 10, color: "var(--txt2)", fontFamily: "var(--mono)" }}>
                      <i className="ti ti-git-commit" style={{ fontSize: 9 }} />{selectedRepo.last_commit.slice(0, 7)}
                    </span>
                  )}
                  {selectedRepo.total_chunks != null && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", background: "var(--bg2)", border: "1px solid var(--border2)", borderRadius: 20, fontSize: 10, color: "var(--txt2)", fontFamily: "var(--mono)" }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--green)" }} />
                      {selectedRepo.total_chunks.toLocaleString()} chunks
                    </span>
                  )}
                  {selectedRepo.embed_provider && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", background: "var(--bg2)", border: "1px solid var(--border2)", borderRadius: 20, fontSize: 10, color: "var(--txt2)" }}>
                      {selectedRepo.embed_provider}
                    </span>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", paddingLeft: 12, marginTop: 4 }}>
                {TABS.map((tab) => {
                  const active = activeTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      style={{
                        padding: "8px 14px", fontSize: 12, fontWeight: active ? 600 : 400,
                        background: "none", border: "none",
                        borderBottom: `2px solid ${active ? "var(--blue)" : "transparent"}`,
                        color: active ? "var(--txt0)" : "var(--txt2)",
                        cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                        transition: "color .15s, border-color .15s", marginBottom: -1,
                        letterSpacing: active ? "-.01em" : 0,
                      }}
                      onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = "var(--txt1)" }}
                      onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = "var(--txt2)" }}
                    >
                      <i className={`ti ${tab.icon}`} style={{ fontSize: 12 }} />
                      {tab.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Content panel */}
            <ErrorBoundary>
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              {activeTab === "chat"    && <ChatPanel   key={selectedRepoId} repoId={selectedRepoId!} prefill={chatPrefill} onPrefillConsumed={() => setChatPrefill(null)} />}
              {activeTab === "reviews" && <ReviewList  key={selectedRepoId} repoId={selectedRepoId!} />}
              {activeTab === "files"   && <FileTree    key={selectedRepoId} repoId={selectedRepoId!} onAskAbout={(q) => { setChatPrefill(q); setActiveTab("chat") }} />}
              {activeTab === "search"  && <SearchPanel key={selectedRepoId} repoId={selectedRepoId!} onAskAbout={(q) => { setChatPrefill(q); setActiveTab("chat") }} />}
            </div>
            </ErrorBoundary>
          </>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0, padding: 40, animation: "fadein .3s ease" }}>
            {/* Logo mark */}
            <div style={{ marginBottom: 20 }}>
              <Logo size={52} radius={12} />
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 400, color: "var(--txt0)", marginBottom: 8, letterSpacing: "-0.03em" }}>
              <span style={{ color: "var(--txt1)", fontWeight: 400 }}>Git</span>
              <span style={{ fontWeight: 800 }}>Wit</span>
            </h2>
            <p style={{ fontSize: 13, color: "var(--txt2)", lineHeight: 1.7, textAlign: "center", maxWidth: 360, marginBottom: 32 }}>
              Index any GitHub or Bitbucket repo and ask questions in plain English — every answer cites the exact file and line.
            </p>
            {/* Feature grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "100%", maxWidth: 440 }}>
              {[
                { icon: "ti-messages", title: "AI Chat", desc: "Ask anything, get cited answers" },
                { icon: "ti-git-pull-request", title: "PR Reviews", desc: "Auto-review pull requests" },
                { icon: "ti-folder-open", title: "File Explorer", desc: "Browse indexed code chunks" },
                { icon: "ti-database-search", title: "Hybrid Search", desc: "Semantic + keyword fusion" },
              ].map((f) => (
                <div key={f.title} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 14px", transition: "border-color .15s" }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--border2)"}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}
                >
                  <i className={`ti ${f.icon}`} style={{ fontSize: 18, color: "var(--blue)", display: "block", marginBottom: 8 }} />
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--txt0)", marginBottom: 3 }}>{f.title}</div>
                  <div style={{ fontSize: 11, color: "var(--txt2)", lineHeight: 1.4 }}>{f.desc}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: "var(--txt2)", marginTop: 24 }}>Select a repository from the sidebar to begin</p>
          </div>
        )}
      </div>
    </div>
  )
}
