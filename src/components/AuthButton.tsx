import { safeAuth, signIn, signOut } from "@/auth";

// Google sign-in / sign-out control. Server component: reads the session and
// uses Auth.js server actions for the OAuth redirect + logout.
export async function AuthButton() {
  const session = await safeAuth();

  if (session?.user) {
    const label = session.user.name ?? session.user.email ?? "Account";
    return (
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
        className="flex items-center gap-2"
      >
        {session.user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={session.user.image}
            alt=""
            className="h-6 w-6 rounded-full border border-line"
          />
        ) : null}
        <span className="hidden max-w-[9rem] truncate font-mono text-[11px] text-ink-soft sm:inline">
          {label}
        </span>
        <button
          type="submit"
          className="pop rounded-lg border border-line bg-surface px-2.5 py-1.5 font-mono text-[11px] text-ink-soft shadow-pop-sm hover:text-ink"
        >
          sign out
        </button>
      </form>
    );
  }

  return (
    <form
      action={async () => {
        "use server";
        await signIn("google");
      }}
    >
      <button
        type="submit"
        className="pop rounded-lg border border-accent-bright bg-accent-soft px-3 py-1.5 font-mono text-[11px] font-medium text-accent-deep shadow-pop-sm hover:border-accent"
      >
        Sign in with Google
      </button>
    </form>
  );
}
