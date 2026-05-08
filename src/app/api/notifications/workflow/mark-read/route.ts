import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  if (!["ADMIN", "SUB_ADMIN", "INTERNAL_STAFF"].includes(session.user.role)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const payload = (await req.json().catch(() => ({}))) as {
    studentId?: string;
    notificationId?: string;
  };

  // Single-item mode: mark exactly one notification as read. Used by the bell
  // dropdown when a recipient clicks a specific item. We still scope the update
  // by recipientId so a user can never flip another user's notifications.
  const notificationId = String(payload.notificationId ?? "").trim();
  if (notificationId) {
    const result = await prisma.workflowNotification.updateMany({
      where: {
        id: notificationId,
        recipientId: session.user.id,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true, updated: result.count }, { status: 200 });
  }

  // Bulk mode: clear every unread notification this recipient has for the
  // given student. Triggered by DocumentNotificationReadTracker when staff
  // open a student's Tasks & Documents tab.
  const studentId = String(payload.studentId ?? "").trim();
  if (!studentId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: studentId },
    select: { id: true },
  });
  if (!profile) {
    return NextResponse.json({ ok: true, updated: 0 }, { status: 200 });
  }

  const result = await prisma.workflowNotification.updateMany({
    where: {
      recipientId: session.user.id,
      studentProfileId: profile.id,
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ ok: true, updated: result.count }, { status: 200 });
}
