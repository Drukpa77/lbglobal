import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type Params = Promise<{ id: string }>;

export async function GET(_request: Request, props: { params: Params }) {
  const { id: conversationId } = await props.params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentUserId = session.user.id;

  // Admins can read any conversation; others must be participants
  if (session.user.role !== "ADMIN") {
    const membership = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId: currentUserId },
      },
    });
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: {
      sender: { select: { id: true, name: true, email: true } },
    },
  });

  // Mark all incoming messages as read
  const unread = messages.filter((m) => m.senderId !== currentUserId);
  for (const msg of unread) {
    await prisma.messageRead.upsert({
      where: {
        messageId_userId: { messageId: msg.id, userId: currentUserId },
      },
      create: { messageId: msg.id, userId: currentUserId },
      update: {},
    });
  }

  return NextResponse.json({ messages });
}

export async function POST(request: Request, props: { params: Params }) {
  const { id: conversationId } = await props.params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentUserId = session.user.id;

  // Verify participant
  if (session.user.role !== "ADMIN") {
    const membership = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId: currentUserId },
      },
    });
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const body = await request.json();
  const content = (body as { content?: string }).content?.trim();
  if (!content) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  const message = await prisma.message.create({
    data: { conversationId, senderId: currentUserId, content },
    include: {
      sender: { select: { id: true, name: true, email: true } },
    },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({ message });
}
