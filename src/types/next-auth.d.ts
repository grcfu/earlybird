import type { DefaultSession } from "next-auth";

// Surface our extra fields on the session's user.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      trackerKey: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    trackerKey?: string | null;
  }
}
