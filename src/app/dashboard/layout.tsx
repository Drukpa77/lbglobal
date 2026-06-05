import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";
import { ChatPopup } from "@/components/chat-popup";
import { WorkflowNotificationsBell } from "@/components/workflow-notifications-bell";
import { UnreadChatBadge } from "@/components/unread-chat-badge";
import { StudentSearch } from "@/components/student-search";
import { getRoleLabel } from "@/lib/roles";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const showChat =
    session.user.role === "ADMIN" ||
    session.user.role === "SUB_ADMIN" ||
    session.user.role === "INTERNAL_STAFF";
  const showWorkflowNotifications = showChat;
  const isSubAdmin = session.user.role === "SUB_ADMIN";

  return (
    <div className="portal-theme min-h-screen text-slate-900 dashboard-app">
      {isSubAdmin ? (
        <div className="dashboard-shell flex min-h-screen bg-slate-100">
          <div className="flex min-h-screen min-w-0 flex-1 flex-col">
            <header className="relative z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
              <div className="dashboard-topbar-inner mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
                <div className="min-w-0 flex items-center gap-3">
                  <Link href="/" className="flex min-w-0 items-center gap-3">
                    <Image
                      src="/loogo.png"
                      alt="L&B Global logo"
                      width={40}
                      height={40}
                      className="h-10 w-10 rounded-xl border border-slate-200 bg-white p-1 object-contain shadow-sm"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">L&B Global</p>
                      <p className="truncate text-xs text-slate-600">Signed in as {session.user.email}</p>
                    </div>
                  </Link>
                  <span className="hidden rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 sm:inline-flex">
                    {getRoleLabel(session.user.role)}
                  </span>
                </div>
                <div className="dashboard-topbar-actions flex items-center gap-2">
                  {showChat && (
                    <div className="hidden lg:block">
                      <StudentSearch />
                    </div>
                  )}
                  <Link
                    href="/"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Home
                  </Link>
                  <Link
                    href="/dashboard"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    My Dashboard
                  </Link>
                  {showWorkflowNotifications && <WorkflowNotificationsBell />}
                  {showChat && <UnreadChatBadge />}
                  <form action={logoutAction}>
                    <button
                      type="submit"
                      className="rounded-lg bg-gradient-to-r from-rose-500 to-blue-500 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
                    >
                      Sign out
                    </button>
                  </form>
                </div>
              </div>
            </header>
            <main className="dashboard-main mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6">
              {children}
            </main>
          </div>
        </div>
      ) : (
        <>
          <header className="relative z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
            <div className="dashboard-topbar-inner mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
              <div className="min-w-0 flex items-center gap-3">
                <Link href="/" className="flex min-w-0 items-center gap-3">
                  <Image
                    src="/loogo.png"
                    alt="L&B Global logo"
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-xl border border-slate-200 bg-white p-1 object-contain shadow-sm"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">L&B Global</p>
                    <p className="truncate text-xs text-slate-600">Signed in as {session.user.email}</p>
                  </div>
                </Link>
                <span className="hidden rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 sm:inline-flex">
                  {getRoleLabel(session.user.role)}
                </span>
              </div>

              <div className="dashboard-topbar-actions flex items-center gap-2">
                {showChat && (
                  <div className="hidden lg:block">
                    <StudentSearch />
                  </div>
                )}
                <Link
                  href="/"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Home
                </Link>
                <Link
                  href="/dashboard"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  My Dashboard
                </Link>
                {showWorkflowNotifications && <WorkflowNotificationsBell />}
                {showChat && <UnreadChatBadge />}
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="rounded-lg bg-gradient-to-r from-rose-500 to-blue-500 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            </div>
          </header>
          <main className="dashboard-main mx-auto max-w-7xl px-6 py-8">{children}</main>
        </>
      )}

      {showChat && <ChatPopup currentUserId={session.user.id} />}
    </div>
  );
}

async function logoutAction() {
  "use server";
  await signOut({ redirectTo: "/login" });
}
