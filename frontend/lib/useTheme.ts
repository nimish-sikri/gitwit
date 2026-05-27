"use client"

import { useEffect, useState } from "react"

export function useTheme(): "dark" | "light" {
  // Always start with "dark" to match SSR, then sync from DOM after hydration
  const [theme, setTheme] = useState<"dark" | "light">("dark")

  useEffect(() => {
    // Read initial value from DOM (set by inline script in layout.tsx)
    const current = document.documentElement.getAttribute("data-theme")
    if (current === "light") setTheme("light")

    // Watch for subsequent changes
    const observer = new MutationObserver(() => {
      const t = document.documentElement.getAttribute("data-theme")
      setTheme(t === "light" ? "light" : "dark")
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
    return () => observer.disconnect()
  }, [])

  return theme
}
