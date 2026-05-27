import type { NextAuthOptions } from "next-auth"
import GithubProvider  from "next-auth/providers/github"
import GoogleProvider  from "next-auth/providers/google"

// Bitbucket Cloud OAuth 2.0
const BitbucketProvider = {
  id: "bitbucket",
  name: "Bitbucket",
  type: "oauth" as const,
  authorization: {
    url: "https://bitbucket.org/site/oauth2/authorize",
    params: { response_type: "code" },
  },
  token: "https://bitbucket.org/site/oauth2/access_token",
  userinfo: "https://api.bitbucket.org/2.0/user",
  clientId:     process.env.BITBUCKET_CLIENT_ID,
  clientSecret: process.env.BITBUCKET_CLIENT_SECRET,
  profile(profile: Record<string, unknown>) {
    return {
      id:    profile.account_id as string,
      name:  profile.display_name as string,
      email: (profile.username as string) + "@bitbucket",
      image: (profile.links as Record<string, Record<string, string>>)?.avatar?.href,
    }
  },
}

const providers = []

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  providers.push(GithubProvider({
    clientId:     process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    authorization: { params: { scope: "read:user user:email repo" } },
  }))
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(GoogleProvider({
    clientId:     process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  }))
}

if (process.env.BITBUCKET_CLIENT_ID && process.env.BITBUCKET_CLIENT_SECRET) {
  providers.push(BitbucketProvider as never)
}

export const authOptions: NextAuthOptions = {
  providers,

  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken  = account.access_token
        token.provider     = account.provider
      }
      return token
    },
    async session({ session, token }) {
      return {
        ...session,
        accessToken: token.accessToken as string | undefined,
        provider:    token.provider    as string | undefined,
      }
    },
  },

  pages: {
    signIn: "/signin",
    error:  "/signin",
  },

  secret: process.env.NEXTAUTH_SECRET,
}
