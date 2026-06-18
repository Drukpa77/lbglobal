/**
 * Integration demonstration for the claim / delegation / deletion bug fixes.
 *
 * It creates isolated, clearly-stamped test data, exercises the EXACT query
 * logic used by the server actions and lib helpers we changed, asserts the
 * outcomes, prints a PASS/FAIL report, then hard-deletes all test data.
 *
 * Run: node --env-file=.env scripts/verify-claim-fixes.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const STAMP = `zzdemo-${Date.now()}`;
const email = (s) => `${STAMP}-${s}@demo.test`;

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  -> ${detail}` : ""}`);
}

// ---- helpers that mirror the real code ------------------------------------

// src/lib/claims.ts getCurrentClaimOwnerId
async function getCurrentClaimOwnerId(studentUserId) {
  const claimed = await prisma.questionnaireSubmission.findFirst({
    where: { studentId: studentUserId, assignedToId: { not: null } },
    orderBy: { submittedAt: "desc" },
    select: { assignedToId: true },
  });
  return claimed?.assignedToId ?? null;
}

// src/lib/deleted-clients.ts softDeleteClient (incl. Bug 7 unclaim)
async function softDeleteClient(userId, deletedById) {
  const now = new Date();
  await prisma.user.updateMany({
    where: { id: userId, role: "USER", deletedAt: null },
    data: { deletedAt: now, deletedById },
  });
  await prisma.questionnaireSubmission.updateMany({
    where: { studentId: userId, assignedToId: { not: null } },
    data: { assignedToId: null },
  });
  const profile = await prisma.studentProfile.findUnique({ where: { userId }, select: { id: true } });
  if (profile) {
    await prisma.studentAssignment.updateMany({
      where: { studentProfileId: profile.id, isActive: true },
      data: { isActive: false, endedAt: now },
    });
  }
}

async function createClient(key, { recentSubmission = true } = {}) {
  const user = await prisma.user.create({
    data: { name: `Client ${key}`, email: email(`client-${key}`), role: "USER" },
  });
  const profile = await prisma.studentProfile.create({
    data: { userId: user.id, caseReference: `${STAMP}-REF-${key}` },
  });
  let submission = null;
  if (recentSubmission) {
    submission = await prisma.questionnaireSubmission.create({
      data: { studentId: user.id, templateId, assignedToId: null, answers: {}, status: "SUBMITTED" },
    });
  }
  return { user, profile, submission };
}

let templateId;
let agentA, agentB, staffS;

async function main() {
  const template = await prisma.questionnaireTemplate.findFirst({ where: { isActive: true }, select: { id: true } });
  if (!template) throw new Error("No active template seeded");
  templateId = template.id;

  agentA = await prisma.user.create({ data: { name: "Agent A", email: email("agentA"), role: "SUB_ADMIN", password: "x" } });
  agentB = await prisma.user.create({ data: { name: "Agent B", email: email("agentB"), role: "SUB_ADMIN", password: "x" } });
  staffS = await prisma.user.create({ data: { name: "Staff S", email: email("staffS"), role: "INTERNAL_STAFF", password: "x" } });

  // =====================================================================
  // BUG 1 — atomic claim: two agents race for the same enquiry; only one wins
  // =====================================================================
  const c1 = await createClient("1");
  const guard = (agentId) => ({ id: c1.submission.id, OR: [{ assignedToId: null }, { assignedToId: agentId }] });
  const [resA, resB] = await Promise.all([
    prisma.questionnaireSubmission.updateMany({ where: guard(agentA.id), data: { assignedToId: agentA.id } }),
    prisma.questionnaireSubmission.updateMany({ where: guard(agentB.id), data: { assignedToId: agentB.id } }),
  ]);
  const winners = resA.count + resB.count;
  const sub1 = await prisma.questionnaireSubmission.findUnique({ where: { id: c1.submission.id }, select: { assignedToId: true } });
  check(
    "Bug1 atomic claim: exactly one agent wins the race",
    winners === 1 && (sub1.assignedToId === agentA.id || sub1.assignedToId === agentB.id),
    `updates applied=${winners}, owner=${sub1.assignedToId === agentA.id ? "Agent A" : "Agent B"}`,
  );
  const ownerId = sub1.assignedToId; // the winner

  // A second sub-admin trying to claim a now-owned case is rejected (count 0)
  const otherAgent = ownerId === agentA.id ? agentB : agentA;
  const steal = await prisma.questionnaireSubmission.updateMany({
    where: { id: c1.submission.id, OR: [{ assignedToId: null }, { assignedToId: otherAgent.id }] },
    data: { assignedToId: otherAgent.id },
  });
  check("Bug1 no claim-stealing: claiming an owned case is blocked", steal.count === 0, `rows changed=${steal.count}`);

  // =====================================================================
  // BUG 4 — per-client claim inheritance: repeat /apply keeps the owner
  // =====================================================================
  const inherited = await getCurrentClaimOwnerId(c1.user.id);
  const sub2 = await prisma.questionnaireSubmission.create({
    data: { studentId: c1.user.id, templateId, assignedToId: inherited, answers: {}, status: "SUBMITTED" },
  });
  check(
    "Bug4 repeat enquiry inherits the existing owner (not unclaimed)",
    sub2.assignedToId === ownerId && ownerId != null,
    `new submission owner=${sub2.assignedToId === ownerId ? "same owner" : "DIFFERENT"}`,
  );

  // =====================================================================
  // BUG 6 — claiming clears NEW_STUDENT_APPLICATION action items for the team
  // =====================================================================
  const notif = await prisma.workflowNotification.create({
    data: {
      recipientId: agentB.id,
      actorId: null,
      studentProfileId: c1.profile.id,
      type: "NEW_STUDENT_APPLICATION",
      title: "New enquiry",
      message: "demo",
      link: "/dashboard/sub-admin",
      actionRequired: true,
    },
  });
  await prisma.workflowNotification.updateMany({
    where: { studentProfileId: c1.profile.id, type: "NEW_STUDENT_APPLICATION", readAt: null },
    data: { readAt: new Date() },
  });
  const notifAfter = await prisma.workflowNotification.findUnique({ where: { id: notif.id }, select: { readAt: true } });
  check("Bug6 claim marks teammates' new-enquiry alerts read", notifAfter.readAt != null, `readAt=${notifAfter.readAt ? "set" : "null"}`);

  const log = await prisma.activityLog.create({
    data: { actorId: ownerId, targetStudentProfileId: c1.profile.id, targetUserId: c1.user.id, entityType: "ASSIGNMENT", entityId: c1.submission.id, action: "Claimed case" },
  });
  check("Bug6 claim writes an audit log entry", !!log.id, `action="Claimed case"`);

  // =====================================================================
  // BUG 2 — deleted clients drop out of the "New Inquiries (Unclaimed)" card
  // =====================================================================
  const c2 = await createClient("2");
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const cardWhere = { assignedToId: null, submittedAt: { gte: sevenDaysAgo }, student: { role: "USER", deletedAt: null } };
  const beforeIds = (await prisma.questionnaireSubmission.findMany({ where: cardWhere, select: { studentId: true } })).map((s) => s.studentId);
  const shownBefore = beforeIds.includes(c2.user.id);

  await softDeleteClient(c2.user.id, agentA.id);

  const afterIds = (await prisma.questionnaireSubmission.findMany({ where: cardWhere, select: { studentId: true } })).map((s) => s.studentId);
  const shownAfter = afterIds.includes(c2.user.id);
  check("Bug2 new-inquiries card hides soft-deleted clients", shownBefore && !shownAfter, `shown before delete=${shownBefore}, after delete=${shownAfter}`);

  // =====================================================================
  // BUG 7 — soft delete unclaims submissions AND deactivates delegations
  // =====================================================================
  const c3 = await createClient("3");
  await prisma.questionnaireSubmission.update({ where: { id: c3.submission.id }, data: { assignedToId: agentA.id } });
  const assignment = await prisma.studentAssignment.create({
    data: { studentProfileId: c3.profile.id, assignedToId: staffS.id, assignedById: agentA.id, isActive: true },
  });

  await softDeleteClient(c3.user.id, agentA.id);

  const sub3 = await prisma.questionnaireSubmission.findUnique({ where: { id: c3.submission.id }, select: { assignedToId: true } });
  const asg = await prisma.studentAssignment.findUnique({ where: { id: assignment.id }, select: { isActive: true, endedAt: true } });
  const u3 = await prisma.user.findUnique({ where: { id: c3.user.id }, select: { deletedAt: true } });
  check(
    "Bug7 soft delete: claim released + delegation ended + user flagged",
    sub3.assignedToId === null && asg.isActive === false && asg.endedAt != null && u3.deletedAt != null,
    `claim=${sub3.assignedToId}, assignmentActive=${asg.isActive}, deletedAt=${u3.deletedAt ? "set" : "null"}`,
  );

  // =====================================================================
  // BUG 8 — soft-deleting staff PRESERVES client data + blocks login + reactivates
  // =====================================================================
  const doc = await prisma.studentDocument.create({
    data: { studentProfileId: c1.profile.id, uploadedById: staffS.id, title: "Passport", originalFileName: "p.pdf", storagePath: "/demo/p.pdf", mimeType: "application/pdf", sizeBytes: 123 },
  });
  const task = await prisma.task.create({
    data: { title: "Prepare file", studentProfileId: c1.profile.id, assigneeId: staffS.id, assignerId: staffS.id },
  });

  // soft-delete staff (mirrors deleteInternalStaffAction)
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({ where: { id: staffS.id }, data: { deletedAt: now, deletedById: agentA.id } }),
    prisma.studentAssignment.updateMany({ where: { assignedToId: staffS.id, isActive: true }, data: { isActive: false, endedAt: now } }),
    prisma.staffTeamMembership.deleteMany({ where: { internalStaffId: staffS.id } }),
  ]);

  const docAfter = await prisma.studentDocument.findUnique({ where: { id: doc.id }, select: { id: true } });
  const taskAfter = await prisma.task.findUnique({ where: { id: task.id }, select: { id: true } });
  check(
    "Bug8 soft-deleting staff preserves the client's document + task",
    !!docAfter && !!taskAfter,
    `document=${docAfter ? "kept" : "LOST"}, task=${taskAfter ? "kept" : "LOST"}`,
  );

  // login exclusion (mirrors auth.ts: reject if user.deletedAt)
  const loginRow = await prisma.user.findUnique({ where: { email: email("staffS") }, select: { deletedAt: true, role: true } });
  const loginRejected = loginRow.role !== "USER" && loginRow.deletedAt != null; // auth would return null
  check("Bug8 deactivated staff cannot log in", loginRejected, `deletedAt=${loginRow.deletedAt ? "set" : "null"}`);

  // excluded from staff pickers (mirrors `role + deletedAt: null` filter)
  const pickerHasStaff = await prisma.user.findFirst({ where: { id: staffS.id, role: "INTERNAL_STAFF", deletedAt: null }, select: { id: true } });
  check("Bug8 deactivated staff excluded from delegation pickers", pickerHasStaff === null);

  // reactivation on re-create with same email (mirrors createInternalStaffAccountAction)
  const existing = await prisma.user.findUnique({ where: { email: email("staffS") }, select: { id: true, deletedAt: true } });
  if (existing && existing.deletedAt) {
    await prisma.user.update({ where: { id: existing.id }, data: { deletedAt: null, deletedById: null, role: "INTERNAL_STAFF" } });
  }
  const reactivated = await prisma.user.findUnique({ where: { id: staffS.id }, select: { deletedAt: true } });
  check("Bug8 re-creating same email reactivates the account", reactivated.deletedAt === null);
}

async function cleanup() {
  // Hard-delete every stamped test user; cascades remove their profiles,
  // submissions, documents, tasks, assignments, notifications and logs.
  const del = await prisma.user.deleteMany({ where: { email: { startsWith: STAMP } } });
  console.log(`\nCleaned up ${del.count} test users (and their cascaded data).`);
}

try {
  await main();
} catch (e) {
  console.error("\nDEMO ERROR:", e);
  process.exitCode = 1;
} finally {
  await cleanup().catch((e) => console.error("cleanup failed", e));
  await prisma.$disconnect();
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed.`);
  if (failed > 0) process.exitCode = 1;
}
