import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ actionRequiredCount: 0, groups: [] }, { status: 200 });
  }

  if (!["ADMIN", "SUB_ADMIN", "INTERNAL_STAFF"].includes(session.user.role)) {
    return NextResponse.json({ actionRequiredCount: 0, groups: [] }, { status: 200 });
  }

  const notifications = await prisma.workflowNotification.findMany({
    where: { recipientId: session.user.id },
    include: {
      studentProfile: {
        select: { user: { select: { id: true, name: true, email: true } } },
      },
    },
    orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
    take: 80,
  });

  const actionRequiredCount = notifications.filter((item) => !item.readAt && item.actionRequired).length;
  const groupsMap = new Map<
    string,
    {
      studentId: string;
      studentName: string;
      unreadCount: number;
      items: Array<{
        id: string;
        title: string;
        message: string;
        note: string | null;
        link: string;
        type: string;
        actionRequired: boolean;
        isRead: boolean;
        createdAt: string;
      }>;
    }
  >();

  for (const notification of notifications) {
    const studentId = notification.studentProfile.user.id;
    const studentName = notification.studentProfile.user.name ?? notification.studentProfile.user.email;
    const group = groupsMap.get(studentId) ?? {
      studentId,
      studentName,
      unreadCount: 0,
      items: [],
    };
    if (!notification.readAt) group.unreadCount += 1;
    group.items.push({
      id: notification.id,
      title: notification.title,
      message: notification.message,
      note: notification.note,
      link: notification.link,
      type: notification.type,
      actionRequired: notification.actionRequired,
      isRead: Boolean(notification.readAt),
      createdAt: notification.createdAt.toISOString(),
    });
    groupsMap.set(studentId, group);
  }

  const groups = Array.from(groupsMap.values());

  return NextResponse.json({ actionRequiredCount, groups }, { status: 200 });
}
