"use client"

import { useEffect, useState } from "react"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { vscDarkPlus, vs } from "react-syntax-highlighter/dist/esm/styles/prism"
import { api } from "@/lib/api"
import { useTheme } from "@/lib/useTheme"

interface TreeNode {
  name: string
  path: string
  isDir: boolean
  children: TreeNode[]
}

function buildTree(paths: string[]): TreeNode[] {
  const root: Record<string, unknown> = {}
  for (const p of paths) {
    const parts = p.replace(/\\/g, "/").split("/").filter(Boolean)
    let node = root as Record<string, unknown>
    for (const part of parts) {
      if (!node[part]) node[part] = {}
      node = node[part] as Record<string, unknown>
    }
    node["__path__"] = p
  }
  function convert(obj: Record<string, unknown>, prefix: string): TreeNode[] {
    return Object.entries(obj)
      .filter(([k]) => k !== "__path__")
      .sort(([a, ao], [b, bo]) => {
        const aD = Object.keys(ao as object).some((k) => k !== "__path__")
        const bD = Object.keys(bo as object).some((k) => k !== "__path__")
        if (aD !== bD) return aD ? -1 : 1
        return a.localeCompare(b)
      })
      .map(([name, subtree]) => {
        const sub = subtree as Record<string, unknown>
        const path = prefix ? `${prefix}/${name}` : name
        const isLeaf = sub["__path__"] !== undefined && Object.keys(sub).filter((k) => k !== "__path__").length === 0
        return { name, path: isLeaf ? (sub["__path__"] as string) : path, isDir: !isLeaf, children: isLeaf ? [] : convert(sub, path) }
      })
  }
  return convert(root, "")
}

function countFiles(nodes: TreeNode[]): number {
  return nodes.reduce((n, node) => n + (node.isDir ? countFiles(node.children) : 1), 0)
}

const FILE_ICON: Record<string, { icon: string; color: string }> = {
  py:   { icon: "ti-brand-python",     color: "#3b82f6" },
  ts:   { icon: "ti-brand-typescript", color: "#3b82f6" },
  tsx:  { icon: "ti-brand-typescript", color: "#3b82f6" },
  js:   { icon: "ti-brand-javascript", color: "#f59e0b" },
  jsx:  { icon: "ti-brand-javascript", color: "#f59e0b" },
  go:   { icon: "ti-brand-golang",     color: "#06b6d4" },
  rs:   { icon: "ti-file-code",        color: "#f97316" },
  java: { icon: "ti-coffee",           color: "#ef4444" },
  cs:   { icon: "ti-file-code",        color: "#8b5cf6" },
  cpp:  { icon: "ti-file-code",        color: "#6366f1" },
  c:    { icon: "ti-file-code",        color: "#6366f1" },
  h:    { icon: "ti-file-code",        color: "#6366f1" },
  md:   { icon: "ti-markdown",         color: "#8b949e" },
  json: { icon: "ti-braces",           color: "#f59e0b" },
  yaml: { icon: "ti-file-text",        color: "#10b981" },
  yml:  { icon: "ti-file-text",        color: "#10b981" },
  html: { icon: "ti-brand-html5",      color: "#f97316" },
  css:  { icon: "ti-brand-css3",       color: "#3b82f6" },
  toml: { icon: "ti-file-text",        color: "#8b949e" },
  rb:   { icon: "ti-file-code",        color: "#ef4444" },
  php:  { icon: "ti-file-code",        color: "#8b5cf6" },
  kt:   { icon: "ti-file-code",        color: "#f59e0b" },
  swift:{ icon: "ti-file-code",        color: "#f97316" },
}

function getFileInfo(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  return FILE_ICON[ext] ?? { icon: "ti-file", color: "var(--txt2)" }
}

interface Props { repoId: string; onAskAbout?: (q: string) => void; onAskAboutPath?: (q: string) => void }

function TreeNodeView({ node, depth, selected, onSelect, onAskAbout, onAskAboutDir }: {
  node: TreeNode; depth: number
  selected: string | null; onSelect: (path: string) => void
  onAskAbout?: (q: string) => void
  onAskAboutDir?: (path: string, name: string, isProject: boolean) => void
}) {
  const [hovered, setHovered] = useState(false)
  const [open, setOpen] = useState(depth < 2)
  const indent = depth * 16
  const isSelected = selected === node.path

  if (!node.isDir) {
    const { icon, color } = getFileInfo(node.name)
    return (
      <div
        style={{ position: "relative", display: "flex", alignItems: "center" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <button
          onClick={() => onSelect(node.path)}
          title={node.path}
          style={{
            display: "flex", alignItems: "center", gap: 6, flex: 1,
            padding: "4px 10px 4px 0", paddingLeft: 10 + indent,
            background: isSelected ? "rgba(59,130,246,.1)" : hovered ? "var(--bg2)" : "none",
            border: "none", borderLeft: isSelected ? "2px solid var(--blue)" : "2px solid transparent",
            cursor: "pointer", textAlign: "left", transition: "background .1s",
          }}
        >
          <i className={`ti ${icon}`} style={{ fontSize: 12, color, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: isSelected ? "var(--txt0)" : "var(--txt1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {node.name}
          </span>
        </button>
        {hovered && onAskAbout && (
          <button
            onClick={(e) => { e.stopPropagation(); onAskAbout(`Explain the purpose and structure of ${node.name} in this codebase`) }}
            title="Ask about this file"
            style={{
              position: "absolute", right: 8,
              background: "var(--blue-dim)", border: "1px solid rgba(59,130,246,.25)",
              borderRadius: 4, padding: "2px 7px", fontSize: 9, fontWeight: 600,
              color: "var(--blue)", cursor: "pointer", display: "flex", alignItems: "center",
              gap: 3, whiteSpace: "nowrap", transition: "all .12s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--blue)"; e.currentTarget.style.color = "#fff" }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--blue-dim)"; e.currentTarget.style.color = "var(--blue)" }}
          >
            <i className="ti ti-messages" style={{ fontSize: 9 }} /> Ask
          </button>
        )}
      </div>
    )
  }

  const fc = countFiles(node.children)
  // Directories with dots in the name are likely C# projects / packages
  const isProject = node.name.includes(".") && node.name.split(".").length >= 2
  const folderIcon = isProject
    ? (open ? "ti-package" : "ti-package")
    : (open ? "ti-folder-open" : "ti-folder")
  const folderColor = isProject ? "var(--violet)" : "var(--blue)"

  return (
    <div>
      <div
        style={{ position: "relative", display: "flex", alignItems: "center" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <button
          onClick={() => setOpen(!open)}
          style={{
            display: "flex", alignItems: "center", gap: 6, flex: 1,
            padding: "4px 10px 4px 0", paddingLeft: 10 + indent,
            background: hovered ? "var(--bg2)" : "none",
            border: "none", borderLeft: "2px solid transparent",
            cursor: "pointer", textAlign: "left", transition: "background .1s",
          }}
        >
          <i className={`ti ${open ? "ti-chevron-down" : "ti-chevron-right"}`} style={{ fontSize: 9, color: "var(--txt2)", flexShrink: 0, width: 10 }} />
          <i className={`ti ${folderIcon}`} style={{ fontSize: 12, color: folderColor, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: "var(--txt0)", fontWeight: 500, flex: 1 }}>{node.name}</span>
          <span style={{ fontSize: 10, color: "var(--txt2)", fontFamily: "var(--mono)", marginRight: hovered && onAskAbout ? 64 : 4 }}>{fc}</span>
        </button>
        {hovered && onAskAbout && onAskAboutDir && (
          <button
            onClick={(e) => { e.stopPropagation(); onAskAboutDir(node.path, node.name, isProject) }}
            title={`Ask about ${node.name}`}
            style={{
              position: "absolute", right: 8,
              background: "var(--blue-dim)", border: "1px solid rgba(59,130,246,.25)",
              borderRadius: 4, padding: "2px 7px", fontSize: 9, fontWeight: 600,
              color: "var(--blue)", cursor: "pointer", display: "flex", alignItems: "center",
              gap: 3, whiteSpace: "nowrap", transition: "all .12s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--blue)"; e.currentTarget.style.color = "#fff" }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--blue-dim)"; e.currentTarget.style.color = "var(--blue)" }}
          >
            <i className="ti ti-messages" style={{ fontSize: 9 }} /> Ask
          </button>
        )}
      </div>
      {open && (
        <div>
          {node.children.map((child) => (
            <TreeNodeView key={child.path} node={child} depth={depth + 1} selected={selected} onSelect={onSelect} onAskAbout={onAskAbout} onAskAboutDir={onAskAboutDir} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function FileTree({ repoId, onAskAbout, onAskAboutPath }: Props) {
  const theme = useTheme()
  const [tree, setTree] = useState<TreeNode[]>([])
  const [allPaths, setAllPaths] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [filter, setFilter] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const [chunks, setChunks] = useState<{ text: string; file_path: string; start_line: number; end_line: number; chunk_type: string; node_name: string; language: string }[]>([])
  const [loadingChunks, setLoadingChunks] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.getRepoFiles(repoId)
      .then(({ files }) => { setAllPaths(files); setTree(buildTree(files)) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [repoId])

  async function handleAskAboutDir(dirPath: string, name: string, isProject: boolean) {
    if (!onAskAbout) return
    try {
      const { chunks } = await api.getDirChunks(repoId, dirPath, 6)
      if (chunks.length === 0) {
        onAskAbout(`What is the purpose of ${name}?`)
        return
      }
      // Include file names as search keywords for BM25, but keep the question clean
      const fileNames = [...new Set(chunks.map((c) => c.file_path.split("/").pop() ?? ""))].filter(Boolean).slice(0, 5).join(" ")
      onAskAbout(`What is the purpose of ${name}? (${fileNames})`)
    } catch {
      onAskAbout(`What is the purpose of ${name}?`)
    }
  }

  async function selectFile(path: string) {
    setSelected(path)
    setLoadingChunks(true)
    try {
      const { chunks } = await api.getFileChunks(repoId, path)
      setChunks(chunks)
    } catch { setChunks([]) }
    finally { setLoadingChunks(false) }
  }

  const filterLower = filter.toLowerCase()
  const filteredTree = filterLower
    ? buildTree(allPaths.filter((p) => p.toLowerCase().includes(filterLower)))
    : tree

  // Language breakdown
  const langCount: Record<string, number> = {}
  for (const p of allPaths) {
    const ext = p.split(".").pop()?.toLowerCase() ?? "other"
    langCount[ext] = (langCount[ext] ?? 0) + 1
  }
  const topLangs = Object.entries(langCount).sort((a, b) => b[1] - a[1]).slice(0, 5)

  if (loading) return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--txt2)", fontSize: 12 }}>Loading…</div>
  if (error)   return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--red)",  fontSize: 12 }}>{error}</div>

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

      {/* ── Left: tree ── */}
      <div style={{ width: 300, flexShrink: 0, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--bg1)" }}>
        {/* Search */}
        <div style={{ padding: "10px 10px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 6, background: "var(--bg2)", margin: 8, borderRadius: 6, border: "1px solid var(--border2)" }}>
          <i className="ti ti-search" style={{ fontSize: 11, color: "var(--txt2)" }} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter files…"
            style={{ background: "none", border: "none", outline: "none", fontSize: 12, color: "var(--txt0)", flex: 1 }}
          />
          {filter && <button onClick={() => setFilter("")} style={{ background: "none", border: "none", color: "var(--txt2)", cursor: "pointer", padding: 0 }}><i className="ti ti-x" style={{ fontSize: 10 }} /></button>}
        </div>
        {/* File count */}
        <div style={{ padding: "0 12px 8px", fontSize: 10, color: "var(--txt2)", fontFamily: "var(--mono)" }}>
          {filter ? `${allPaths.filter((p) => p.toLowerCase().includes(filterLower)).length} of ` : ""}{allPaths.length} files
        </div>
        {/* Tree */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filteredTree.map((n) => <TreeNodeView key={n.path} node={n} depth={0} selected={selected} onSelect={selectFile} onAskAbout={onAskAbout} onAskAboutDir={handleAskAboutDir} />)}
          {filteredTree.length === 0 && filter && (
            <p style={{ fontSize: 11, color: "var(--txt2)", textAlign: "center", padding: "20px 0" }}>No files match "{filter}"</p>
          )}
        </div>
      </div>

      {/* ── Right: detail ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {selected ? (
          <>
            {/* File header */}
            <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", background: "var(--bg1)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <i className={`ti ${getFileInfo(selected.split("/").pop() ?? "").icon}`} style={{ fontSize: 16, color: getFileInfo(selected.split("/").pop() ?? "").color }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--txt0)", fontFamily: "var(--mono)" }}>{selected.split("/").pop()}</div>
                <div style={{ fontSize: 10, color: "var(--txt2)", fontFamily: "var(--mono)", marginTop: 2 }}>{selected}</div>
              </div>
              {!loadingChunks && (
                <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--txt2)", background: "var(--bg2)", border: "1px solid var(--border2)", borderRadius: 3, padding: "2px 7px", fontFamily: "var(--mono)" }}>
                  {chunks.length} chunks
                </span>
              )}
            </div>

            {/* Chunks */}
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
              {loadingChunks && <div style={{ color: "var(--txt2)", fontSize: 12, padding: "20px 0" }}>Loading chunks…</div>}
              {!loadingChunks && chunks.length === 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60%", gap: 8, opacity: .4 }}>
                  <i className="ti ti-file-off" style={{ fontSize: 28, color: "var(--txt2)" }} />
                  <p style={{ fontSize: 12, color: "var(--txt2)" }}>No indexed chunks for this file</p>
                </div>
              )}
              {!loadingChunks && chunks.map((chunk, i) => (
                <div key={i} style={{ marginBottom: 12, border: "1px solid var(--border)", borderRadius: 7, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", background: "var(--bg2)", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--blue)" }}>
                      L{chunk.start_line}–L{chunk.end_line}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--txt2)", background: "var(--bg3)", border: "1px solid var(--border2)", borderRadius: 3, padding: "1px 6px" }}>
                      {chunk.chunk_type}
                    </span>
                    {chunk.node_name && (
                      <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--txt1)", fontWeight: 500 }}>
                        {chunk.node_name}
                      </span>
                    )}
                  </div>
                  <div style={{ maxHeight: 260, overflowY: "auto" }}>
                    <SyntaxHighlighter
                      language={chunk.language || "text"}
                      style={theme === "light" ? vs : vscDarkPlus}
                      customStyle={{ margin: 0, borderRadius: 0, fontSize: 11.5, lineHeight: 1.7, background: theme === "light" ? "#f6f8fa" : "#0d0d0d", padding: "12px 14px" }}
                      codeTagProps={{ style: { fontFamily: "var(--mono)" } }}
                      showLineNumbers
                      startingLineNumber={chunk.start_line}
                      lineNumberStyle={{ color: "#484f58", fontSize: 10, minWidth: 36, paddingRight: 12, userSelect: "none" }}
                    >
                      {chunk.text}
                    </SyntaxHighlighter>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          /* Nothing selected — show stats */
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px", gap: 20, overflowY: "auto" }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--txt2)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 12 }}>Language Breakdown</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {topLangs.map(([ext, count]) => {
                  const pct = Math.round(count / allPaths.length * 100)
                  const { icon, color } = getFileInfo(`file.${ext}`)
                  return (
                    <div key={ext} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <i className={`ti ${icon}`} style={{ fontSize: 13, color, width: 16, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: "var(--txt1)", width: 60, fontFamily: "var(--mono)" }}>.{ext}</span>
                      <div style={{ flex: 1, height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 11, color: "var(--txt2)", fontFamily: "var(--mono)", width: 40, textAlign: "right" }}>{count}</span>
                      <span style={{ fontSize: 10, color: "var(--txt2)", width: 32, textAlign: "right" }}>{pct}%</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 20 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--txt2)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>Quick Stats</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { label: "Total Files",   value: allPaths.length.toLocaleString() },
                  { label: "Languages",     value: Object.keys(langCount).length },
                  { label: "Directories",   value: [...new Set(allPaths.map((p) => p.split("/").slice(0, -1).join("/")))].filter(Boolean).length },
                  { label: "Avg Depth",     value: (allPaths.reduce((s, p) => s + p.split("/").length, 0) / (allPaths.length || 1)).toFixed(1) },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 7, padding: "12px 14px" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--mono)", color: "var(--txt0)" }}>{value}</div>
                    <div style={{ fontSize: 11, color: "var(--txt2)", marginTop: 3 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ color: "var(--txt2)", fontSize: 12, textAlign: "center", marginTop: 8, opacity: .5 }}>
              ← Click a file to view its indexed chunks
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
