"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import type { AppSettings } from "@/lib/types"

interface Props { open: boolean; onClose: () => void }

const MODELS = [
  { id: "claude-haiku-4-5-20251001", label: "Haiku",  desc: "Fast" },
  { id: "claude-sonnet-4-6",         label: "Sonnet", desc: "Balanced" },
  { id: "claude-opus-4-7",           label: "Opus",   desc: "Best" },
]
const LLM_PROVIDERS  = [{ id: "anthropic", label: "Anthropic" }, { id: "ollama", label: "Ollama (local)" }]
const EMBED_PROVIDERS = [{ id: "ollama", label: "Ollama" }, { id: "voyage", label: "Voyage" }, { id: "openai", label: "OpenAI" }]

/* ── Shared styles ── */
const inputStyle: React.CSSProperties = {
  width: "100%", background: "var(--bg0)", border: "1px solid var(--border2)",
  borderRadius: 7, padding: "8px 11px", fontSize: 12, color: "var(--txt0)",
  fontFamily: "var(--mono)", outline: "none", transition: "border-color .15s, box-shadow .15s",
}
function Input({ type = "text", placeholder, value, onChange }: { type?: string; placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <input
      type={type} placeholder={placeholder} value={value}
      onChange={(e) => onChange(e.target.value)}
      style={inputStyle}
      onFocus={(e) => { e.currentTarget.style.borderColor = "var(--blue)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59,130,246,.1)" }}
      onBlur={(e)  => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.boxShadow = "none" }}
    />
  )
}

function Badge({ ok }: { ok: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600,
      color: ok ? "var(--green)" : "var(--amber)",
      background: ok ? "var(--green-dim)" : "var(--amber-dim)",
      border: `1px solid ${ok ? "rgba(34,197,94,.2)" : "rgba(245,158,11,.2)"}`,
      borderRadius: 4, padding: "2px 7px", letterSpacing: ".02em" }}>
      <i className={`ti ti-${ok ? "check" : "alert-triangle"}`} style={{ fontSize: 9 }} />
      {ok ? "Configured" : "Not set"}
    </span>
  )
}

function Seg({ options, value, onChange }: { options: { id: string; label: string; desc?: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div style={{ display: "flex", background: "var(--bg0)", border: "1px solid var(--border2)", borderRadius: 7, padding: 3, gap: 2 }}>
      {options.map((o) => {
        const active = value === o.id
        return (
          <button key={o.id} type="button" onClick={() => onChange(o.id)} style={{
            flex: 1, padding: "6px 8px", borderRadius: 5, fontSize: 11, border: "none",
            cursor: "pointer", transition: "all .15s",
            background: active ? "var(--blue)" : "transparent",
            color: active ? "#fff" : "var(--txt2)",
            fontWeight: active ? 600 : 400,
            boxShadow: active ? "0 1px 4px rgba(59,130,246,.35)" : "none",
          }}>
            {o.label}
            {o.desc && <span style={{ display: "block", fontSize: 9, opacity: .7, marginTop: 1 }}>{o.desc}</span>}
          </button>
        )
      })}
    </div>
  )
}

function Card({ title, badge, children }: { title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 9, overflow: "hidden", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--bg2)", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--txt1)", letterSpacing: ".04em", textTransform: "uppercase" }}>{title}</span>
        {badge}
      </div>
      <div style={{ padding: "14px 14px", background: "var(--bg1)", display: "flex", flexDirection: "column", gap: 12 }}>
        {children}
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 500, color: "var(--txt1)", marginBottom: 6 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 10, color: "var(--txt2)", marginTop: 5, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return <code style={{ fontFamily: "var(--mono)", background: "var(--bg0)", border: "1px solid var(--border2)", padding: "0 4px", borderRadius: 3, color: "#7dd3fc", fontSize: 10 }}>{children}</code>
}

export default function SettingsPanel({ open, onClose }: Props) {
  const [status, setStatus] = useState<AppSettings | null>(null)
  const [anthropicKey,       setAnthropicKey]       = useState("")
  const [voyageKey,          setVoyageKey]           = useState("")
  const [openaiKey,          setOpenaiKey]           = useState("")
  const [defaultModel,       setDefaultModel]        = useState("claude-haiku-4-5-20251001")
  const [defaultProvider,    setDefaultProvider]     = useState("ollama")
  const [llmProvider,        setLlmProvider]         = useState("anthropic")
  const [ollamaLlmModel,     setOllamaLlmModel]      = useState("llama3.2")
  const [githubToken,        setGithubToken]         = useState("")
  const [bbUsername,         setBbUsername]          = useState("")
  const [bbPassword,         setBbPassword]          = useState("")
  const [bbServerUrl,        setBbServerUrl]         = useState("")
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  useEffect(() => {
    if (!open) return
    api.getSettings().then((s) => {
      setStatus(s)
      setDefaultModel(s.default_model)
      setDefaultProvider(s.default_embed_provider)
      setLlmProvider(s.llm_provider || "anthropic")
      setOllamaLlmModel(s.ollama_llm_model || "llama3.2")
      setBbServerUrl(s.bitbucket_server_url || "")
    }).catch(() => {})
  }, [open])

  async function handleSave() {
    setSaving(true)
    try {
      await api.updateSettings({
        ...(anthropicKey && { anthropic_api_key: anthropicKey }),
        ...(voyageKey    && { voyage_api_key:    voyageKey }),
        ...(openaiKey    && { openai_api_key:    openaiKey }),
        ...(githubToken  && { github_token:      githubToken }),
        ...(bbUsername   && { bitbucket_username:     bbUsername }),
        ...(bbPassword   && { bitbucket_app_password: bbPassword }),
        ...(bbServerUrl  && { bitbucket_server_url:   bbServerUrl }),
        default_model: defaultModel,
        default_embed_provider: defaultProvider,
        llm_provider: llmProvider,
        ollama_llm_model: ollamaLlmModel,
      })
      const updated = await api.getSettings()
      setStatus(updated)
      setAnthropicKey(""); setVoyageKey(""); setOpenaiKey("")
      setGithubToken(""); setBbUsername(""); setBbPassword("")
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {} finally { setSaving(false) }
  }

  if (!open) return null

  const embedNeedsKey      = EMBED_PROVIDERS.find((p) => p.id === defaultProvider)?.id !== "ollama"
  const embedConfigured    = defaultProvider === "voyage" ? (status?.voyage_configured ?? false) : defaultProvider === "openai" ? (status?.openai_configured ?? false) : true

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 100, backdropFilter: "blur(2px)" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        zIndex: 101, width: 500, maxHeight: "88vh", display: "flex", flexDirection: "column",
        background: "var(--bg1)", border: "1px solid var(--border2)", borderRadius: 12,
        boxShadow: "0 32px 80px rgba(0,0,0,.6)",
      }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: "var(--bg2)", border: "1px solid var(--border2)", display: "grid", placeItems: "center" }}>
              <i className="ti ti-settings" style={{ fontSize: 14, color: "var(--txt1)" }} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--txt0)" }}>Settings</div>
              <div style={{ fontSize: 10, color: "var(--txt2)", marginTop: 1 }}>Configure models, providers and credentials</div>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, background: "none", border: "1px solid transparent", borderRadius: 6, color: "var(--txt2)", cursor: "pointer", display: "grid", placeItems: "center", transition: "all .15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg2)"; e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--txt0)" }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.color = "var(--txt2)" }}>
            <i className="ti ti-x" style={{ fontSize: 14 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>

          {/* Language Model */}
          <Card title="Language Model">
            <Field label="LLM Provider">
              <Seg options={LLM_PROVIDERS} value={llmProvider} onChange={setLlmProvider} />
            </Field>

            {llmProvider === "anthropic" && (
              <>
                <Field label="Anthropic API Key" hint={!status?.anthropic_configured && <span>Get yours at <span style={{ color: "var(--blue)" }}>console.anthropic.com</span></span>}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ flex: 1 }}><Input type="password" placeholder={status?.anthropic_configured ? "Enter new key to update" : "sk-ant-…"} value={anthropicKey} onChange={setAnthropicKey} /></div>
                    <Badge ok={status?.anthropic_configured ?? false} />
                  </div>
                </Field>
                <Field label="Default Chat Model">
                  <Seg options={MODELS} value={defaultModel} onChange={setDefaultModel} />
                </Field>
              </>
            )}

            {llmProvider === "ollama" && (
              <Field label="Ollama Model" hint={<span>Any model from <Code>ollama pull &lt;model&gt;</Code></span>}>
                <Input placeholder="llama3.2" value={ollamaLlmModel} onChange={setOllamaLlmModel} />
              </Field>
            )}
          </Card>

          {/* Embeddings */}
          <Card title="Embeddings">
            <Field label="Embed Provider">
              <Seg options={EMBED_PROVIDERS} value={defaultProvider} onChange={setDefaultProvider} />
            </Field>

            {defaultProvider === "ollama" && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--green)", background: "var(--green-dim)", border: "1px solid rgba(34,197,94,.15)", borderRadius: 6, padding: "7px 10px" }}>
                <i className="ti ti-check" style={{ fontSize: 12 }} />
                Runs locally — no API key needed
              </div>
            )}

            {embedNeedsKey && (
              <Field
                label={defaultProvider === "voyage" ? "Voyage AI Key" : "OpenAI Key"}
                hint={defaultProvider === "voyage" && !embedConfigured ? <span>Free at <span style={{ color: "var(--blue)" }}>voyageai.com</span> — 50M tokens, no credit card</span> : undefined}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ flex: 1 }}>
                    <Input type="password"
                      placeholder={embedConfigured ? "Enter new key to update" : defaultProvider === "voyage" ? "pa-…" : "sk-…"}
                      value={defaultProvider === "voyage" ? voyageKey : openaiKey}
                      onChange={defaultProvider === "voyage" ? setVoyageKey : setOpenaiKey}
                    />
                  </div>
                  <Badge ok={embedConfigured} />
                </div>
              </Field>
            )}
          </Card>

          {/* Git Credentials */}
          <Card title="Git Credentials" badge={<span style={{ fontSize: 10, color: "var(--txt2)" }}>private repos</span>}>

            {/* GitHub */}
            <Field label="GitHub Token" hint={<span>Personal access token with <Code>repo</Code> scope</span>}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ flex: 1 }}><Input type="password" placeholder={status?.github_configured ? "Enter new token to update" : "ghp_…"} value={githubToken} onChange={setGithubToken} /></div>
                <Badge ok={status?.github_configured ?? false} />
              </div>
            </Field>

            {/* Bitbucket */}
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: "var(--txt1)" }}>Bitbucket</span>
                <Badge ok={status?.bitbucket_configured ?? false} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Input type="url" placeholder="Server URL (leave empty for Bitbucket Cloud)" value={bbServerUrl} onChange={setBbServerUrl} />
                <Input placeholder="Username" value={bbUsername} onChange={setBbUsername} />
                <Input type="password" placeholder="HTTP access token (Server) or App password (Cloud)" value={bbPassword} onChange={setBbPassword} />
              </div>
              <div style={{ fontSize: 10, color: "var(--txt2)", marginTop: 8, lineHeight: 1.6 }}>
                <div><strong style={{ color: "var(--txt1)" }}>Server:</strong> Account settings → HTTP access tokens → <Code>Repositories: Read</Code></div>
                <div><strong style={{ color: "var(--txt1)" }}>Cloud:</strong> Account settings → App passwords → Repositories: Read</div>
              </div>
            </div>
          </Card>

        </div>

        {/* Footer */}
        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--txt2)" }}>
            <i className="ti ti-shield-lock" style={{ fontSize: 12, color: "var(--green)" }} />
            Keys are saved to <Code>.env.runtime</Code> and persist across restarts
          </div>
          <button onClick={handleSave} disabled={saving} style={{
            background: saved ? "var(--green)" : "var(--blue)", border: "none", borderRadius: 7,
            padding: "8px 22px", fontSize: 12, fontWeight: 600, color: "#fff",
            cursor: saving ? "not-allowed" : "pointer", opacity: saving ? .7 : 1,
            whiteSpace: "nowrap", flexShrink: 0, transition: "background .2s",
            boxShadow: "0 2px 6px rgba(59,130,246,.3)",
          }}>
            {saving ? "Saving…" : saved ? "✓ Saved" : "Save"}
          </button>
        </div>
      </div>
    </>
  )
}
