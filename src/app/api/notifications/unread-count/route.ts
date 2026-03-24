import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ count: 0 }, { status: 200 });
  }

  const role = session.user.role;
  if (role !== "ADMIN" && role !== "SUB_ADMIN" && role !== "INTERNAL_STAFF") {
    return NextResponse.json({ count: 0 }, { status: 200 });
  }

  const conversationIds = await prisma.conversation
    .findMany({
      where: { participants: { some: { userId: session.user.id } } },
      select: { id: true },
      take: 500,
    })
    .then((rows) => rows.map((r) => r.id));

  if (conversationIds.length === 0) {
    return NextResponse.json({ count: 0 }, { status: 200 });
  }

  const count = await prisma.message.count({
    where: {
      conversationId: { in: conversationIds },
      senderId: { not: session.user.id },
      reads: { none: { userId: session.user.id } },
    },
  });

  return NextResponse.json({ count }, { status: 200 });
}
