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
      student: {
        include: { studentProfile: true },
      },
      assignedSubAdmin: true,
    },
    orderBy: { submittedAt: "desc" },
  });

  const profileIds = submissions
    .map((item) => item.student.studentProfile?.id)
    .filter((id): id is string => Boolean(id));
  const [assignments, tasks] = await Promise.all([
    prisma.studentAssignment.findMany({
      where: { studentProfileId: { in: profileIds }, isActive: true },
      include: { assignedTo: { select: { name: true, email: true } } },
    }),
    prisma.task.groupBy({
      by: ["studentProfileId"],
      where: {
        studentProfileId: { in: profileIds },
        status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] },
      },
      _count: { _all: true },
    }),
  ]);
  const assignmentByProfile = new Map(
    assignments.map((item) => [item.studentProfileId, item.assignedTo.name ?? item.assignedTo.email]),
  );
  const taskCountByProfile = new Map(tasks.map((item) => [item.studentProfileId, item._count._all]));

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
      "delegatedInternalStaff",
      "openTaskCount",
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
        csvCell(
          item.student.studentProfile
            ? (assignmentByProfile.get(item.student.studentProfile.id) ?? "")
            : "",
        ),
        csvCell(
          item.student.studentProfile
            ? String(taskCountByProfile.get(item.student.studentProfile.id) ?? 0)
            : "0",
        ),
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
