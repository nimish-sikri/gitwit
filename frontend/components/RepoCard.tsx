"use client"

import { useState } from "react"
import type { Repo } from "@/lib/types"
import { api } from "@/lib/api"
import { useToast } from "./Toast"

interface Props {
  repo: Repo
  selected: boolean
  onSelect: (repo_id: string) => void
  onDeleted: (repo_id: string) => void
}

function timeAgo(iso?: string): string {
  if (!iso) return ""
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function RepoCard({ repo, selected, onSelect, onDeleted }: Props) {
  const [deleting, setDeleting] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [hovered, setHovered] = useState(false)
  const toast = useToast()

  const repoName = repo.repo_url.replace(/^https?:\/\/[^/]+\//, "").replace(/\.git$/, "")
  const repoHost = (() => { try { return new URL(repo.repo_url).hostname } catch { return "" } })()
  const isReady    = repo.status === "ready"
  const isIndexing = repo.status === "indexing"
  const hasError   = repo.status === "error"

  async function handleRetry(e: React.MouseEvent) {
    e.stopPropagation()
    setRetrying(true)
    try {
      await api.reindexRepo(repo.repo_id)
      toast.success("Re-index queued")
    } catch { toast.error("Failed to queue re-index") }
    finally { setRetrying(false) }
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    toast.confirm(
      `Delete index for "${repoName.split("/").pop()}"? This cannot be undone.`,
      async () => {
        setDeleting(true)
        try { await api.deleteRepo(repo.repo_id); onDeleted(repo.repo_id); toast.success("Index deleted") }
        catch { toast.error("Failed to delete index") }
        finally { setDeleting(false) }
      },
      "Delete"
    )
  }

  const cardBg     = selected ? "var(--bg3)" : hovered ? "var(--bg2)" : "var(--bg2)"
  const cardBorder = selected ? "var(--blue)" : hovered ? "var(--border2)" : "var(--border)"

  return (
    <div
      onClick={() => isReady && onSelect(repo.repo_id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={(e) => { e.currentTarget.style.transform = "scale(.99)" }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)" }}
      style={{
        padding: "10px 11px", borderRadius: 8, marginBottom: 6,
        cursor: isReady ? "pointer" : "default",
        border: `1px solid ${cardBorder}`,
        background: cardBg,
        transition: "border-color .15s, background .15s",
        boxShadow: selected ? "0 0 0 1px rgba(59,130,246,.2)" : "none",
      }}
    >
      {/* Row 1: name + status badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--txt0)", fontFamily: "var(--mono)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {repoName.split("/").pop()}
        </span>
        {isReady && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 6px", borderRadius: 3, fontSize: 9, fontWeight: 600, background: "var(--green-dim)", color: "var(--green)", border: "1px solid rgba(34,197,94,.15)", flexShrink: 0, textTransform: "uppercase", letterSpacing: ".04em" }}>
            <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--green)", flexShrink: 0 }} />
            ready
          </span>
        )}
        {isIndexing && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 6px", borderRadius: 3, fontSize: 9, fontWeight: 600, background: "var(--amber-dim)", color: "var(--amber)", border: "1px solid rgba(245,158,11,.15)", flexShrink: 0, textTransform: "uppercase", letterSpacing: ".04em" }}>
            <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--amber)", flexShrink: 0, animation: "pulse 1.2s infinite" }} />
            indexing
          </span>
        )}
        {hasError && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 6px", borderRadius: 3, fontSize: 9, fontWeight: 600, background: "var(--red-dim)", color: "var(--red)", border: "1px solid rgba(239,68,68,.15)", flexShrink: 0, textTransform: "uppercase", letterSpacing: ".04em" }}>
            <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--red)", flexShrink: 0 }} />
            error
          </span>
        )}
      </div>

      {/* Row 2: owner/host */}
      <div style={{ fontSize: 10, color: "var(--txt2)", fontFamily: "var(--mono)", marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {repoHost} · {repoName.split("/").slice(0, -1).join("/")}
      </div>

      {/* Row 3: chunks + provider */}
      {isReady && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: repo.branch ? 5 : 8, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: "var(--txt2)" }}>
            <i className="ti ti-layers-intersect" style={{ fontSize: 9, color: "var(--txt2)" }} />
            {repo.total_chunks?.toLocaleString()} chunks
          </span>
          <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--border2)" }} />
          <span style={{ fontSize: 10, color: "var(--txt2)" }}>{repo.embed_provider}</span>
          <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--border2)" }} />
          <span style={{ fontSize: 10, color: "var(--txt2)" }}>{timeAgo(repo.indexed_at)}</span>
        </div>
      )}

      {/* Row 4: branch pill */}
      {isReady && repo.branch && (
        <div style={{ marginBottom: 8 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--blue)", fontFamily: "var(--mono)", background: "var(--blue-dim)", border: "1px solid rgba(59,130,246,.18)", borderRadius: 4, padding: "2px 7px" }}>
            <i className="ti ti-git-branch" style={{ fontSize: 9 }} />
            {repo.branch}
          </span>
        </div>
      )}

      {/* Progress bar */}
      {isIndexing && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 10, color: "var(--txt2)" }}>{repo.progress?.message || "Starting…"}</span>
            {(repo.progress?.pct ?? 0) > 0 && (
              <span style={{ fontSize: 10, color: "var(--blue)", fontFamily: "var(--mono)" }}>{repo.progress!.pct}%</span>
            )}
          </div>
          <div style={{ height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
            {(repo.progress?.pct ?? 0) > 0
              ? <div style={{ height: "100%", background: "var(--blue)", width: `${repo.progress!.pct}%`, borderRadius: 2, transition: "width .4s ease", animation: "pshimmer 2s infinite" }} />
              : <div style={{ height: "100%", width: "40%", borderRadius: 2, background: "linear-gradient(90deg, transparent, var(--blue), transparent)", animation: "indeterminate 1.4s ease infinite" }} />
            }
          </div>
        </div>
      )}

      {/* Error message */}
      {hasError && repo.progress?.message && (
        <div style={{ fontSize: 10, color: "var(--red)", background: "var(--red-dim)", border: "1px solid rgba(239,68,68,.12)", borderRadius: 4, padding: "5px 8px", marginBottom: 8, lineHeight: 1.5 }}>
          {repo.progress.message}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
        {isReady && (
          <button
            onClick={(e) => { e.stopPropagation(); onSelect(repo.repo_id) }}
            style={{ flex: 1, background: selected ? "var(--blue)" : "var(--blue-dim)", border: "1px solid rgba(59,130,246,.25)", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 600, color: selected ? "#fff" : "var(--blue)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, transition: "all .15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--blue)"; e.currentTarget.style.color = "#fff" }}
            onMouseLeave={(e) => { e.currentTarget.style.background = selected ? "var(--blue)" : "var(--blue-dim)"; e.currentTarget.style.color = selected ? "#fff" : "var(--blue)" }}
          >
            <i className="ti ti-message-circle-2" style={{ fontSize: 12 }} />
            Chat
          </button>
        )}
        {(isReady || hasError) && (
          <button
            onClick={handleRetry} disabled={retrying} title="Re-index this repo"
            style={{ flex: 1, background: "none", border: "1px solid var(--border2)", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 500, color: "var(--txt1)", cursor: retrying ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, opacity: retrying ? 0.5 : 1, transition: "all .15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--blue)"; e.currentTarget.style.color = "var(--blue)" }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--txt1)" }}
          >
            <i className="ti ti-refresh" style={{ fontSize: 12, ...(retrying ? { animation: "spin 1s linear infinite" } : {}) }} />
            {retrying ? "Re-indexing…" : "Re-index"}
          </button>
        )}
        <button
          onClick={handleDelete} disabled={deleting} title="Delete index"
          style={{ width: 28, height: 28, background: "none", border: "1px solid var(--border2)", borderRadius: 6, fontSize: 13, color: "var(--txt2)", cursor: "pointer", display: "grid", placeItems: "center", transition: "all .15s", flexShrink: 0 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--red)"; e.currentTarget.style.borderColor = "var(--red)" }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--txt2)"; e.currentTarget.style.borderColor = "var(--border2)" }}
        >
          {deleting ? <i className="ti ti-loader-2" style={{ fontSize: 12, animation: "spin 1s linear infinite" }} /> : <i className="ti ti-x" style={{ fontSize: 13 }} />}
        </button>
      </div>
    </div>
  )
}
