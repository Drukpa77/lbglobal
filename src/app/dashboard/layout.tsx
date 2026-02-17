import Link from "next/link";
import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-semibold">L&B Global</p>
            <p className="text-xs text-gray-600">
              Signed in as {session.user.email} ({session.user.role})
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm underline">
              Dashboard Home
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md bg-black px-3 py-2 text-sm text-white"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}

async function logoutAction() {
  "use server";
  await signOut({ redirectTo: "/login" });
}
