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

  const payload = (await req.json().catch(() => ({}))) as { studentId?: string };
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
