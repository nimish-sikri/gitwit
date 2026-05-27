import { NextRequest } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

const BACKEND = process.env.BACKEND_URL || "http://localhost:8001"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ repoId: string }> }
) {
  const { repoId } = await params
  const body    = await req.text()
  const session = await getServerSession(authOptions)

  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (session?.user?.email) headers["X-User-ID"] = session.user.email

  const backendRes = await fetch(
    `${BACKEND}/api/v1/repos/${repoId}/chat`,
    { method: "POST", headers, body }
  )

  if (!backendRes.ok || !backendRes.body) {
    return new Response("Backend error", { status: backendRes.status })
  }

  return new Response(backendRes.body, {
    headers: {
      "Content-Type":    "text/event-stream",
      "Cache-Control":   "no-cache",
      "X-Accel-Buffering": "no",
    },
  })
}
