import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_URL || "http://localhost:8001"

async function proxy(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const session  = await getServerSession(authOptions)
  const pathStr  = path.join("/")

  // Preserve query string
  const search = req.nextUrl.search
  const url    = `${BACKEND}/${pathStr}${search}`

  const headers = new Headers(req.headers)
  headers.delete("host")

  // Inject authenticated user identity for per-user isolation
  if (session?.user?.email) {
    headers.set("X-User-ID", session.user.email)
  }

  const body = req.method !== "GET" && req.method !== "HEAD"
    ? await req.arrayBuffer()
    : undefined

  const res = await fetch(url, {
    method:  req.method,
    headers,
    body,
    // @ts-expect-error - Node.js fetch
    duplex: "half",
  })

  const resHeaders = new Headers(res.headers)
  resHeaders.delete("content-encoding")

  return new NextResponse(res.body, {
    status:  res.status,
    headers: resHeaders,
  })
}

export const GET     = proxy
export const POST    = proxy
export const PUT     = proxy
export const PATCH   = proxy
export const DELETE  = proxy
export const OPTIONS = proxy
