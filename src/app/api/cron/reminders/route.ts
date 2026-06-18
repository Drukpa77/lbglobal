import { NextResponse } from "next/server";

import { queueDevEmail } from "@/lib/email-outbox";
import { prisma } from "@/lib/prisma";
import { getRemindersForUser } from "@/lib/reminders";
import { createWorkflowNotification } from "@/lib/workflow-notifications";

/**
 * Cron API route for scheduled reminder processing.
 * Configure in vercel.json to run daily (e.g. 9:00 AM).
 * Sends a digest email to each staff user with their pending reminders.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction && !cronSecret) {
    return NextResponse.json({ error: "Cron secret is not configured." }, { status: 500 });
  }

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const staffUsers = await prisma.user.findMany({
    where: {
      role: { in: ["ADMIN", "SUB_ADMIN", "INTERNAL_STAFF"] },
    },
    select: { id: true, email: true, name: true, role: true },
  });

  const baseUrl =
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  let processed = 0;
  for (const user of staffUsers) {
    if (!user.email) continue;

    const reminders = await getRemindersForUser(
      user.role as "ADMIN" | "SUB_ADMIN" | "INTERNAL_STAFF",
      user.id,
    );

    if (reminders.length === 0) continue;

    const urgentCount = reminders.filter((r) => r.severity === "urgent").length;
    const subject =
      urgentCount > 0
        ? `[Urgent] ${reminders.length} reminder(s) – ${urgentCount} need attention`
        : `You have ${reminders.length} reminder(s) – L&B Global`;

    const listItems = reminders
      .map(
        (r) =>
          `<li style="margin: 8px 0;"><strong>${r.title}</strong>: ${r.description} <a href="${baseUrl}${r.link}">View</a></li>`,
      )
      .join("");

    const htmlBody = `
      <p>Hi ${user.name ?? "there"},</p>
      <p>Here are your pending reminders for today:</p>
      <ul style="list-style: none; padding-left: 0;">
        ${listItems}
      </ul>
      <p><a href="${baseUrl}/dashboard">Go to Dashboard</a></p>
      <p>— L&B Global</p>
    `;

    await queueDevEmail({
      createdById: user.id,
      toEmail: user.email,
      subject,
      htmlBody,
    });
    processed++;
  }

  const followUpCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const staleReturnedDocuments = await prisma.studentDocument.findMany({
    where: {
      returnedById: { not: null },
      returnedAt: { lte: followUpCutoff },
      returnResolvedAt: null,
    },
    include: {
      studentProfile: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
    take: 200,
  });

  let followUpNotifications = 0;
  for (const doc of staleReturnedDocuments) {
    if (!doc.returnedById || !doc.returnedAt) continue;
    const existing = await prisma.workflowNotification.findFirst({
      where: {
        recipientId: doc.returnedById,
        documentId: doc.id,
        type: "DOCUMENT_RETURN_FOLLOW_UP",
        createdAt: { gte: doc.returnedAt },
      },
      select: { id: true },
    });
    if (existing) continue;

    await createWorkflowNotification({
      recipientId: doc.returnedById,
      studentProfileId: doc.studentProfileId,
      documentId: doc.id,
      type: "DOCUMENT_RETURN_FOLLOW_UP",
      title: "Returned document still pending action",
      message: `${doc.studentProfile.user.name ?? doc.studentProfile.user.email} - ${doc.title} has not been handled for 48+ hours`,
      note: doc.returnedNote,
      link: `/dashboard/students/${doc.studentProfile.userId}?tab=tasks`,
      actionRequired: true,
      metadata: { returnedAt: doc.returnedAt.toISOString() },
    });

    await prisma.activityLog.create({
      data: {
        actorId: doc.returnedById,
        targetStudentProfileId: doc.studentProfileId,
        entityType: "DOCUMENT",
        entityId: doc.id,
        action: "Scheduled follow-up notification for stale document return",
        metadata: { returnedAt: doc.returnedAt.toISOString() },
      },
    });
    followUpNotifications += 1;
  }

  return NextResponse.json({
    ok: true,
    message: `Processed reminders for ${processed} staff user(s)`,
    usersChecked: staffUsers.length,
    documentReturnFollowUps: followUpNotifications,
  });
}
