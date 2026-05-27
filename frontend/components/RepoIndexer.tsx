"use client"

import { useState } from "react"
import { api } from "@/lib/api"

interface Props { onIndexed: (repo_id: string) => void }

export default function RepoIndexer({ onIndexed }: Props) {
  const [url, setUrl]       = useState("")
  const [branch, setBranch] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    setLoading(true); setError("")
    try {
      const res = await api.indexRepo(url.trim(), branch.trim() || undefined)
      onIndexed(res.repo_id)
      setUrl(""); setBranch("")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start indexing")
    } finally { setLoading(false) }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "var(--bg0)", border: "1px solid var(--border2)",
    borderRadius: 7, padding: "7px 10px", fontSize: 12, color: "var(--txt0)",
    fontFamily: "var(--mono)", outline: "none", transition: "border-color .15s",
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="url"
        placeholder="github.com or bitbucket URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        required
        style={{ ...inputStyle, marginBottom: 6 }}
        onFocus={(e) => e.currentTarget.style.borderColor = "var(--blue)"}
        onBlur={(e)  => e.currentTarget.style.borderColor = "var(--border2)"}
      />
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="text"
          placeholder="branch (optional)"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          style={{ ...inputStyle, width: undefined, flex: 1, color: "var(--txt1)" }}
          onFocus={(e) => e.currentTarget.style.borderColor = "var(--blue)"}
          onBlur={(e)  => e.currentTarget.style.borderColor = "var(--border2)"}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            background: "var(--blue)", border: "none", borderRadius: 7,
            padding: "7px 14px", fontSize: 12, fontWeight: 600, color: "#fff",
            cursor: loading ? "not-allowed" : "pointer", opacity: loading ? .7 : 1,
            whiteSpace: "nowrap", transition: "all .15s",
          }}
          onMouseEnter={(e) => { if (!loading) e.currentTarget.style.transform = "translateY(-1px)" }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)" }}
        >
          {loading ? "…" : "Index"}
        </button>
      </div>
      {error && <p style={{ fontSize: 11, color: "var(--red)", marginTop: 6 }}>{error}</p>}
    </form>
  )
}
