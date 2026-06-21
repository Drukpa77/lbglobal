import { CaseStage } from "@prisma/client";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { buildCaseStageProfileWhere } from "@/lib/case-stage-dashboard";
import { allCaseStages, caseStageLabel } from "@/lib/case-stage";
import { prisma } from "@/lib/prisma";
import { formatSubmissionServiceSummary } from "@/lib/visa-services";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const stageRaw = url.searchParams.get("stage");
  if (!stageRaw || !(allCaseStages as string[]).includes(stageRaw)) {
    return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
  }

  const stage = stageRaw as CaseStage;
  const profiles = await prisma.studentProfile.findMany({
    where: {
      AND: [
        buildCaseStageProfileWhere({
          role: session.user.role,
          userId: session.user.id,
        }),
        { caseStage: stage },
      ],
    },
    select: {
      id: true,
      phone: true,
      visaServiceType: true,
      otherServiceDescription: true,
      user: {
        select: {
          name: true,
          email: true,
          submissions: {
            orderBy: { submittedAt: "desc" },
            take: 1,
            select: {
              intendedCourse: true,
              answers: true,
            },
          },
        },
      },
    },
    orderBy: [
      { user: { name: "asc" } },
      { user: { email: "asc" } },
    ],
  });

  const label = caseStageLabel(stage);
  const rows = profiles.map((profile) => {
    const latestSubmission = profile.user.submissions[0];
    return [
      profile.user.name ?? profile.user.email,
      profile.user.email,
      profile.phone ?? "Not provided",
      formatSubmissionServiceSummary({
        intendedCourse: latestSubmission?.intendedCourse,
        answers: latestSubmission?.answers,
        profileVisaServiceType: profile.visaServiceType,
        profileOtherServiceDescription: profile.otherServiceDescription,
      }),
    ];
  });
  const worksheet = renderExcelWorksheet({
    title: `${label} Clients`,
    headers: ["Student", "Email", "Phone", "Visa Service"],
    rows,
  });
  const filename = `case-stage-${stage.toLowerCase().replaceAll("_", "-")}.xls`;

  return new NextResponse(worksheet, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function renderExcelWorksheet(input: {
  title: string;
  headers: string[];
  rows: string[][];
}) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    table { border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; mso-number-format:"\\@"; }
    th { background: #f1f5f9; font-weight: 700; }
  </style>
</head>
<body>
  <h1>${escapeHtml(input.title)}</h1>
  <table>
    <thead>
      <tr>${input.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
    </thead>
    <tbody>
      ${input.rows
        .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(sanitizeSpreadsheetText(cell))}</td>`).join("")}</tr>`)
        .join("")}
    </tbody>
  </table>
</body>
</html>`;
}

function sanitizeSpreadsheetText(value: string) {
  const trimmed = value.trimStart();
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    return `'${value}`;
  }
  return value;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
