import { expect, test } from "@playwright/test";
import type { CaseStage, SubmissionStatus } from "@prisma/client";

import {
  buildCountByAssignee,
  calculateActiveCaseRatios,
  dedupeLatestSubmissionPerStudent,
  isActiveCaseSubmission,
  isVisaExpiringWithinDays,
  uniquePreviewLabels,
} from "../src/lib/dashboard-overview-metrics";
import { buildCaseStageProfileWhere } from "../src/lib/case-stage-dashboard";

function submission(
  studentId: string,
  status: SubmissionStatus,
  caseStage: CaseStage = "CONSULTATION_AND_DOCUMENTATION",
) {
  return {
    studentId,
    status,
    student: {
      studentProfile: {
        caseStage,
        visaExpiryDate: null,
      },
    },
  };
}

test.describe("dashboard overview metric helpers", () => {
  test("dedupes duplicate submissions before ratio arithmetic", () => {
    const deduped = dedupeLatestSubmissionPerStudent([
      submission("student-a", "ENROLLED"),
      submission("student-a", "SUBMITTED"),
      submission("student-b", "SUBMITTED"),
    ]);

    expect(deduped.map((item) => item.studentId)).toEqual(["student-a", "student-b"]);
    expect(calculateActiveCaseRatios(deduped)).toEqual({
      conversionRate: 50,
      pendingRatio: 50,
    });
  });

  test("does not impose dashboard preview caps on metric arrays", () => {
    const items = Array.from({ length: 120 }, (_, index) =>
      submission(`student-${index}`, index < 60 ? "SUBMITTED" : "ENROLLED"),
    );
    const deduped = dedupeLatestSubmissionPerStudent(items);

    expect(deduped).toHaveLength(120);
    expect(calculateActiveCaseRatios(deduped)).toEqual({
      conversionRate: 50,
      pendingRatio: 50,
    });
  });

  test("filters active case metrics away from terminal case stages", () => {
    expect(isActiveCaseSubmission(submission("active", "SUBMITTED"))).toBe(true);
    expect(isActiveCaseSubmission(submission("granted", "VISA_GRANTED", "VISA_GRANTED"))).toBe(false);
  });

  test("counts overloaded staff from aggregate rows instead of recent previews", () => {
    const counts = buildCountByAssignee([
      { assignedToId: "staff-a", _count: { _all: 5 } },
      { assignedToId: "staff-b", _count: { _all: 2 } },
    ]);

    expect(counts.get("staff-a")).toBe(5);
    expect(counts.get("staff-b")).toBe(2);
  });

  test("uses unique approval preview labels from matching approval rows", () => {
    const rows = [
      { studentProfile: { user: { name: "Client One", email: "one@example.com" } } },
      { studentProfile: { user: { name: "Client One", email: "one@example.com" } } },
      { studentProfile: { user: { name: null, email: "two@example.com" } } },
    ];

    expect(
      uniquePreviewLabels(rows, (item) => item.studentProfile.user.name ?? item.studentProfile.user.email),
    ).toEqual(["Client One", "two@example.com"]);
  });

  test("recognizes visa expiry windows without counting expired visas", () => {
    const today = new Date("2026-06-30T12:00:00+10:00");

    expect(isVisaExpiringWithinDays(new Date("2026-07-15T00:00:00+10:00"), today, 90)).toBe(true);
    expect(isVisaExpiringWithinDays(new Date("2026-06-01T00:00:00+10:00"), today, 90)).toBe(false);
  });

  test("keeps sub-admin outcome/profile scopes limited to owned or unassigned cases", () => {
    expect(buildCaseStageProfileWhere({ role: "ADMIN", userId: "admin-1" })).toEqual({
      user: { role: "USER", deletedAt: null },
    });
    expect(buildCaseStageProfileWhere({ role: "SUB_ADMIN", userId: "agent-1" })).toMatchObject({
      user: {
        role: "USER",
        deletedAt: null,
        submissions: {
          some: {
            OR: [{ assignedToId: "agent-1" }, { assignedToId: null }],
          },
        },
      },
    });
  });
});
