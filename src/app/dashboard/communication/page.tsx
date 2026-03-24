import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { CommunicationAutoRefresh } from "@/components/communication-auto-refresh";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function CommunicationIndexPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (
    session.user.role !== "ADMIN" &&
    session.user.role !== "SUB_ADMIN" &&
    session.user.role !== "INTERNAL_STAFF"
  ) {
    redirect("/dashboard");
  }

  const conversationWhere =
    session.user.role === "ADMIN"
      ? undefined
      : { participants: { some: { userId: session.user.id } } };

  const [conversations, users, unreadCount] = await Promise.all([
    prisma.conversation.findMany({
      where: conversationWhere,
      include: {
        studentProfile: {
          include: { user: { select: { name: true, email: true } } },
        },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.user.findMany({
      where: {
        role: { in: ["ADMIN", "SUB_ADMIN", "INTERNAL_STAFF"] },
      },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { createdAt: "asc" },
    }),
    (async () => {
      const ids = await prisma.conversation.findMany({
        where: { participants: { some: { userId: session.user.id } } },
        select: { id: true },
        take: 500,
      }).then((r) => r.map((x) => x.id));
      if (ids.length === 0) return 0;
      return prisma.message.count({
        where: {
          conversationId: { in: ids },
          senderId: { not: session.user.id },
          reads: { none: { userId: session.user.id } },
        },
      });
    })(),
  ]);
  const visibleConversations = conversations.filter(
    (conversation) =>
      conversation.type !== "DIRECT" || conversation._count.messages > 0,
  );

  return (
    <section className="space-y-6">
      <CommunicationAutoRefresh />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Internal Communication</h1>
          <p className="mt-1 text-sm text-slate-600">
            Chat with your team and manage conversation threads.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unreadCount > 0 && (
            <form action={markAllAsReadAction}>
              <button
                type="submit"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Mark all as read ({unreadCount})
              </button>
            </form>
          )}
          <Link
            href="/dashboard"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            ← Back to dashboard
          </Link>
        </div>
      </div>

      <section className="rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Create new thread</h2>
        <p className="mt-1 text-sm text-slate-600">
          Add participants so they can see the thread and receive your messages.
        </p>
        <form action={createTeamConversationAction} className="mt-4 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Thread title</span>
            <input
              name="title"
              required
              placeholder="e.g. Visa batch Q1 discussion"
              className="mt-1 block w-full max-w-md rounded-lg border border-slate-300 px-4 py-2.5 text-sm placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Add participants</span>
            <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              {users
                .filter((user) => user.id !== session.user.id)
                .map((user) => (
                  <label
                    key={user.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-white"
                  >
                    <input
                      type="checkbox"
                      name="participantIds"
                      value={user.id}
                      className="h-4 w-4 rounded border-slate-300 text-rose-500 focus:ring-rose-400"
                    />
                    <span className="text-sm text-slate-700">
                      {user.name ?? user.email}
                      <span className="ml-1.5 text-xs text-slate-500">({user.role.replace("_", " ")})</span>
                    </span>
                  </label>
                ))}
            </div>
          </label>
          <button
            type="submit"
            className="rounded-lg bg-gradient-to-r from-rose-500 to-blue-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:opacity-90"
          >
            Create thread
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Your threads</h2>
        {visibleConversations.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-12 text-center">
            <p className="text-slate-600">No conversations yet.</p>
            <p className="mt-1 text-sm text-slate-500">Create a thread above to get started.</p>
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {visibleConversations.map((conversation) => (
              <li key={conversation.id}>
                <Link
                  href={`/dashboard/communication/${conversation.id}`}
                  className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4 transition hover:border-rose-200 hover:bg-rose-50/30"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">
                      {conversation.title ?? "Conversation"}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0 text-xs text-slate-500">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5">{conversation.type}</span>
                      {conversation.studentProfile && (
                        <span>Student: {conversation.studentProfile.user.name ?? conversation.studentProfile.user.email}</span>
                      )}
                      <span>{conversation._count.messages} messages</span>
                      <span>· Updated {conversation.updatedAt.toLocaleString()}</span>
                    </p>
                  </div>
                  <span className="shrink-0 text-slate-400">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

async function createTeamConversationAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (
    session.user.role !== "ADMIN" &&
    session.user.role !== "SUB_ADMIN" &&
    session.user.role !== "INTERNAL_STAFF"
  ) {
    redirect("/dashboard");
  }
  const title = String(formData.get("title") ?? "").trim();
  const participantIds = formData.getAll("participantIds").filter((v): v is string => typeof v === "string" && v.length > 0);
  const uniqueIds = [...new Set(participantIds)];
  if (!title) redirect("/dashboard/communication");

  const conversation = await prisma.conversation.create({
    data: {
      type: "TEAM",
      title,
      createdById: session.user.id,
      participants: {
        create: [
          { userId: session.user.id },
          ...uniqueIds.map((userId) => ({ userId })),
        ],
      },
    },
    select: { id: true },
  });
  redirect(`/dashboard/communication/${conversation.id}`);
}

async function markAllAsReadAction() {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (
    session.user.role !== "ADMIN" &&
    session.user.role !== "SUB_ADMIN" &&
    session.user.role !== "INTERNAL_STAFF"
  ) {
    redirect("/dashboard/communication");
  }

  const conversationIds = await prisma.conversation.findMany({
    where: { participants: { some: { userId: session.user.id } } },
    select: { id: true },
    take: 500,
  }).then((r) => r.map((x) => x.id));

  if (conversationIds.length > 0) {
    const unreadMessages = await prisma.message.findMany({
      where: {
        conversationId: { in: conversationIds },
        senderId: { not: session.user.id },
        reads: { none: { userId: session.user.id } },
      },
      select: { id: true },
    });
    if (unreadMessages.length > 0) {
      await prisma.messageRead.createMany({
        data: unreadMessages.map((m) => ({
          messageId: m.id,
          userId: session.user.id,
        })),
      });
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/communication");
  redirect("/dashboard/communication");
}
