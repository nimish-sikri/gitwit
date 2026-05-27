import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    // Inject user identity into backend proxy requests
    if (token?.email && req.nextUrl.pathname.startsWith("/api/backend")) {
      const headers = new Headers(req.headers)
      headers.set("X-User-ID", token.email as string)
      return NextResponse.next({ request: { headers } })
    }
    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
)

export const config = {
  matcher: [
    "/((?!signin|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
}
