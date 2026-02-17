import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { buildSubmissionWhere } from "@/lib/submission-filters";
import { formatSubmissionStatus } from "@/lib/submission";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? "";
  const status = url.searchParams.get("status") ?? "";
  const country = url.searchParams.get("country") ?? "";
  const course = url.searchParams.get("course") ?? "";

  const where = buildSubmissionWhere({
    role: session.user.role,
    userId: session.user.id,
    search,
    status,
    country,
    course,
    includeUnassignedForSubAdmin: session.user.role === "SUB_ADMIN",
  });

  const submissions = await prisma.questionnaireSubmission.findMany({
    where,
    include: {
      student: true,
      assignedSubAdmin: true,
    },
    orderBy: { submittedAt: "desc" },
  });

  const rows = [
    [
      "submissionId",
      "studentName",
      "studentEmail",
      "status",
      "country",
      "city",
      "course",
      "intake",
      "assignedAgent",
      "submittedAt",
    ].join(","),
    ...submissions.map((item) =>
      [
        csvCell(item.id),
        csvCell(item.student.name ?? ""),
        csvCell(item.student.email ?? ""),
        csvCell(formatSubmissionStatus(item.status)),
        csvCell(item.sourceCountry ?? ""),
        csvCell(item.sourceCity ?? ""),
        csvCell(item.intendedCourse ?? ""),
        csvCell(item.intendedIntake ?? ""),
        csvCell(item.assignedSubAdmin?.name ?? item.assignedSubAdmin?.email ?? ""),
        csvCell(item.submittedAt.toISOString()),
      ].join(","),
    ),
  ];

  const csv = rows.join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=submissions.csv",
    },
  });
}

function csvCell(value: string) {
  const escaped = value.replaceAll('"', '""');
  return `"${escaped}"`;
}
