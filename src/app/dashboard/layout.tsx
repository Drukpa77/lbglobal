import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Bell,
  CircleHelp,
  FileSpreadsheet,
  Home,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Users,
} from "lucide-react";

import { auth, signOut } from "@/auth";
import { ChatPopup } from "@/components/chat-popup";
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
  const isSubAdmin = session.user.role === "SUB_ADMIN";

  return (
    <div className="portal-theme min-h-screen text-slate-900">
      {isSubAdmin ? (
        <div className="flex min-h-screen bg-slate-100">
          <aside className="hidden w-64 flex-col border-r border-slate-800 bg-slate-900 text-slate-200 lg:flex">
            <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-4">
              <Image
                src="/loogo.png"
                alt="L&B Global logo"
                width={38}
                height={38}
                className="h-9 w-9 rounded-md bg-white p-1 object-contain"
              />
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-white">L&B Global</p>
                <p className="truncate text-xs text-slate-400">Agent CRM panel</p>
              </div>
            </div>
            <nav className="space-y-1 px-2 py-4">
              <SidebarLink href="/dashboard/sub-admin" label="Dashboard" icon={<LayoutDashboard size={16} />} />
              <SidebarLink href="/dashboard/sub-admin?tab=students" label="Students" icon={<Users size={16} />} />
              <SidebarLink
                href="/dashboard/sub-admin?tab=students&queue=all"
                label="Applications"
                icon={<FileSpreadsheet size={16} />}
              />
              <SidebarLink href="/dashboard/communication" label="Messages" icon={<MessageSquare size={16} />} />
              <SidebarLink href="/" label="Website Home" icon={<Home size={16} />} />
            </nav>
            <div className="mt-auto border-t border-slate-800 px-3 py-4">
              <p className="mb-2 px-2 text-[11px] uppercase tracking-wide text-slate-500">Need help?</p>
              <Link
                href="/dashboard/sub-admin?tab=overview"
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
              >
                <CircleHelp size={15} />
                Dashboard guide
              </Link>
            </div>
          </aside>

          <div className="flex min-h-screen min-w-0 flex-1 flex-col">
            <header className="border-b border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="rounded-full bg-emerald-500/15 p-1.5 text-emerald-700">
                    <Bell size={14} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      Welcome, {session.user.name ?? "Agent"}
                    </p>
                    <p className="truncate text-xs text-slate-600">{session.user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {showChat && <UnreadChatBadge />}
                  <span className="hidden rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 sm:inline-flex">
                    {getRoleLabel(session.user.role)}
                  </span>
                  <form action={logoutAction}>
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      <LogOut size={14} />
                      Sign out
                    </button>
                  </form>
                </div>
              </div>
            </header>
            <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6">{children}</main>
          </div>
        </div>
      ) : (
        <>
          <header className="border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
            <div className="dashboard-topbar-inner mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
              <div className="flex items-center gap-3">
                <Image
                  src="/loogo.png"
                  alt="L&B Global logo"
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-xl border border-slate-200 bg-white p-1 object-contain shadow-sm"
                />
                <div>
                  <p className="text-sm font-semibold text-slate-900">L&B Global</p>
                  <p className="text-xs text-slate-600">Signed in as {session.user.email}</p>
                </div>
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
          <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
        </>
      )}

      {showChat && <ChatPopup currentUserId={session.user.id} />}
    </div>
  );
}

function SidebarLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
    >
      <span className="text-slate-400">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

async function logoutAction() {
  "use server";
  await signOut({ redirectTo: "/login" });
}
