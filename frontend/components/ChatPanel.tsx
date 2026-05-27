"use client"

import React, { useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { vscDarkPlus, vs } from "react-syntax-highlighter/dist/esm/styles/prism"
import { chatStreamGenerator } from "@/lib/api"
import { useTheme } from "@/lib/useTheme"
import type { ChatMessage, Citation } from "@/lib/types"
import CitationCard from "./CitationCard"

interface Props { repoId: string; prefill?: string | null; onPrefillConsumed?: () => void }

const CITATION_RE = /^(.+\.[a-zA-Z]{1,10}):L?(\d+)(?:-L?(\d+))?$/

function buildMdComponents(citations: Citation[], theme: "dark" | "light" = "dark") {
  const lookup = new Map<string, Citation>()
  for (const c of citations) {
    const base = c.file.replace(/\\/g, "/").split("/").pop() || c.file
    lookup.set(`${base}:${c.start_line}`, c)
  }
  return {
    pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    code({ className, children }: { className?: string; children?: React.ReactNode }) {
      const match = /language-(\w+)/.exec(className ?? "")
      if (match) {
        const code = String(children).replace(/\n$/, "")
        const [copied, setCopied] = useState(false)
        function copy() { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500) }
        return (
          <div style={{ border: "1px solid var(--border2)", borderRadius: 8, margin: "14px 0", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 14px", background: "var(--bg2)", borderBottom: "1px solid var(--border2)" }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, color: "var(--txt2)", letterSpacing: ".08em", textTransform: "uppercase" }}>{match[1]}</span>
              <button
                onClick={copy}
                style={{ background: "none", border: "1px solid var(--border2)", borderRadius: 5, padding: "2px 9px", fontSize: 10, color: copied ? "var(--green)" : "var(--txt2)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, transition: "all .15s", fontFamily: "inherit" }}
                onMouseEnter={(e) => { if (!copied) { e.currentTarget.style.borderColor = "var(--blue)"; e.currentTarget.style.color = "var(--blue)" } }}
                onMouseLeave={(e) => { if (!copied) { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--txt2)" } }}
              >
                <i className={`ti ti-${copied ? "check" : "copy"}`} style={{ fontSize: 10 }} /> {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <SyntaxHighlighter
              language={match[1]}
              style={theme === "light" ? vs : vscDarkPlus}
              customStyle={{ margin: 0, borderRadius: 0, fontSize: 12, lineHeight: 1.75, background: theme === "light" ? "#f6f8fa" : "#0d0d0d", padding: "14px 16px" }}
              codeTagProps={{ style: { fontFamily: "var(--mono)" } }}
            >
              {code}
            </SyntaxHighlighter>
          </div>
        )
      }
      const content = String(children).replace(/\n$/, "")
      const m = CITATION_RE.exec(content)
      if (m) {
        const base = m[1].replace(/\\/g, "/").split("/").pop() || m[1]
        const cit = lookup.get(`${base}:${m[2]}`)
        if (cit) return <CitationCard citation={cit} />
      }
      return <code style={{ fontFamily: "var(--mono)", fontSize: 12, background: "rgba(59,130,246,.1)", border: "1px solid rgba(59,130,246,.2)", borderRadius: 4, padding: "1px 6px", color: "var(--blue)" }}>{children}</code>
    },
    p:          ({ children }: { children?: React.ReactNode }) => <div style={{ fontSize: 13.5, color: "var(--txt0)", lineHeight: 1.7, marginBottom: 10 }}>{children}</div>,
    strong:     ({ children }: { children?: React.ReactNode }) => <strong style={{ color: "var(--txt0)", fontWeight: 600 }}>{children}</strong>,
    ul:         ({ children }: { children?: React.ReactNode }) => <ul style={{ paddingLeft: 20, marginBottom: 10 }}>{children}</ul>,
    ol:         ({ children }: { children?: React.ReactNode }) => <ol style={{ paddingLeft: 20, marginBottom: 10 }}>{children}</ol>,
    li:         ({ children }: { children?: React.ReactNode }) => <li style={{ fontSize: 13.5, color: "var(--txt1)", lineHeight: 1.7, marginBottom: 3 }}>{children}</li>,
    h1:         ({ children }: { children?: React.ReactNode }) => <h1 style={{ fontSize: 17, fontWeight: 700, color: "var(--txt0)", margin: "16px 0 8px" }}>{children}</h1>,
    h2:         ({ children }: { children?: React.ReactNode }) => <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--txt0)", margin: "14px 0 6px" }}>{children}</h2>,
    h3:         ({ children }: { children?: React.ReactNode }) => <h3 style={{ fontSize: 13.5, fontWeight: 600, color: "var(--txt0)", margin: "12px 0 5px" }}>{children}</h3>,
    blockquote: ({ children }: { children?: React.ReactNode }) => <blockquote style={{ borderLeft: "3px solid var(--border2)", paddingLeft: 12, margin: "8px 0", color: "var(--txt2)" }}>{children}</blockquote>,
    a:          ({ href, children }: { href?: string; children?: React.ReactNode }) => <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)", textDecoration: "none" }}>{children}</a>,
  }
}

export default function ChatPanel({ repoId, prefill, onPrefillConsumed }: Props) {
  const theme = useTheme()
  const storageKey = `chat_${repoId}`
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window === "undefined") return []
    try { return JSON.parse(localStorage.getItem(storageKey) ?? "[]") } catch { return [] }
  })
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [statusText, setStatusText] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages, statusText])

  useEffect(() => {
    if (prefill) {
      setInput(prefill)
      onPrefillConsumed?.()
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill])

  useEffect(() => {
    if (!streaming && messages.length > 0)
      try { localStorage.setItem(storageKey, JSON.stringify(messages)) } catch {}
  }, [streaming, messages, storageKey])

  function clearHistory() {
    setMessages([])
    try { localStorage.removeItem(storageKey) } catch {}
  }

  async function send() {
    const text = input.trim()
    if (!text || streaming) return
    const history = messages.map((m) => ({ role: m.role, content: m.content }))
    setMessages((p) => [...p, { role: "user", content: text }])
    setInput("")
    setStreaming(true)
    setStatusText("")
    setMessages((p) => [...p, { role: "assistant", content: "", citations: [] }])
    try {
      for await (const { event, data } of chatStreamGenerator(repoId, text, history)) {
        if (event === "status") {
          setStatusText((data as { message: string }).message)
        } else if (event === "text") {
          setStatusText("")
          const delta = (data as { delta: string }).delta
          setMessages((p) => { const u = [...p]; const l = { ...u[u.length-1] }; l.content += delta; u[u.length-1] = l; return u })
        } else if (event === "citation") {
          const cit = data as Citation
          setMessages((p) => { const u = [...p]; const l = { ...u[u.length-1] }; l.citations = [...(l.citations ?? []), cit]; u[u.length-1] = l; return u })
        } else if (event === "error") {
          setStatusText("")
          const msg = (data as { message: string }).message
          setMessages((p) => { const u = [...p]; const l = { ...u[u.length-1] }; l.content = `**Error:** ${msg}`; u[u.length-1] = l; return u })
        }
      }
    } catch (err) {
      setMessages((p) => { const u = [...p]; const l = { ...u[u.length-1] }; l.content = `**Error:** ${err instanceof Error ? err.message : "Unknown error"}`; u[u.length-1] = l; return u })
    } finally {
      setStreaming(false)
      setStatusText("")
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg0)" }}>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 0 8px" }}>

        {messages.length === 0 && !streaming && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, opacity: .4 }}>
            <i className="ti ti-messages" style={{ fontSize: 32, color: "var(--txt2)" }} />
            <p style={{ fontSize: 13, color: "var(--txt2)" }}>Ask about the codebase…</p>
          </div>
        )}

        {messages.map((msg, i) => {
          // Don't render empty assistant bubble while status indicator is showing
          const isLastEmptyStreaming = msg.role === "assistant" && msg.content === "" && streaming && i === messages.length - 1 && !!statusText
          if (isLastEmptyStreaming) return null
          return (
          <div key={i} style={{ padding: "0 20px", marginBottom: 20 }}>
            {msg.role === "user" ? (
              /* User — right-aligned pill, no avatar */
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div style={{
                  background: "var(--blue)", color: "#fff",
                  borderRadius: "16px 16px 4px 16px", padding: "9px 14px",
                  fontSize: 13.5, lineHeight: 1.6, maxWidth: "60%",
                  boxShadow: "0 1px 4px rgba(59,130,246,.3)",
                }}>
                  {msg.content}
                </div>
              </div>
            ) : (
              /* Assistant — avatar + bubble */
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--blue-dim)", border: "1px solid rgba(59,130,246,.3)", display: "grid", placeItems: "center", flexShrink: 0, marginTop: 2 }}>
                  <i className="ti ti-robot" style={{ fontSize: 15, color: "var(--blue)" }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "4px 16px 16px 16px", padding: "10px 14px", maxWidth: 680 }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={buildMdComponents(msg.citations ?? [], theme)}>
                      {msg.content || (streaming && i === messages.length - 1 ? "▍" : "")}
                    </ReactMarkdown>
                    {(msg.citations?.length ?? 0) > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                        {msg.citations!.map((c, ci) => <CitationCard key={ci} citation={c} />)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          )
        })}

        {/* Typing */}
        {statusText && (
          <div style={{ padding: "0 20px", display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--blue-dim)", border: "1px solid rgba(59,130,246,.3)", display: "grid", placeItems: "center", flexShrink: 0, marginTop: 2 }}>
              <i className="ti ti-robot" style={{ fontSize: 15, color: "var(--blue)" }} />
            </div>
            <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "4px 16px 16px 16px", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", gap: 3 }}>
                {[0,1,2].map((d) => <span key={d} style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--txt2)", display: "inline-block", animation: `tdot 1.2s ${d*.15}s infinite` }} />)}
              </div>
              <span style={{ fontSize: 12, color: "var(--txt2)" }}>{statusText}</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "10px 20px 14px", borderTop: "1px solid var(--border)", background: "var(--bg1)", flexShrink: 0 }}>
        <div
          style={{ display: "flex", alignItems: "flex-end", gap: 8, background: "var(--bg2)", border: "1px solid var(--border2)", borderRadius: 10, padding: "9px 10px 9px 14px", transition: "border-color .15s, box-shadow .15s" }}
          onFocusCapture={(e) => { e.currentTarget.style.borderColor = "var(--blue)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59,130,246,.1)" }}
          onBlurCapture={(e) => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.boxShadow = "none" }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Ask about the codebase…"
            rows={1}
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--txt0)", fontSize: 13, fontFamily: "inherit", resize: "none", minHeight: 22, maxHeight: 140, lineHeight: 1.55 }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
            <button onClick={clearHistory} title="Clear"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--txt2)", padding: 5, borderRadius: 5, display: "grid", placeItems: "center", transition: "color .15s" }}
              onMouseEnter={(e) => e.currentTarget.style.color = "var(--red)"}
              onMouseLeave={(e) => e.currentTarget.style.color = "var(--txt2)"}
            >
              <i className="ti ti-trash" style={{ fontSize: 14 }} />
            </button>
            <button onClick={send} disabled={streaming || !input.trim()}
              style={{ width: 32, height: 30, background: input.trim() && !streaming ? "var(--blue)" : "transparent", border: `1px solid ${input.trim() && !streaming ? "var(--blue)" : "var(--border2)"}`, borderRadius: 7, color: input.trim() && !streaming ? "#fff" : "var(--txt2)", cursor: streaming || !input.trim() ? "not-allowed" : "pointer", display: "grid", placeItems: "center", transition: "all .15s" }}
            >
              <i className="ti ti-arrow-up" style={{ fontSize: 13 }} />
            </button>
          </div>
        </div>
        <p style={{ fontSize: 10, color: "var(--txt2)", textAlign: "center", marginTop: 6, opacity: .5 }}>⏎ send · ⇧⏎ new line</p>
      </div>
    </div>
  )
}
