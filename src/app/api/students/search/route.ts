import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { activeClientUserWhere } from "@/lib/deleted-clients";
import { prisma } from "@/lib/prisma";
import {
  internalStaffClientDirectoryWhere,
  staffHasFullClientDirectory,
} from "@/lib/staff-client-access";

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

  const searchMatch = {
    OR: [
      { name: { contains: q } },
      { email: { contains: q } },
      { studentProfile: { caseReference: { contains: q } } },
    ],
  };

  const students = await prisma.user.findMany({
    where: {
      ...activeClientUserWhere,
      AND: [
        searchMatch,
        ...(staffHasFullClientDirectory(role)
          ? []
          : [internalStaffClientDirectoryWhere(session.user.id)]),
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      studentProfile: {
        select: { caseReference: true },
      },
    },
    take: 10,
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
    {
      students: students.map((student) => ({
        id: student.id,
        name: student.name,
        email: student.email,
        caseReference: student.studentProfile?.caseReference ?? null,
      })),
    },
    { status: 200 },
  );
}
