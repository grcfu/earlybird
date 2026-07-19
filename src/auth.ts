import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

// Google sign-in on the existing Neon/Prisma stack. Database sessions, so the
// login persists server-side. The session callback surfaces the user id and
// their application-tracker key (see the User model) to the app.
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Google],
  session: { strategy: "database" },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      // trackerKey is added to the adapter user via the Prisma schema.
      session.user.trackerKey =
        (user as { trackerKey?: string | null }).trackerKey ?? null;
      return session;
    },
  },
});

// Read the session without ever throwing. Auth.js requires AUTH_SECRET (and the
// Google credentials) in production; until those env vars are set, treat it as
// "signed out" so pages still render instead of 500-ing.
export async function safeAuth() {
  try {
    return await auth();
  } catch {
    return null;
  }
}
