"use client"

import { useState, useRef } from "react"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { vscDarkPlus, vs } from "react-syntax-highlighter/dist/esm/styles/prism"
import { api } from "@/lib/api"
import { useTheme } from "@/lib/useTheme"
import type { SearchResult } from "@/lib/types"

interface Props { repoId: string; onAskAbout?: (text: string) => void }

const LANG_COLOR: Record<string, string> = {
  python: "#3b82f6", typescript: "#60a5fa", javascript: "#f59e0b",
  go: "#22d3ee", rust: "#f97316", java: "#ef4444",
  cs: "#a78bfa", cpp: "#a78bfa", c: "#6366f1", ruby: "#f43f5e",
  kotlin: "#f59e0b", swift: "#f97316", php: "#8b5cf6",
}

const SUGGESTIONS = [
  "authentication login flow",
  "error handling exceptions",
  "database query connection",
  "API endpoint handler",
  "initialization startup",
]

function ScoreBar({ label, rank, maxRank, color }: { label: string; rank: number; maxRank: number; color: string }) {
  const pct = rank > 0 ? Math.max(10, 100 - ((rank - 1) / maxRank) * 90) : 0
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 9, color: "var(--txt2)", width: 34, textAlign: "right", flexShrink: 0 }}>{label}</span>
      <div style={{ width: 56, height: 3, background: "var(--border2)", borderRadius: 2, overflow: "hidden" }}>
        {rank > 0 && <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width .3s" }} />}
      </div>
      <span style={{ fontSize: 9, fontFamily: "var(--mono)", color: rank > 0 ? color : "var(--txt2)", flexShrink: 0 }}>
        {rank > 0 ? `#${rank}` : "—"}
      </span>
    </div>
  )
}

function ResultCard({ result, rank, maxRank, onChatAbout }: {
  result: SearchResult; rank: number; maxRank: number
  onChatAbout: (text: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const langColor = LANG_COLOR[result.language?.toLowerCase()] ?? "var(--txt2)"
  const basename = result.file_path.replace(/\\/g, "/").split("/").pop() ?? result.file_path
  const dirPart  = result.file_path.replace(/\\/g, "/").split("/").slice(0, -1).join("/")
  const isTop3   = rank <= 3

  function copy(e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(result.text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div style={{
      background: "var(--bg2)", border: `1px solid ${isTop3 ? "rgba(59,130,246,.2)" : "var(--border2)"}`,
      borderRadius: 9, overflow: "hidden", transition: "border-color .15s",
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ padding: "10px 12px", display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}
        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,.02)"}
        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
      >
        {/* Rank */}
        <div style={{
          width: 24, height: 24, borderRadius: 6, flexShrink: 0, marginTop: 1,
          background: isTop3 ? "var(--blue-dim)" : "var(--bg3)",
          border: `1px solid ${isTop3 ? "rgba(59,130,246,.25)" : "var(--border2)"}`,
          display: "grid", placeItems: "center",
          fontSize: 10, fontWeight: 700, color: isTop3 ? "var(--blue)" : "var(--txt2)",
        }}>
          {rank}
        </div>

        {/* File + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600, color: "var(--txt0)" }}>{basename}</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--blue)", background: "var(--blue-dim)", border: "1px solid rgba(59,130,246,.15)", borderRadius: 3, padding: "0 5px" }}>
              L{result.start_line}–{result.end_line}
            </span>
            {result.language && (
              <span style={{ fontSize: 10, color: langColor, background: `${langColor}18`, border: `1px solid ${langColor}30`, borderRadius: 3, padding: "0 5px", fontFamily: "var(--mono)" }}>
                {result.language}
              </span>
            )}
            {result.chunk_type && result.chunk_type !== "fallback" && (
              <span style={{ fontSize: 10, color: "var(--txt2)", background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 3, padding: "0 5px", fontFamily: "var(--mono)" }}>
                {result.chunk_type}
              </span>
            )}
          </div>
          {result.node_name && (
            <div style={{ fontSize: 11, color: "var(--txt1)", fontFamily: "var(--mono)", marginBottom: 3 }}>
              <span style={{ color: "var(--txt2)" }}>fn </span>{result.node_name}
            </div>
          )}
          <div style={{ fontSize: 10, color: "var(--txt2)", fontFamily: "var(--mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {dirPart}
          </div>
        </div>

        {/* Scores */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3, flexShrink: 0 }}>
          <ScoreBar label="Dense" rank={result.dense_rank} maxRank={maxRank} color="#60a5fa" />
          <ScoreBar label="BM25"  rank={result.bm25_rank}  maxRank={maxRank} color="#4ade80" />
        </div>

        <i className={`ti ${expanded ? "ti-chevron-up" : "ti-chevron-down"}`}
           style={{ fontSize: 11, color: "var(--txt2)", flexShrink: 0, marginTop: 6 }} />
      </div>

      {/* Expanded code */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 12px", background: "var(--bg1)", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 10, color: "var(--txt2)", fontFamily: "var(--mono)" }}>{result.file_path}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={(e) => { e.stopPropagation(); onChatAbout(`Explain ${result.node_name || basename} in ${basename}`) }}
                style={{ background: "var(--blue-dim)", border: "1px solid rgba(59,130,246,.2)", borderRadius: 5, padding: "3px 9px", fontSize: 10, color: "var(--blue)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, transition: "all .12s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--blue)"; e.currentTarget.style.color = "#fff" }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--blue-dim)"; e.currentTarget.style.color = "var(--blue)" }}
              >
                <i className="ti ti-messages" style={{ fontSize: 10 }} /> Ask about this
              </button>
              <button
                onClick={copy}
                style={{ background: "none", border: "1px solid var(--border2)", borderRadius: 5, padding: "3px 9px", fontSize: 10, color: copied ? "var(--green)" : "var(--txt2)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, transition: "all .12s" }}
                onMouseEnter={(e) => { if (!copied) { e.currentTarget.style.borderColor = "var(--txt2)"; e.currentTarget.style.color = "var(--txt0)" } }}
                onMouseLeave={(e) => { if (!copied) { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--txt2)" } }}
              >
                <i className={`ti ti-${copied ? "check" : "copy"}`} style={{ fontSize: 10 }} />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            <SyntaxHighlighter
              language={result.language || "text"}
              style={theme === "light" ? vs : vscDarkPlus}
              customStyle={{ margin: 0, borderRadius: 0, fontSize: 11.5, lineHeight: 1.7, background: theme === "light" ? "#f6f8fa" : "#0d0d0d", padding: "14px 16px" }}
              codeTagProps={{ style: { fontFamily: "var(--mono)" } }}
              showLineNumbers
              startingLineNumber={result.start_line}
              lineNumberStyle={{ color: "#484f58", fontSize: 10, minWidth: 36, paddingRight: 12, userSelect: "none" }}
            >
              {result.text}
            </SyntaxHighlighter>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SearchPanel({ repoId, onAskAbout }: Props) {
  const theme = useTheme()
  const [query, setQuery]       = useState("")
  const [topK, setTopK]         = useState(10)
  const [results, setResults]   = useState<SearchResult[] | null>(null)
  const [langFilter, setLangFilter] = useState<string | null>(null)
  const [searching, setSearching]   = useState(false)
  const [error, setError]       = useState("")
  const [lastQuery, setLastQuery]   = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSearch(e?: React.FormEvent, overrideQuery?: string) {
    e?.preventDefault()
    const q = (overrideQuery ?? query).trim()
    if (!q || searching) return
    setSearching(true); setError(""); setLangFilter(null)
    try {
      const data = await api.search(repoId, q, topK)
      setResults(data); setLastQuery(q)
      if (overrideQuery) setQuery(overrideQuery)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed")
    } finally { setSearching(false) }
  }

  const languages = results
    ? [...new Set(results.map((r) => r.language).filter(Boolean))]
    : []

  const displayed = langFilter
    ? results!.filter((r) => r.language === langFilter)
    : results ?? []

  const maxRank = Math.max(...(displayed.map((r) => Math.max(r.dense_rank, r.bm25_rank)).filter((n) => n > 0)), 1)

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Search bar */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg1)", flexShrink: 0 }}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 8 }}>
          <div
            style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, background: "var(--bg0)", border: "1px solid var(--border2)", borderRadius: 8, padding: "8px 12px", transition: "border-color .15s, box-shadow .15s" }}
            onFocusCapture={(e) => { e.currentTarget.style.borderColor = "var(--blue)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59,130,246,.1)" }}
            onBlurCapture={(e)  => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.boxShadow = "none" }}
          >
            <i className="ti ti-search" style={{ fontSize: 13, color: "var(--txt2)", flexShrink: 0 }} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search functions, classes, patterns…"
              style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 13, color: "var(--txt0)" }}
            />
            {query && (
              <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus() }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--txt2)", padding: 0, display: "grid", placeItems: "center" }}>
                <i className="ti ti-x" style={{ fontSize: 12 }} />
              </button>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg0)", border: "1px solid var(--border2)", borderRadius: 8, padding: "0 10px" }}>
            <span style={{ fontSize: 10, color: "var(--txt2)" }}>Top</span>
            <select value={topK} onChange={(e) => setTopK(Number(e.target.value))}
              style={{ background: "none", border: "none", outline: "none", fontSize: 12, color: "var(--txt1)", cursor: "pointer", padding: "0 2px" }}>
              {[5, 10, 15, 20].map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <button type="submit" disabled={searching || !query.trim()} style={{
            background: "var(--blue)", border: "none", borderRadius: 8, padding: "8px 18px",
            fontSize: 12, fontWeight: 600, color: "#fff",
            cursor: searching || !query.trim() ? "not-allowed" : "pointer",
            opacity: searching || !query.trim() ? .5 : 1, transition: "opacity .15s", whiteSpace: "nowrap",
          }}>
            {searching ? "Searching…" : "Search"}
          </button>
        </form>
      </div>

      {/* Results area */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>

        {/* Empty state */}
        {results === null && !searching && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "40px 20px" }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: "var(--bg2)", border: "1px solid var(--border2)", display: "grid", placeItems: "center" }}>
              <i className="ti ti-database-search" style={{ fontSize: 24, color: "var(--txt2)" }} />
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--txt1)", marginBottom: 6 }}>Search the codebase</p>
              <p style={{ fontSize: 12, color: "var(--txt2)", lineHeight: 1.6, maxWidth: 340 }}>
                Hybrid search — combines semantic (dense) and keyword (BM25) retrieval with RRF fusion
              </p>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", maxWidth: 480 }}>
              <p style={{ width: "100%", textAlign: "center", fontSize: 10, color: "var(--txt2)", marginBottom: 2 }}>Try a search:</p>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSearch(undefined, s)}
                  style={{
                    background: "var(--bg2)", border: "1px solid var(--border2)", borderRadius: 20,
                    padding: "5px 12px", fontSize: 11, color: "var(--txt1)", cursor: "pointer",
                    transition: "all .12s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--blue)"; e.currentTarget.style.color = "var(--blue)" }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--txt1)" }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div style={{ background: "var(--red-dim)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 7, padding: "8px 12px", fontSize: 12, color: "var(--red)", marginBottom: 12 }}>
            {error}
          </div>
        )}

        {results !== null && (
          <>
            {/* Results header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "var(--txt2)" }}>
                  {displayed.length} result{displayed.length !== 1 ? "s" : ""}
                </span>
                <span style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--txt0)", background: "var(--bg2)", border: "1px solid var(--border2)", borderRadius: 5, padding: "1px 8px" }}>
                  "{lastQuery}"
                </span>
              </div>
              {/* Language filter */}
              {languages.length > 1 && (
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  <button
                    onClick={() => setLangFilter(null)}
                    style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, border: `1px solid ${!langFilter ? "var(--blue)" : "var(--border2)"}`, background: !langFilter ? "var(--blue-dim)" : "none", color: !langFilter ? "var(--blue)" : "var(--txt2)", cursor: "pointer" }}>
                    All
                  </button>
                  {languages.map((lang) => (
                    <button key={lang} onClick={() => setLangFilter(lang === langFilter ? null : lang)}
                      style={{
                        fontSize: 10, padding: "2px 8px", borderRadius: 20, fontFamily: "var(--mono)", cursor: "pointer",
                        border: `1px solid ${langFilter === lang ? (LANG_COLOR[lang.toLowerCase()] ?? "var(--blue)") : "var(--border2)"}`,
                        background: langFilter === lang ? `${LANG_COLOR[lang.toLowerCase()] ?? "var(--blue)"}18` : "none",
                        color: langFilter === lang ? (LANG_COLOR[lang.toLowerCase()] ?? "var(--blue)") : "var(--txt2)",
                        transition: "all .12s",
                      }}>
                      {lang}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {displayed.map((r, i) => (
                <ResultCard
                  key={r.chunk_id} result={r} rank={i + 1} maxRank={maxRank}
                  onChatAbout={(text) => onAskAbout?.(text)}
                />
              ))}
              {displayed.length === 0 && (
                <div style={{ textAlign: "center", padding: "32px 0", color: "var(--txt2)", fontSize: 12 }}>
                  No results{langFilter ? ` for language "${langFilter}"` : ""}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
