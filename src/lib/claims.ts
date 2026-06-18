import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { createWorkflowNotification } from "@/lib/workflow-notifications";

type DbClient = Prisma.TransactionClient | typeof prisma;

/**
 * The "claim" is a soft, per-client triage marker stored on every one of a
 * client's questionnaire submissions (`assignedToId`). A repeat enquiry should
 * inherit the existing owner instead of resetting the case to unclaimed, so new
 * submissions look up the current owner via this helper.
 *
 * Returns the user id of the agent/admin who currently owns the client, or
 * `null` when the client is unclaimed.
 */
export async function getCurrentClaimOwnerId(
  client: DbClient,
  studentUserId: string,
): Promise<string | null> {
  if (!studentUserId) return null;
  const claimed = await client.questionnaireSubmission.findFirst({
    where: { studentId: studentUserId, assignedToId: { not: null } },
    orderBy: { submittedAt: "desc" },
    select: { assignedToId: true },
  });
  return claimed?.assignedToId ?? null;
}

/**
 * Once a client has been claimed (accepted) by someone, the "new enquiry"
 * action items fanned out to every agent/admin are no longer actionable. Mark
 * them read so the rest of the team's notification bell clears, keeping the
 * unread/action counts consistent with the actual queue.
 */
export async function markNewApplicationNotificationsHandled(
  client: DbClient,
  studentProfileId: string | null | undefined,
) {
  if (!studentProfileId) return;
  await client.workflowNotification.updateMany({
    where: {
      studentProfileId,
      type: "NEW_STUDENT_APPLICATION",
      readAt: null,
    },
    data: { readAt: new Date() },
  });
}

/**
 * Soft-deleting a client also removes the case from the claiming agent's view,
 * and only an admin can restore it. When someone other than the owner deletes a
 * client, let the owner know so cross-office cleanup isn't a silent surprise.
 *
 * Call this BEFORE the soft delete so the claim owner is still resolvable.
 */
export async function notifyClaimOwnerOfClientDeletion(studentUserId: string, actorId: string) {
  try {
    const profile = await prisma.studentProfile.findUnique({
      where: { userId: studentUserId },
      select: { id: true, user: { select: { name: true, email: true } } },
    });
    if (!profile) return;

    const ownerId = await getCurrentClaimOwnerId(prisma, studentUserId);
    if (!ownerId || ownerId === actorId) return;

    const clientLabel = profile.user.name?.trim() || profile.user.email || "a client";
    await createWorkflowNotification({
      recipientId: ownerId,
      actorId,
      studentProfileId: profile.id,
      type: "STUDENT_DELEGATED",
      title: "Your client was removed",
      message: `${clientLabel} was moved to Deleted Clients. Ask an administrator to restore them if this was a mistake.`,
      link: "/dashboard/sub-admin?tab=deleted-clients",
      actionRequired: false,
      metadata: { teamNotice: "change_by_actor", reason: "client_deleted" },
    });
  } catch (error) {
    console.error("notifyClaimOwnerOfClientDeletion failed", error);
  }
}
