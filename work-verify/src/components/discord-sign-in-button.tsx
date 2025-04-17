import { signInAuth, signOutAuth } from "@//actions/auth";
import { useSession } from "next-auth/react";
import Link from "next/link";

export function DiscordSignInButton() {
  const { data: session } = useSession();

  if (session) {
    return (
      <div className="flex gap-2">
        <Link
          href="/vault"
          className="w-full font-medium flex items-center gap-2 px-4 py-3 bg-violet-500 text-white rounded hover:bg-violet-600 cursor-pointer disabled:cursor-not-allowed disabled:bg-zinc-500"
        >
          My vault
        </Link>
        <form action={async () => await signOutAuth()}>
          <button
            type="submit"
            className="w-full font-medium flex items-center gap-2 px-4 py-3 cursor-pointer"
          >
            Logout
          </button>
        </form>
      </div>
    );
  }

  return (
    <form action={async () => await signInAuth()}>
      <button
        type="submit"
        className="w-full font-medium flex items-center gap-2 px-4 py-3 bg-violet-500 text-white rounded hover:bg-violet-600 cursor-pointer disabled:cursor-not-allowed disabled:bg-zinc-500"
      >
        <img src="/discord-white-icon.svg" className="size-4" />
        Sign in with Discord
      </button>
    </form>
  );
}
