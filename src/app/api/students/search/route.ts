import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  if (role !== "ADMIN" && role !== "SUB_ADMIN" && role !== "INTERNAL_STAFF") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ students: [] }, { status: 200 });
  }

  const students = await prisma.user.findMany({
    where: {
      role: "USER",
      OR: [
        { name: { contains: q } },
        { email: { contains: q } },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
    take: 10,
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ students }, { status: 200 });
}
