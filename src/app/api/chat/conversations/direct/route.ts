import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { targetUserId, createIfMissing } = body as {
    targetUserId?: string;
    createIfMissing?: boolean;
  };

  if (!targetUserId) {
    return NextResponse.json(
      { error: "targetUserId is required" },
      { status: 400 },
    );
  }

  const currentUserId = session.user.id;
  if (targetUserId === currentUserId) {
    return NextResponse.json(
      { error: "Cannot create a conversation with yourself" },
      { status: 400 },
    );
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, role: true },
  });
  if (!target || target.role === "USER") {
    return NextResponse.json(
      { error: "Target user not found" },
      { status: 404 },
    );
  }

  // Find an existing DIRECT conversation between exactly these two users.
  const existing = await prisma.conversation.findFirst({
    where: {
      type: "DIRECT",
      AND: [
        { participants: { some: { userId: currentUserId } } },
        { participants: { some: { userId: targetUserId } } },
        {
          participants: {
            every: {
              userId: { in: [currentUserId, targetUserId] },
            },
          },
        },
      ],
    },
    orderBy: { updatedAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        take: 100,
        include: {
          sender: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (existing) {
    await markAsRead(existing.messages, currentUserId);
    return NextResponse.json({ conversation: existing });
  }

  if (!createIfMissing) {
    return NextResponse.json({ conversation: null });
  }

  // Create a new DIRECT conversation
  const conversation = await prisma.conversation.create({
    data: {
      type: "DIRECT",
      createdById: currentUserId,
      participants: {
        create: [{ userId: currentUserId }, { userId: targetUserId }],
      },
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        take: 100,
        include: {
          sender: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  return NextResponse.json({ conversation });
}

async function markAsRead(
  messages: Array<{ id: string; senderId: string }>,
  userId: string,
) {
  const unread = messages.filter((m) => m.senderId !== userId);
  for (const msg of unread) {
    await prisma.messageRead.upsert({
      where: { messageId_userId: { messageId: msg.id, userId } },
      create: { messageId: msg.id, userId },
      update: {},
    });
  }
}
