import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildSubmissionWhere } from "@/lib/submission-filters";
import { formatSubmissionStatus } from "@/lib/submission";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "SUB_ADMIN" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? "";
  const status = url.searchParams.get("status") ?? "";
  const country = url.searchParams.get("country") ?? "";
  const course = url.searchParams.get("course") ?? "";
  const queue = url.searchParams.get("queue") ?? "all";

  const where = buildSubmissionWhere({
    role: session.user.role,
    userId: session.user.id,
    search,
    status,
    country,
    course,
    includeUnassignedForSubAdmin: true,
  });

  const submissions = await prisma.questionnaireSubmission.findMany({
    where,
    include: {
      student: { include: { studentProfile: true } },
      assignedSubAdmin: { select: { name: true, email: true } },
    },
    orderBy: { submittedAt: "desc" },
    take: 1000,
  });

  const rows = [
    [
      "submissionId",
      "studentName",
      "studentEmail",
      "status",
      "sourceCountry",
      "sourceCity",
      "intendedCourse",
      "assignedSubAdmin",
      "nextFollowUpDate",
      "queueFilter",
      "submittedAt",
    ].join(","),
    ...submissions.map((submission) =>
      [
        csvCell(submission.id),
        csvCell(submission.student.name ?? ""),
        csvCell(submission.student.email),
        csvCell(formatSubmissionStatus(submission.status)),
        csvCell(submission.sourceCountry ?? ""),
        csvCell(submission.sourceCity ?? ""),
        csvCell(submission.intendedCourse ?? ""),
        csvCell(submission.assignedSubAdmin?.name ?? submission.assignedSubAdmin?.email ?? ""),
        csvCell(submission.student.studentProfile?.nextFollowUpDate?.toISOString() ?? ""),
        csvCell(queue),
        csvCell(submission.submittedAt.toISOString()),
      ].join(","),
    ),
  ];

  return new NextResponse(rows.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=sub-admin-manager-report.csv",
    },
  });
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
