import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "INTERNAL_STAFF" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const filterRaw = String(url.searchParams.get("filter") ?? "all");
  const filter: "all" | "overdue" | "today" =
    filterRaw === "overdue" || filterRaw === "today" ? filterRaw : "all";

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const tasks = await prisma.task.findMany({
    where: {
      ...(session.user.role === "ADMIN" ? {} : { assigneeId: session.user.id }),
      ...(filter === "overdue"
        ? { dueDate: { lt: startOfToday }, status: { not: "DONE" } }
        : filter === "today"
          ? { dueDate: { gte: startOfToday, lt: endOfToday }, status: { not: "DONE" } }
          : {}),
    },
    include: {
      studentProfile: {
        include: {
          user: { select: { name: true, email: true } },
        },
      },
      assignee: { select: { name: true, email: true } },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: 500,
  });

  const rows = [
    [
      "taskId",
      "taskTitle",
      "priority",
      "status",
      "dueDate",
      "studentName",
      "studentEmail",
      "assignee",
      "filter",
      "generatedAt",
    ].join(","),
    ...tasks.map((task) =>
      [
        csvCell(task.id),
        csvCell(task.title),
        csvCell(task.priority),
        csvCell(task.status),
        csvCell(task.dueDate ? task.dueDate.toISOString() : ""),
        csvCell(task.studentProfile.user.name ?? ""),
        csvCell(task.studentProfile.user.email ?? ""),
        csvCell(task.assignee.name ?? task.assignee.email ?? ""),
        csvCell(filter),
        csvCell(new Date().toISOString()),
      ].join(","),
    ),
  ];

  return new NextResponse(rows.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=internal-staff-work-report.csv",
    },
  });
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
