"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import type { ReviewEntry, ReviewComment } from "@/lib/types"

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code style={{ fontFamily: "var(--mono)", fontSize: 11, background: "var(--bg0)", border: "1px solid var(--border2)", borderRadius: 4, padding: "1px 6px", color: "#7dd3fc", userSelect: "all" }}>
      {children}
    </code>
  )
}

function TriggerPanel({ prUrl, setPrUrl, triggering, triggerErr, triggerOk, onSubmit }: {
  prUrl: string; setPrUrl: (v: string) => void
  triggering: boolean; triggerErr: string; triggerOk: string
  onSubmit: (e: React.FormEvent) => void
}) {
  const [tab, setTab] = useState<"manual" | "webhook" | null>(null)
  const apiBase = typeof window !== "undefined" ? `${window.location.protocol}//${window.location.hostname}:8001` : "http://your-server:8001"

  return (
    <div style={{ borderBottom: "1px solid var(--border)", background: "var(--bg1)", flexShrink: 0 }}>
      {/* Mode picker */}
      {!tab && (
        <div style={{ padding: "20px 16px", display: "flex", gap: 10 }}>
          {([
            { id: "manual",  icon: "ti-link",    title: "Paste PR URL",        desc: "Manually trigger a review by pasting any PR link" },
            { id: "webhook", icon: "ti-webhook", title: "Configure Webhook",   desc: "Auto-review every PR via GitHub or Bitbucket webhook" },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              onClick={() => setTab(opt.id)}
              style={{
                flex: 1, background: "var(--bg2)", border: "1px solid var(--border2)",
                borderRadius: 10, padding: "16px 14px", cursor: "pointer",
                textAlign: "left", transition: "all .15s", display: "flex", flexDirection: "column", gap: 8,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--blue)"; e.currentTarget.style.background = "var(--bg3)" }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.background = "var(--bg2)" }}
            >
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--blue-dim)", border: "1px solid rgba(59,130,246,.2)", display: "grid", placeItems: "center" }}>
                <i className={`ti ${opt.icon}`} style={{ fontSize: 15, color: "var(--blue)" }} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--txt0)", marginBottom: 3 }}>{opt.title}</div>
                <div style={{ fontSize: 11, color: "var(--txt2)", lineHeight: 1.5 }}>{opt.desc}</div>
              </div>
              <div style={{ fontSize: 11, color: "var(--blue)", display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                Select <i className="ti ti-arrow-right" style={{ fontSize: 10 }} />
              </div>
            </button>
          ))}
        </div>
      )}

      {tab && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
          <button
            onClick={() => setTab(null as unknown as "manual")}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--txt2)", display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 0", transition: "color .15s" }}
            onMouseEnter={(e) => e.currentTarget.style.color = "var(--txt0)"}
            onMouseLeave={(e) => e.currentTarget.style.color = "var(--txt2)"}
          >
            <i className="ti ti-arrow-left" style={{ fontSize: 11 }} /> Back
          </button>
          <span style={{ color: "var(--border2)" }}>·</span>
          <i className={`ti ${tab === "manual" ? "ti-link" : "ti-webhook"}`} style={{ fontSize: 12, color: "var(--blue)" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--txt0)" }}>
            {tab === "manual" ? "Paste PR URL" : "Configure Webhook"}
          </span>
        </div>
      )}

      <div style={{ padding: tab ? "14px 16px" : "0" }}>
        {tab === "manual" && tab && (
          <>
            <form onSubmit={onSubmit} style={{ display: "flex", gap: 8 }}>
              <input
                value={prUrl}
                onChange={(e) => setPrUrl(e.target.value)}
                placeholder="Paste a PR URL — GitHub, Bitbucket Server or Cloud"
                style={{
                  flex: 1, background: "var(--bg0)", border: "1px solid var(--border2)",
                  borderRadius: 7, padding: "8px 11px", fontSize: 12, color: "var(--txt0)",
                  fontFamily: "var(--mono)", outline: "none", transition: "border-color .15s",
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = "var(--blue)"}
                onBlur={(e)  => e.currentTarget.style.borderColor = "var(--border2)"}
              />
              <button type="submit" disabled={triggering || !prUrl.trim()} style={{
                background: "var(--blue)", border: "none", borderRadius: 7,
                padding: "8px 18px", fontSize: 12, fontWeight: 600, color: "#fff",
                cursor: triggering || !prUrl.trim() ? "not-allowed" : "pointer",
                opacity: triggering || !prUrl.trim() ? .5 : 1, whiteSpace: "nowrap", flexShrink: 0,
              }}>
                {triggering ? "Queuing…" : "Review PR"}
              </button>
            </form>
            {triggerErr && <p style={{ fontSize: 11, color: "var(--red)", marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}><i className="ti ti-alert-circle" style={{ fontSize: 11 }} />{triggerErr}</p>}
            {triggerOk  && <p style={{ fontSize: 11, color: "var(--green)", marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}><i className="ti ti-check" style={{ fontSize: 11 }} />{triggerOk}</p>}
            <p style={{ fontSize: 10, color: "var(--txt2)", marginTop: 7, lineHeight: 1.6 }}>
              Supports: <span style={{ color: "var(--txt1)" }}>github.com/.../pull/123</span>
              {" · "}
              <span style={{ color: "var(--txt1)" }}>bitbucket.company.com/projects/.../pull-requests/123</span>
              {" · "}
              <span style={{ color: "var(--txt1)" }}>bitbucket.org/.../pull-requests/123</span>
            </p>
          </>
        )}

        {tab === "webhook" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* GitHub */}
            <div style={{ background: "var(--bg0)", border: "1px solid var(--border2)", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "var(--bg2)", borderBottom: "1px solid var(--border)" }}>
                <i className="ti ti-brand-github" style={{ fontSize: 14, color: "var(--txt1)" }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--txt0)" }}>GitHub Webhook</span>
              </div>
              <div style={{ padding: "12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                <Row label="Webhook URL">
                  <Code>{apiBase}/api/v1/webhooks/github</Code>
                </Row>
                <Row label="Content type"><Code>application/json</Code></Row>
                <Row label="Events">
                  <span style={{ fontSize: 11, color: "var(--txt1)" }}>Pull requests → <em>opened, synchronize, reopened</em></span>
                </Row>
                <Row label="Secret">
                  <span style={{ fontSize: 11, color: "var(--txt2)" }}>Optional — set in Settings → GitHub Token</span>
                </Row>
                <div style={{ fontSize: 10, color: "var(--txt2)", lineHeight: 1.6, paddingTop: 4, borderTop: "1px solid var(--border)" }}>
                  Go to <strong style={{ color: "var(--txt1)" }}>Repository → Settings → Webhooks → Add webhook</strong>
                </div>
              </div>
            </div>

            {/* Bitbucket Server */}
            <div style={{ background: "var(--bg0)", border: "1px solid var(--border2)", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "var(--bg2)", borderBottom: "1px solid var(--border)" }}>
                <i className="ti ti-brand-bitbucket" style={{ fontSize: 14, color: "#2684ff" }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--txt0)" }}>Bitbucket Server / Data Center</span>
              </div>
              <div style={{ padding: "12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                <Row label="Webhook URL">
                  <Code>{apiBase}/api/v1/webhooks/bitbucket</Code>
                </Row>
                <Row label="Events">
                  <span style={{ fontSize: 11, color: "var(--txt1)" }}>Pull request opened · Pull request modified</span>
                </Row>
                <Row label="Secret">
                  <span style={{ fontSize: 11, color: "var(--txt2)" }}>Optional — set in Settings → Bitbucket section</span>
                </Row>
                <div style={{ fontSize: 10, color: "var(--txt2)", lineHeight: 1.6, paddingTop: 4, borderTop: "1px solid var(--border)" }}>
                  Go to <strong style={{ color: "var(--txt1)" }}>Repository → Settings → Webhooks</strong> (requires repo admin access)
                </div>
              </div>
            </div>

            {/* Bitbucket Cloud */}
            <div style={{ background: "var(--bg0)", border: "1px solid var(--border2)", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "var(--bg2)", borderBottom: "1px solid var(--border)" }}>
                <i className="ti ti-brand-bitbucket" style={{ fontSize: 14, color: "#2684ff" }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--txt0)" }}>Bitbucket Cloud</span>
              </div>
              <div style={{ padding: "12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                <Row label="Webhook URL">
                  <Code>{apiBase}/api/v1/webhooks/bitbucket</Code>
                </Row>
                <Row label="Triggers">
                  <span style={{ fontSize: 11, color: "var(--txt1)" }}>Pull request created · Pull request updated</span>
                </Row>
                <div style={{ fontSize: 10, color: "var(--txt2)", lineHeight: 1.6, paddingTop: 4, borderTop: "1px solid var(--border)" }}>
                  Go to <strong style={{ color: "var(--txt1)" }}>Repository Settings → Webhooks → Add webhook</strong>
                </div>
              </div>
            </div>

            <p style={{ fontSize: 10, color: "var(--txt2)", lineHeight: 1.6 }}>
              <i className="ti ti-info-circle" style={{ fontSize: 11 }} />
              {" "}If running locally, use <span style={{ color: "var(--txt1)" }}>ngrok http 8001</span> to get a public URL for the webhook.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: "var(--txt2)", textTransform: "uppercase", letterSpacing: ".04em", width: 90, flexShrink: 0, paddingTop: 2 }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}

const SEV: Record<string, { bg: string; color: string; border: string; label: string; icon: string }> = {
  bug:        { bg: "var(--red-dim)",    color: "var(--red)",    border: "rgba(239,68,68,.15)",   label: "Bug",        icon: "ti-bug" },
  security:   { bg: "var(--orange-dim)", color: "var(--orange)", border: "rgba(249,115,22,.15)",  label: "Security",   icon: "ti-shield-exclamation" },
  suggestion: { bg: "var(--blue-dim)",   color: "#60a5fa",       border: "rgba(59,130,246,.15)",  label: "Suggestion", icon: "ti-bulb" },
  style:      { bg: "var(--bg2)",        color: "var(--txt2)",   border: "var(--border2)",         label: "Style",      icon: "ti-brush" },
}

function CommentBadge({ comment }: { comment: ReviewComment }) {
  const s = SEV[comment.severity] ?? SEV.suggestion
  return (
    <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 6, padding: "8px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600, color: s.color }}>
          <i className={`ti ${s.icon}`} style={{ fontSize: 10 }} />
          {s.label}
        </span>
        <span style={{ fontSize: 10, color: "var(--txt2)", fontFamily: "var(--mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>
          {comment.filename}
        </span>
      </div>
      <p style={{ fontSize: 12, color: "var(--txt1)", lineHeight: 1.55, margin: 0 }}>{comment.description}</p>
    </div>
  )
}

function buildPrUrl(repoFullName: string, prNumber: number, prUrl?: string): string {
  if (prUrl) return prUrl   // use stored URL (works for GitHub + Bitbucket)
  // Legacy fallback: construct GitHub URL
  const [owner] = repoFullName.split("/")
  if (/^[A-Z]{2,8}$/.test(owner)) return ""  // Bitbucket Server key — no URL without server base
  return `https://github.com/${repoFullName}/pull/${prNumber}`
}

function ReviewCard({ entry, repoId }: { entry: ReviewEntry; repoId: string }) {
  const [expanded, setExpanded] = useState(false)
  const [rereviewing, setRereviewing] = useState(false)
  const date = new Date(entry.reviewed_at).toLocaleString()
  const shortSha = entry.head_sha.slice(0, 7)
  const isRunning   = entry.status === "running"
  const isCompleted = entry.status === "completed"
  const isError     = entry.status === "error"
  const prUrl = buildPrUrl(entry.repo_full_name, entry.pr_number, entry.pr_url)

  async function handleRereview(e: React.MouseEvent) {
    e.stopPropagation()
    if (!prUrl) return
    setRereviewing(true)
    try { await api.triggerPrReview(repoId, prUrl) } catch { /* ignore */ }
    finally { setRereviewing(false) }
  }

  return (
    <div style={{ background: "var(--bg2)", border: "1px solid var(--border2)", borderRadius: 8, overflow: "hidden", animation: "fadein .2s ease" }}>
      <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div style={{ width: 22, height: 22, borderRadius: 5, background: "var(--bg3)", border: "1px solid var(--border2)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <i className="ti ti-git-pull-request" style={{ fontSize: 11, color: "var(--blue)" }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {prUrl ? (
                <a href={prUrl} target="_blank" rel="noopener noreferrer"
                  style={{ fontWeight: 600, fontSize: 13, color: "var(--blue)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}
                  onMouseEnter={(e) => e.currentTarget.style.textDecoration = "underline"}
                  onMouseLeave={(e) => e.currentTarget.style.textDecoration = "none"}>
                  PR #{entry.pr_number}
                  <i className="ti ti-external-link" style={{ fontSize: 10, opacity: .7 }} />
                </a>
              ) : (
                <span style={{ fontWeight: 600, fontSize: 13, color: "var(--txt0)" }}>PR #{entry.pr_number}</span>
              )}
              <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--txt2)" }}>{shortSha}</span>
              {isRunning && (
                <span style={{ background: "var(--amber-dim)", color: "var(--amber)", border: "1px solid rgba(245,158,11,.15)", borderRadius: 3, padding: "1px 6px", fontSize: 9, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase" }}>
                  Running…
                </span>
              )}
              {isCompleted && (
                <span style={{ background: "var(--green-dim)", color: "var(--green)", border: "1px solid rgba(34,197,94,.15)", borderRadius: 3, padding: "1px 6px", fontSize: 9, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase" }}>
                  Done
                </span>
              )}
              {isError && (
                <span style={{ background: "var(--red-dim)", color: "var(--red)", border: "1px solid rgba(239,68,68,.15)", borderRadius: 3, padding: "1px 6px", fontSize: 9, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase" }}>
                  Error
                </span>
              )}
            </div>
            <div style={{ fontSize: 10, color: "var(--txt2)", marginTop: 2 }}>{entry.repo_full_name} · {date}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {isCompleted && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{ fontSize: 11, color: "var(--txt2)", background: "none", border: "1px solid var(--border2)", borderRadius: 5, padding: "3px 9px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, transition: "all .12s" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--blue)"; e.currentTarget.style.color = "var(--blue)" }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--txt2)" }}
            >
              {entry.comment_count} issue{entry.comment_count !== 1 ? "s" : ""}
              <i className={`ti ${expanded ? "ti-chevron-up" : "ti-chevron-down"}`} style={{ fontSize: 10 }} />
            </button>
          )}
          {(isCompleted || isError) && prUrl && (
            <button
              onClick={handleRereview}
              disabled={rereviewing}
              title="Re-review this PR"
              style={{ fontSize: 11, color: "var(--txt2)", background: "none", border: "1px solid var(--border2)", borderRadius: 5, padding: "3px 9px", cursor: rereviewing ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 4, transition: "all .12s", opacity: rereviewing ? .5 : 1 }}
              onMouseEnter={(e) => { if (!rereviewing) { e.currentTarget.style.borderColor = "var(--blue)"; e.currentTarget.style.color = "var(--blue)" } }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--txt2)" }}
            >
              <i className="ti ti-refresh" style={{ fontSize: 11 }} />
              {rereviewing ? "Queuing…" : "Re-review"}
            </button>
          )}
        </div>
      </div>

      {isError && entry.error && (
        <div style={{ padding: "0 14px 10px" }}>
          <p style={{ fontSize: 11, color: "var(--red)", background: "var(--red-dim)", border: "1px solid rgba(239,68,68,.15)", borderRadius: 5, padding: "6px 10px", margin: 0 }}>
            {entry.error}
          </p>
        </div>
      )}

      {expanded && (
        <div style={{ borderTop: "1px solid var(--border2)", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
          {entry.comments.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--txt2)", display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
              <i className="ti ti-check" style={{ color: "var(--green)", fontSize: 14 }} />
              No issues found — clean PR.
            </p>
          ) : (
            entry.comments.map((c, i) => <CommentBadge key={i} comment={c} />)
          )}
        </div>
      )}
    </div>
  )
}

interface Props { repoId: string }

export default function ReviewList({ repoId }: Props) {
  const [reviews, setReviews]   = useState<ReviewEntry[]>([])
  const [loading, setLoading]   = useState(true)
  const [prUrl, setPrUrl]       = useState("")
  const [triggering, setTriggering] = useState(false)
  const [triggerErr, setTriggerErr] = useState("")
  const [triggerOk, setTriggerOk]   = useState("")

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const data = await api.listReviews(repoId)
        if (active) setReviews(data)
      } catch { /* ignore */ }
      finally { if (active) setLoading(false) }
    }
    load()
    const t = setInterval(load, 6000)
    return () => { active = false; clearInterval(t) }
  }, [repoId])

  async function handleTrigger(e: React.FormEvent) {
    e.preventDefault()
    if (!prUrl.trim()) return
    setTriggering(true); setTriggerErr(""); setTriggerOk("")
    try {
      const res = await api.triggerPrReview(repoId, prUrl.trim())
      setTriggerOk(`PR #${res.pr} queued for review on ${res.platform.replace("_", " ")}`)
      setPrUrl("")
    } catch (err) {
      setTriggerErr(err instanceof Error ? err.message : "Failed to trigger review")
    } finally { setTriggering(false) }
  }

  const allComments = reviews.flatMap((r) => r.comments)
  const stats = {
    bug:        allComments.filter((c) => c.severity === "bug").length,
    security:   allComments.filter((c) => c.severity === "security").length,
    suggestion: allComments.filter((c) => c.severity === "suggestion").length,
    style:      allComments.filter((c) => c.severity === "style").length,
  }
  const totalIssues = Object.values(stats).reduce((a, b) => a + b, 0)

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── Trigger panel ── */}
      <TriggerPanel
        prUrl={prUrl} setPrUrl={setPrUrl}
        triggering={triggering} triggerErr={triggerErr} triggerOk={triggerOk}
        onSubmit={handleTrigger}
      />

      {/* ── Stats bar ── */}
      {reviews.length > 0 && (
        <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg1)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: "var(--txt2)" }}>
            {reviews.length} PR{reviews.length !== 1 ? "s" : ""} · {totalIssues} issue{totalIssues !== 1 ? "s" : ""}
          </span>
          {(["bug", "security", "suggestion", "style"] as const).map((sev) => {
            const s = SEV[sev]; const count = stats[sev]
            if (!count) return null
            return (
              <span key={sev} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 4, padding: "3px 8px", fontSize: 10, fontWeight: 500, color: s.color }}>
                <i className={`ti ${s.icon}`} style={{ fontSize: 10 }} />
                {count} {s.label}{count !== 1 ? "s" : ""}
              </span>
            )
          })}
        </div>
      )}

      {/* ── Review list ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        {loading && <p style={{ fontSize: 12, color: "var(--txt2)", textAlign: "center", padding: "20px 0" }}>Loading…</p>}
        {!loading && reviews.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: "var(--bg2)", border: "1px solid var(--border2)", display: "grid", placeItems: "center" }}>
              <i className="ti ti-git-pull-request" style={{ fontSize: 24, color: "var(--txt2)" }} />
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--txt1)", marginBottom: 6 }}>No reviews yet</p>
              <p style={{ fontSize: 12, color: "var(--txt2)", lineHeight: 1.6 }}>
                Paste a PR URL or configure a webhook<br />to start getting AI-powered code reviews
              </p>
            </div>
          </div>
        )}
        {reviews.map((r, i) => <ReviewCard key={i} entry={r} repoId={repoId} />)}
      </div>
    </div>
  )
}
