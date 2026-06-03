import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ConversationAutoRefresh } from "@/components/conversation-auto-refresh";
import { DeleteThreadButton } from "@/components/delete-thread-button";
import { RefreshButton } from "@/components/refresh-button";
import {
  MESSAGES_CONTAINER_ID,
  ScrollMessagesToBottom,
} from "@/components/scroll-messages-to-bottom";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = Promise<{ conversationId: string }>;

export default async function ConversationPage(props: { params: Params }) {
  const { conversationId } = await props.params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (
    session.user.role !== "ADMIN" &&
    session.user.role !== "SUB_ADMIN" &&
    session.user.role !== "INTERNAL_STAFF"
  ) {
    redirect("/dashboard");
  }

  const [conversation, allStaff] = await Promise.all([
    prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        studentProfile: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        messages: {
          include: { sender: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.user.findMany({
      where: { role: { in: ["ADMIN", "SUB_ADMIN", "INTERNAL_STAFF"] } },
      select: { id: true, name: true, email: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  if (!conversation) redirect("/dashboard/communication");

  if (session.user.role !== "ADMIN") {
    const isParticipant = conversation.participants.some(
      (participant) => participant.userId === session.user.id,
    );
    if (!isParticipant) redirect("/dashboard/communication");
  }

  const unreadMessageIds = conversation.messages
    .filter((m) => m.senderId !== session.user.id)
    .map((m) => m.id);
  if (unreadMessageIds.length > 0) {
    const existingReads = await prisma.messageRead.findMany({
      where: {
        messageId: { in: unreadMessageIds },
        userId: session.user.id,
      },
      select: { messageId: true },
    });
    const existingIds = new Set(existingReads.map((r) => r.messageId));
    const toMark = unreadMessageIds.filter((id) => !existingIds.has(id));
    if (toMark.length > 0) {
      await prisma.messageRead.createMany({
        data: toMark.map((messageId) => ({
          messageId,
          userId: session.user.id,
        })),
      });
    }
  }

  const canManageTeam = conversation.type === "TEAM";
  const canDeleteThread = conversation.type === "TEAM" || conversation.type === "DIRECT";
  const participantIds = new Set(conversation.participants.map((p) => p.userId));
  const availableToAdd = allStaff.filter((u) => !participantIds.has(u.id));

  return (
    <section className="space-y-6">
      <ConversationAutoRefresh />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {conversation.title ?? "Conversation"}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            {conversation.studentProfile && (
              <span>
                Client: {conversation.studentProfile.user.name ?? conversation.studentProfile.user.email}
              </span>
            )}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{conversation.type}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <Link
            href="/dashboard/communication"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            ← Back
          </Link>
          {canDeleteThread && (
            <DeleteThreadButton
              conversationId={conversation.id}
              action={deleteConversationAction}
              className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              Delete thread
            </DeleteThreadButton>
          )}
        </div>
      </div>

      {canManageTeam && (
        <section className="rounded-2xl border border-rose-100 bg-white p-4 shadow-sm">
          <form action={updateConversationAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="conversationId" value={conversation.id} />
            <label className="flex-1 min-w-[200px]">
              <span className="text-xs font-medium text-slate-500">Edit thread title</span>
              <input
                name="title"
                defaultValue={conversation.title ?? ""}
                required
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Save
            </button>
          </form>
        </section>
      )}

      <section className="rounded-2xl border border-rose-100 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Participants</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {conversation.participants.map((participant) => (
            <span
              key={participant.id}
              className="inline-flex items-center rounded-full bg-rose-50 px-3 py-1 text-sm font-medium text-rose-700"
            >
              {participant.user.name ?? participant.user.email}
            </span>
          ))}
        </div>
        {availableToAdd.length > 0 && (
          <form action={addParticipantsAction} className="mt-4 space-y-2 border-t border-slate-100 pt-4">
            <input type="hidden" name="conversationId" value={conversation.id} />
            <p className="text-xs font-medium text-slate-600">Add more participants</p>
            <div className="flex flex-wrap gap-2">
              {availableToAdd.map((user) => (
                <label
                  key={user.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 transition hover:border-rose-200 hover:bg-rose-50/50"
                >
                  <input
                    type="checkbox"
                    name="participantIds"
                    value={user.id}
                    className="h-4 w-4 rounded border-slate-300 text-rose-500"
                  />
                  <span className="text-sm">{user.name ?? user.email}</span>
                </label>
              ))}
            </div>
            <button
              type="submit"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Add selected
            </button>
          </form>
        )}
      </section>

      <section className="rounded-2xl border border-rose-100 bg-white shadow-sm">
        <ScrollMessagesToBottom />
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4">
          <h2 className="text-sm font-semibold text-slate-900">Messages</h2>
          <p className="text-xs text-slate-500">Auto-refreshes every 15s · Click Refresh for latest</p>
        </div>
        <div
          id={MESSAGES_CONTAINER_ID}
          className="h-[min(32rem,70vh)] overflow-y-auto overflow-x-hidden p-4"
        >
          {conversation.messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-slate-500">No messages yet.</p>
              <p className="mt-1 text-sm text-slate-400">Send a message below to start the conversation.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {conversation.messages.map((message) => {
                const isOwn = message.senderId === session.user.id;
                return (
                  <div
                    key={message.id}
                    className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] min-w-0 rounded-2xl px-4 py-2.5 break-words ${
                        isOwn
                          ? "bg-gradient-to-r from-rose-500 to-blue-500 text-white"
                          : "bg-slate-100 text-slate-900"
                      }`}
                    >
                      {!isOwn && (
                        <p className="text-xs font-semibold text-rose-600">
                          {message.sender.name ?? message.sender.email}
                        </p>
                      )}
                      <p className={`text-sm break-words whitespace-pre-wrap ${isOwn ? "text-white" : "text-slate-700"}`}>
                        {message.content}
                      </p>
                      <p className={`mt-1 text-[11px] ${isOwn ? "text-white/80" : "text-slate-500"}`}>
                        {message.createdAt.toLocaleString()}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <form action={sendMessageAction} className="border-t border-slate-100 p-4">
          <input type="hidden" name="conversationId" value={conversation.id} />
          <div className="flex gap-2">
            <input
              name="content"
              required
              placeholder="Type your message..."
              className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
            <button
              type="submit"
              className="shrink-0 rounded-xl bg-gradient-to-r from-rose-500 to-blue-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:opacity-90"
            >
              Send
            </button>
          </div>
        </form>
      </section>
    </section>
  );
}

async function sendMessageAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const conversationId = String(formData.get("conversationId") ?? "");
  const content = String(formData.get("content") ?? "").trim();
  if (!conversationId || !content) redirect("/dashboard/communication");

  const membership = await prisma.conversationParticipant.findUnique({
    where: {
      conversationId_userId: {
        conversationId,
        userId: session.user.id,
      },
    },
    select: { id: true },
  });

  if (!membership && session.user.role !== "ADMIN") {
    redirect("/dashboard/communication");
  }

  if (!membership && session.user.role === "ADMIN") {
    await prisma.conversationParticipant.create({
      data: {
        conversationId,
        userId: session.user.id,
      },
    });
  }

  await prisma.message.create({
    data: {
      conversationId,
      senderId: session.user.id,
      content,
    },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  revalidatePath(`/dashboard/communication/${conversationId}`);
  revalidatePath("/dashboard/communication");
  redirect(`/dashboard/communication/${conversationId}`);
}

async function addParticipantsAction(formData: FormData) {
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

  const conversationId = String(formData.get("conversationId") ?? "");
  const participantIds = formData.getAll("participantIds").filter((v): v is string => typeof v === "string" && v.length > 0);
  const uniqueIds = [...new Set(participantIds)];
  if (!conversationId || uniqueIds.length === 0) redirect(`/dashboard/communication/${conversationId}`);

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { participants: { select: { userId: true } } },
  });
  if (!conversation) redirect("/dashboard/communication");

  if (session.user.role !== "ADMIN") {
    const isParticipant = conversation.participants.some((p) => p.userId === session.user.id);
    if (!isParticipant) redirect("/dashboard/communication");
  }

  const existingIds = new Set(conversation.participants.map((p) => p.userId));
  const toAdd = uniqueIds.filter((id) => !existingIds.has(id));

  if (toAdd.length > 0) {
    await prisma.conversationParticipant.createMany({
      data: toAdd.map((userId) => ({ conversationId, userId })),
    });
  }

  revalidatePath(`/dashboard/communication/${conversationId}`);
  revalidatePath("/dashboard/communication");
  redirect(`/dashboard/communication/${conversationId}`);
}

async function updateConversationAction(formData: FormData) {
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

  const conversationId = String(formData.get("conversationId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!conversationId || !title) redirect(`/dashboard/communication/${conversationId}`);

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { type: true, participants: { select: { userId: true } } },
  });
  if (!conversation) redirect("/dashboard/communication");
  if (conversation.type !== "TEAM") redirect(`/dashboard/communication/${conversationId}`);

  if (session.user.role !== "ADMIN") {
    const isParticipant = conversation.participants.some((p) => p.userId === session.user.id);
    if (!isParticipant) redirect("/dashboard/communication");
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { title },
  });

  revalidatePath(`/dashboard/communication/${conversationId}`);
  revalidatePath("/dashboard/communication");
  redirect(`/dashboard/communication/${conversationId}`);
}

async function deleteConversationAction(formData: FormData) {
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

  const conversationId = String(formData.get("conversationId") ?? "");
  if (!conversationId) redirect("/dashboard/communication");

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { type: true, participants: { select: { userId: true } } },
  });
  if (!conversation) redirect("/dashboard/communication");
  if (conversation.type === "STUDENT_THREAD") redirect("/dashboard/communication");

  if (session.user.role !== "ADMIN") {
    const isParticipant = conversation.participants.some((p) => p.userId === session.user.id);
    if (!isParticipant) redirect("/dashboard/communication");
  }

  await prisma.conversation.delete({
    where: { id: conversationId },
  });

  revalidatePath("/dashboard/communication");
  redirect("/dashboard/communication");
}
