import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    where: {
      id: { not: session.user.id },
      role: { in: ["ADMIN", "SUB_ADMIN", "INTERNAL_STAFF"] },
      password: { not: null },
    },
    select: { id: true, name: true, email: true, role: true },
    orderBy: [{ updatedAt: "desc" }],
  });

  // Defensive dedupe by email to avoid duplicate seed/staff records in picker.
  const seenEmails = new Set<string>();
  const deduped = users.filter((user) => {
    const key = user.email.toLowerCase();
    if (seenEmails.has(key)) return false;
    seenEmails.add(key);
    return true;
  });
  deduped.sort((a, b) => {
    const roleCmp = a.role.localeCompare(b.role);
    if (roleCmp !== 0) return roleCmp;
    return (a.name ?? a.email).localeCompare(b.name ?? b.email);
  });

  const singletonRoles = new Set<"ADMIN" | "SUB_ADMIN">();
  const constrained = deduped.filter((user) => {
    if (user.role === "ADMIN" || user.role === "SUB_ADMIN") {
      if (singletonRoles.has(user.role)) return false;
      singletonRoles.add(user.role);
    }
    return true;
  });

  return NextResponse.json({ users: constrained });
}
