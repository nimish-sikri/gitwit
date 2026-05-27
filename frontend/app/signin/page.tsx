"use client"

import { signIn, getProviders } from "next-auth/react"
import Logo from "@/components/Logo"
import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"

type Provider = { id: string; name: string }

const PROVIDER_META: Record<string, { icon: string; bg: string; border: string; hover: string; note?: string }> = {
  github: {
    icon: "ti-brand-github",
    bg: "#161b22", border: "#30363d", hover: "#21262d",
  },
  google: {
    icon: "ti-brand-google",
    bg: "#fff", border: "#dadce0", hover: "#f8f9fa",
    note: "Identity only — no repo access",
  },
  bitbucket: {
    icon: "ti-brand-bitbucket",
    bg: "#0052cc", border: "#0052cc", hover: "#0747a6",
  },
}

const SETUP_STEPS: Record<string, { title: string; steps: string[]; env: string[] }> = {
  github: {
    title: "Set up GitHub OAuth",
    steps: [
      "Go to github.com/settings/developers → New OAuth App",
      "Homepage URL: http://localhost:3000",
      "Callback URL: http://localhost:3000/api/auth/callback/github",
      "Copy Client ID & Secret into frontend/.env.local",
      "Restart the frontend",
    ],
    env: ["GITHUB_CLIENT_ID=your_client_id", "GITHUB_CLIENT_SECRET=your_client_secret"],
  },
  bitbucket: {
    title: "Set up Bitbucket Cloud OAuth",
    steps: [
      "Go to bitbucket.org → Settings → OAuth consumers → Add",
      "Callback URL: http://localhost:3000/api/auth/callback/bitbucket",
      "Permissions: Account Read, Repositories Read",
      "Copy Key & Secret into frontend/.env.local",
      "Restart the frontend",
    ],
    env: ["BITBUCKET_CLIENT_ID=your_key", "BITBUCKET_CLIENT_SECRET=your_secret"],
  },
}

const ERROR_MESSAGES: Record<string, string> = {
  Configuration: "No OAuth providers configured. Add credentials to .env.local.",
  AccessDenied:  "Access was denied. Check the OAuth app permissions.",
  Verification:  "Token verification failed. Check your NEXTAUTH_SECRET.",
  Default:       "Authentication failed. Check your OAuth configuration.",
}

function SignInContent() {
  const params  = useSearchParams()
  const error   = params.get("error")
  const [providers, setProviders] = useState<Provider[]>([])
  const [showSetup, setShowSetup] = useState<string | null>(null)

  useEffect(() => {
    getProviders().then((p) => { if (p) setProviders(Object.values(p)) })
  }, [])

  const errorMsg = error ? (ERROR_MESSAGES[error] ?? ERROR_MESSAGES.Default) : null

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg0)", position: "relative", overflow: "hidden",
    }}>
      {/* Subtle dot grid */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)",
        backgroundSize: "28px 28px", opacity: .5, pointerEvents: "none",
      }} />

      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: 440 }}>
      {/* Card */}
      <div style={{
        width: "100%",
        background: "var(--bg1)", border: "1px solid var(--border2)",
        borderRadius: 16, overflow: "hidden",
        boxShadow: "0 0 0 1px rgba(255,255,255,.04), 0 32px 64px rgba(0,0,0,.5)",
      }}>

        {/* Top accent line */}
        <div style={{ height: 2, background: "var(--blue)" }} />

        {/* Header */}
        <div style={{ padding: "36px 36px 28px", textAlign: "center" }}>
          <div style={{ margin: "0 auto 20px", width: "fit-content" }}>
            <Logo size={52} radius={12} />
          </div>
          <h1 style={{ fontSize: 22, marginBottom: 8, letterSpacing: "-.02em", lineHeight: 1.2 }}>
            <span style={{ fontWeight: 400, color: "var(--txt1)" }}>Welcome to </span>
            <span style={{ fontWeight: 400, color: "var(--txt1)" }}>Git</span>
            <span style={{ fontWeight: 800, color: "var(--txt0)" }}>Wit</span>
          </h1>
          <p style={{ fontSize: 13, color: "var(--txt2)", lineHeight: 1.6, maxWidth: 280, margin: "0 auto" }}>
            Chat with your code. Index any repo and get AI-powered answers with file citations.
          </p>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "var(--border)", margin: "0 36px" }} />

        <div style={{ padding: "24px 36px 32px", display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Error */}
          {errorMsg && (
            <div style={{ background: "var(--red-dim)", border: "1px solid rgba(251,113,133,.2)", borderRadius: 9, padding: "10px 14px", fontSize: 12, color: "var(--red)", display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 4 }}>
              <i className="ti ti-alert-circle" style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }} />
              {errorMsg}
            </div>
          )}

          {/* Provider buttons */}
          {providers.map((p) => {
            const meta = PROVIDER_META[p.id] ?? { icon: "ti-key", bg: "var(--bg2)", border: "var(--border2)", hover: "var(--bg3)", note: undefined }
            const isLight = p.id === "google"
            return (
              <div key={p.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <button
                  onClick={() => signIn(p.id, { callbackUrl: "/" })}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    background: meta.bg, border: `1px solid ${meta.border}`,
                    borderRadius: 10, padding: "13px 16px",
                    fontSize: 14, fontWeight: 600,
                    color: isLight ? "#1f1f1f" : "#fff",
                    cursor: "pointer", transition: "all .15s", width: "100%",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = meta.hover; e.currentTarget.style.transform = "translateY(-1px)" }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = meta.bg; e.currentTarget.style.transform = "translateY(0)" }}
                >
                  <i className={`ti ${meta.icon}`} style={{ fontSize: 20, flexShrink: 0 }} />
                  <span style={{ flex: 1, textAlign: "left" }}>Continue with {p.name}</span>
                  <i className="ti ti-arrow-right" style={{ fontSize: 14, opacity: .5 }} />
                </button>
                {meta.note && (
                  <p style={{ fontSize: 11, color: "var(--txt2)", paddingLeft: 4, display: "flex", alignItems: "center", gap: 4 }}>
                    <i className="ti ti-info-circle" style={{ fontSize: 11 }} />
                    {meta.note}
                  </p>
                )}
              </div>
            )
          })}

          {/* Setup guides when no providers */}
          {providers.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ fontSize: 12, color: "var(--txt2)", textAlign: "center", marginBottom: 4 }}>
                No OAuth providers configured. Set one up to continue:
              </p>
              {Object.entries(SETUP_STEPS).map(([id, info]) => (
                <div key={id} style={{ border: "1px solid var(--border2)", borderRadius: 9, overflow: "hidden" }}>
                  <button
                    onClick={() => setShowSetup(showSetup === id ? null : id)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: "var(--bg2)", border: "none", cursor: "pointer", textAlign: "left" }}
                  >
                    <i className={`ti ${PROVIDER_META[id]?.icon ?? "ti-key"}`} style={{ fontSize: 16, color: "var(--txt1)" }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--txt0)", flex: 1 }}>{info.title}</span>
                    <i className={`ti ${showSetup === id ? "ti-chevron-up" : "ti-chevron-down"}`} style={{ fontSize: 12, color: "var(--txt2)" }} />
                  </button>
                  {showSetup === id && (
                    <div style={{ padding: "12px 14px", background: "var(--bg1)", display: "flex", flexDirection: "column", gap: 10 }}>
                      <ol style={{ paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>
                        {info.steps.map((s, i) => <li key={i} style={{ fontSize: 12, color: "var(--txt1)", lineHeight: 1.5 }}>{s}</li>)}
                      </ol>
                      <div style={{ background: "var(--bg0)", border: "1px solid var(--border2)", borderRadius: 6, padding: "8px 12px" }}>
                        {info.env.map((e) => <div key={e} style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--blue)", lineHeight: 1.8 }}>{e}</div>)}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Footer note */}
          {providers.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 0 0", borderTop: "1px solid var(--border)", marginTop: 4 }}>
              <i className="ti ti-shield-check" style={{ fontSize: 12, color: "var(--green)", flexShrink: 0 }} />
              <p style={{ fontSize: 11, color: "var(--txt2)", lineHeight: 1.5 }}>
                Your OAuth token is saved as your Git credential — private repos work automatically.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Feature pills */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
        {["AI Chat with Citations", "PR Code Review", "Hybrid RAG Search", "GitHub & Bitbucket", "15 Languages"].map((f) => (
          <span key={f} style={{ padding: "4px 12px", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 20, fontSize: 11, color: "var(--txt2)" }}>
            {f}
          </span>
        ))}
      </div>
      </div>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  )
}
