"use client"

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react"

type ToastType = "success" | "error" | "warning" | "info" | "confirm"

interface ToastItem {
  id: number
  type: ToastType
  message: string
  action?: { label: string; onClick: () => void }
  duration?: number
}

interface ToastContextValue {
  success: (msg: string) => void
  error:   (msg: string) => void
  warning: (msg: string) => void
  info:    (msg: string) => void
  confirm: (msg: string, onConfirm: () => void, confirmLabel?: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const ICON: Record<ToastType, string> = {
  success: "ti-check",
  error:   "ti-alert-circle",
  warning: "ti-alert-triangle",
  info:    "ti-info-circle",
  confirm: "ti-help-circle",
}
const COLOR: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: { bg: "var(--green-dim)",  border: "rgba(34,197,94,.2)",   icon: "var(--green)" },
  error:   { bg: "var(--red-dim)",    border: "rgba(239,68,68,.2)",    icon: "var(--red)" },
  warning: { bg: "var(--amber-dim)",  border: "rgba(245,158,11,.2)",   icon: "var(--amber)" },
  info:    { bg: "var(--blue-dim)",   border: "rgba(59,130,246,.2)",   icon: "var(--blue)" },
  confirm: { bg: "var(--bg2)",        border: "var(--border2)",         icon: "var(--txt1)" },
}

let _id = 0

function ToastEl({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const c = COLOR[toast.type]
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    if (toast.type !== "confirm" && toast.duration !== 0) {
      const t = setTimeout(() => { setVisible(false); setTimeout(() => onDismiss(toast.id), 300) }, toast.duration ?? 4000)
      return () => clearTimeout(t)
    }
  }, [toast.id, toast.type, toast.duration, onDismiss])

  return (
    <div style={{
      background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10,
      padding: "12px 14px", minWidth: 280, maxWidth: 380,
      display: "flex", alignItems: "flex-start", gap: 10,
      boxShadow: "0 8px 24px rgba(0,0,0,.35)",
      opacity: visible ? 1 : 0,
      transform: visible ? "translateX(0)" : "translateX(24px)",
      transition: "opacity .25s ease, transform .25s ease",
    }}>
      <i className={`ti ${ICON[toast.type]}`} style={{ fontSize: 16, color: c.icon, flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, color: "var(--txt0)", lineHeight: 1.5, margin: 0 }}>{toast.message}</p>
        {toast.action && (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              onClick={() => { toast.action!.onClick(); setVisible(false); setTimeout(() => onDismiss(toast.id), 300) }}
              style={{ background: "var(--red)", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 600, color: "#fff", cursor: "pointer" }}
            >
              {toast.action.label}
            </button>
            <button
              onClick={() => { setVisible(false); setTimeout(() => onDismiss(toast.id), 300) }}
              style={{ background: "none", border: "1px solid var(--border2)", borderRadius: 6, padding: "5px 12px", fontSize: 11, color: "var(--txt2)", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      {toast.type !== "confirm" && (
        <button
          onClick={() => { setVisible(false); setTimeout(() => onDismiss(toast.id), 300) }}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--txt2)", padding: 2, flexShrink: 0, display: "grid", placeItems: "center" }}
        >
          <i className="ti ti-x" style={{ fontSize: 12 }} />
        </button>
      )}
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: number) => setToasts((p) => p.filter((t) => t.id !== id)), [])

  const add = useCallback((type: ToastType, message: string, extra?: Partial<ToastItem>) => {
    const id = ++_id
    setToasts((p) => [...p, { id, type, message, ...extra }])
    return id
  }, [])

  const ctx: ToastContextValue = {
    success: (msg) => add("success", msg),
    error:   (msg) => add("error",   msg),
    warning: (msg) => add("warning", msg),
    info:    (msg) => add("info",    msg),
    confirm: (msg, onConfirm, confirmLabel = "Delete") =>
      add("confirm", msg, { action: { label: confirmLabel, onClick: onConfirm }, duration: 0 }),
  }

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {/* Toast container */}
      <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 999, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
        {toasts.map((t) => <ToastEl key={t.id} toast={t} onDismiss={dismiss} />)}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used inside ToastProvider")
  return ctx
}
