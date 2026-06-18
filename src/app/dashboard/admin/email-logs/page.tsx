import type { EmailLogStatus } from "@prisma/client";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getEmailProviderStatus, queueDevEmail } from "@/lib/email-outbox";

type SearchParams = Promise<{
  status?: string;
  test?: string;
  detail?: string;
}>;

const PAGE_SIZE = 100;

export default async function AdminEmailLogsPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const statusFilter = isEmailLogStatus(searchParams.status) ? searchParams.status : null;

  const providerStatus = getEmailProviderStatus();

  const [logs, failedLast24hRows, totalCount] = await Promise.all([
    prisma.outboundEmailLog.findMany({
      where: statusFilter ? { status: statusFilter } : undefined,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      select: {
        id: true,
        toEmail: true,
        subject: true,
        status: true,
        provider: true,
        errorMessage: true,
        providerMessageId: true,
        templateKey: true,
        createdAt: true,
        sentAt: true,
      },
    }),
    prisma.$queryRaw<Array<{ failedCount: bigint | number }>>`
      SELECT COUNT(*) AS failedCount
      FROM OutboundEmailLog
      WHERE status = 'FAILED'
        AND createdAt >= DATE_SUB(NOW(), INTERVAL 1 DAY)
    `,
    prisma.outboundEmailLog.count(),
  ]);
  const failedLast24h = Number(failedLast24hRows[0]?.failedCount ?? 0);

  const testNotice =
    searchParams.test === "sent"
      ? { tone: "ok" as const, text: "Test email accepted by the provider. Check the recipient inbox (and spam)." }
      : searchParams.test === "failed"
        ? {
            tone: "error" as const,
            text: `Test email failed: ${searchParams.detail?.slice(0, 300) || "see the latest row below for details."}`,
          }
        : null;

  return (
    <section className="space-y-6 text-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Email Delivery Logs</h1>
          <p className="mt-1 text-sm text-gray-600">
            Every outbound notification (enquiry confirmations, delegations, tasks, documents) is recorded here with its
            provider result.
          </p>
        </div>
        <Link href="/dashboard/admin?tab=staff" className="rounded-md border px-3 py-2 text-sm">
          Back to admin dashboard
        </Link>
      </div>

      {testNotice ? (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            testNotice.tone === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
          role="status"
        >
          {testNotice.text}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Failed (last 24h)" value={String(failedLast24h)} tone={failedLast24h > 0 ? "alert" : "ok"} />
        <StatCard title="Total logged" value={String(totalCount)} />
        <StatCard
          title="Active provider"
          value={providerStatus.configured ? "Postmark" : providerStatus.plannedProvider === "DEV" ? "Dev (not sending)" : "Postmark (incomplete)"}
          tone={providerStatus.configured ? "ok" : "alert"}
        />
        <StatCard title="From address" value={providerStatus.fromEmail ?? "Not set"} tone={providerStatus.fromEmail ? "ok" : "alert"} />
      </section>

      {!providerStatus.configured ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Postmark is not fully configured. Set <code>POSTMARK_SERVER_TOKEN</code> and <code>POSTMARK_FROM_EMAIL</code> in
          your deployment environment, then redeploy. Until then, emails are either skipped (dev) or will fail (production).
        </div>
      ) : null}

      <div
        className={`rounded-md border px-4 py-3 text-sm ${
          providerStatus.fallbackConfigured
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-gray-200 bg-gray-50 text-gray-700"
        }`}
      >
        {providerStatus.fallbackConfigured ? (
          <>
            Google Workspace SMTP fallback is <strong>active</strong>. If Postmark rejects a message (e.g. while the
            account is pending approval), the email is automatically resent through Google Workspace and logged with that
            provider.
          </>
        ) : (
          <>
            Google Workspace SMTP fallback is <strong>not configured</strong>. Set <code>GOOGLE_SMTP_USER</code> and{" "}
            <code>GOOGLE_SMTP_PASSWORD</code> to keep emails flowing if Postmark fails.
          </>
        )}
      </div>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="text-sm font-semibold">Send a test email</h2>
        <p className="mt-1 text-xs text-gray-600">
          Sends a real email through the same pipeline used by the app and records the result below. Use this to confirm
          Postmark is working end-to-end.
        </p>
        <form action={sendTestEmailAction} className="mt-3 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-64">
            <label htmlFor="test-email" className="mb-1 block text-xs font-semibold text-gray-700">
              Recipient email
            </label>
            <input
              id="test-email"
              name="toEmail"
              type="email"
              required
              placeholder="you@example.com"
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <button type="submit" className="rounded-md bg-black px-4 py-2 text-sm text-white">
            Send test
          </button>
        </form>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Recent emails (latest {PAGE_SIZE})</h2>
          <div className="flex flex-wrap gap-1.5">
            <StatusFilterLink label="All" href="/dashboard/admin/email-logs" active={statusFilter === null} />
            <StatusFilterLink
              label="Failed"
              href="/dashboard/admin/email-logs?status=FAILED"
              active={statusFilter === "FAILED"}
            />
            <StatusFilterLink
              label="Sent"
              href="/dashboard/admin/email-logs?status=SENT"
              active={statusFilter === "SENT"}
            />
            <StatusFilterLink
              label="Queued"
              href="/dashboard/admin/email-logs?status=QUEUED"
              active={statusFilter === "QUEUED"}
            />
          </div>
        </div>

        {logs.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">No emails logged for this filter yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-[900px] w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Recipient</th>
                  <th className="px-2 py-2">Subject</th>
                  <th className="px-2 py-2">Provider</th>
                  <th className="px-2 py-2">Created</th>
                  <th className="px-2 py-2">Error / Message ID</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b align-top">
                    <td className="px-2 py-2">
                      <StatusBadge status={log.status} />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">{log.toEmail}</td>
                    <td className="px-2 py-2">
                      <span className="block max-w-xs truncate" title={log.subject}>
                        {log.subject}
                      </span>
                      {log.templateKey ? (
                        <span className="text-[11px] text-gray-500">{log.templateKey}</span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-gray-600">{log.provider}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-gray-600">
                      {log.createdAt.toLocaleString()}
                    </td>
                    <td className="px-2 py-2">
                      {log.status === "FAILED" && log.errorMessage ? (
                        <span className="block max-w-md text-red-700" title={log.errorMessage}>
                          {log.errorMessage}
                        </span>
                      ) : log.providerMessageId ? (
                        <span className="text-xs text-gray-500">{log.providerMessageId}</span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

function isEmailLogStatus(value: string | undefined): value is EmailLogStatus {
  return value === "QUEUED" || value === "SENT" || value === "FAILED";
}

function StatusBadge({ status }: { status: EmailLogStatus }) {
  const styles: Record<EmailLogStatus, string> = {
    SENT: "bg-emerald-50 text-emerald-700 border-emerald-200",
    FAILED: "bg-red-50 text-red-700 border-red-200",
    QUEUED: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${styles[status]}`}>
      {status}
    </span>
  );
}

function StatusFilterLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs ${
        active ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 text-gray-700 hover:bg-gray-50"
      }`}
    >
      {label}
    </Link>
  );
}

function StatCard({ title, value, tone }: { title: string; value: string; tone?: "ok" | "alert" }) {
  const toneClass = tone === "alert" ? "text-red-700" : tone === "ok" ? "text-emerald-700" : "text-gray-900";
  return (
    <article className="rounded-lg border bg-white p-4">
      <p className="text-xs text-gray-500">{title}</p>
      <p className={`mt-2 truncate text-lg font-semibold ${toneClass}`} title={value}>
        {value}
      </p>
    </article>
  );
}

async function sendTestEmailAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/login");

  const toEmail = String(formData.get("toEmail") ?? "").trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!toEmail || !emailRegex.test(toEmail)) {
    redirect("/dashboard/admin/email-logs?test=failed&detail=Invalid recipient email.");
  }

  const result = await queueDevEmail({
    createdById: session.user.id,
    toEmail,
    subject: "Test email – L&B Global CRM",
    htmlBody: `
      <p>This is a test email from the L&amp;B Global CRM.</p>
      <p>If you received this, outbound email delivery is working.</p>
      <p>Sent at ${new Date().toISOString()}.</p>
    `,
    templateKey: "admin-test-email",
  });

  revalidatePath("/dashboard/admin/email-logs");

  if (result.status === "FAILED") {
    const detail = encodeURIComponent(result.errorMessage?.slice(0, 300) ?? "Unknown error.");
    redirect(`/dashboard/admin/email-logs?test=failed&detail=${detail}`);
  }

  redirect("/dashboard/admin/email-logs?test=sent");
}
