"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info)
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: 16, padding: 32, background: "var(--bg0)",
        }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "var(--red-dim)", border: "1px solid rgba(239,68,68,.2)", display: "grid", placeItems: "center" }}>
            <i className="ti ti-alert-triangle" style={{ fontSize: 26, color: "var(--red)" }} />
          </div>
          <div style={{ textAlign: "center", maxWidth: 360 }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--txt0)", marginBottom: 8 }}>Something went wrong</p>
            <p style={{ fontSize: 12, color: "var(--txt2)", lineHeight: 1.6, fontFamily: "var(--mono)", background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 12px", textAlign: "left" }}>
              {this.state.error.message}
            </p>
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ background: "var(--blue)", border: "none", borderRadius: 7, padding: "8px 20px", fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
