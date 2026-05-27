"use client"

import { useRef, useState } from "react"
import type { Citation } from "@/lib/types"

interface Props { citation: Citation }

export default function CitationCard({ citation }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const short = `${citation.file.split("/").slice(-1)[0]}:L${citation.start_line}`

  return (
    <span ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          background: "var(--blue-dim)", border: "1px solid rgba(59,130,246,.18)",
          borderRadius: 4, padding: "3px 8px", fontSize: 10,
          fontFamily: "var(--mono)", color: "#60a5fa", cursor: "pointer",
        }}
      >
        <i className="ti ti-file-code" style={{ fontSize: 10 }} />
        {short}
      </button>

      {open && (
        <span style={{
          position: "absolute", bottom: "100%", left: 0, marginBottom: 4, zIndex: 50,
          width: 380, borderRadius: 8, border: "1px solid var(--border2)",
          background: "var(--bg1)", boxShadow: "0 8px 32px rgba(0,0,0,.4)",
          display: "block",
        }}>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--txt2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {citation.file}:L{citation.start_line}–L{citation.end_line}
            </span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "var(--txt2)", cursor: "pointer", marginLeft: 8, flexShrink: 0 }}>
              <i className="ti ti-x" style={{ fontSize: 12 }} />
            </button>
          </span>
          {citation.preview ? (
            <span style={{ display: "block", padding: "10px 12px", fontFamily: "var(--mono)", fontSize: 11, lineHeight: 1.6, color: "var(--txt1)", overflowX: "auto", maxHeight: 180, background: "var(--bg0)", borderRadius: "0 0 8px 8px", whiteSpace: "pre" }}>
              {citation.preview}
            </span>
          ) : (
            <span style={{ display: "block", padding: "8px 10px", fontSize: 11, color: "var(--txt2)" }}>No preview available</span>
          )}
        </span>
      )}
    </span>
  )
}
