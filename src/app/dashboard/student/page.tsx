import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getDashboardPath } from "@/lib/roles";
import { formatSubmissionStatus } from "@/lib/submission";

export default async function StudentDashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "USER") {
    redirect(getDashboardPath(session.user.role));
  }

  const latestSubmission = await prisma.questionnaireSubmission.findFirst({
    where: { studentId: session.user.id },
    include: { assignedSubAdmin: true },
    orderBy: { submittedAt: "desc" },
  });

  const statusValue = latestSubmission
    ? formatSubmissionStatus(latestSubmission.status)
    : "Not Submitted";
  const stageValue = latestSubmission
    ? formatSubmissionStatus(latestSubmission.status)
    : "Lead";
  const agentValue = latestSubmission?.assignedSubAdmin?.name ?? "Pending";

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Student Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">
          Submit your questionnaire and track your Australia application progress.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Questionnaire Status" value={statusValue} />
        <StatCard title="Application Stage" value={stageValue} />
        <StatCard title="Assigned Agent" value={agentValue} />
      </div>

      <Link
        href="/apply"
        className="inline-flex rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
      >
        {latestSubmission ? "Submit another response" : "Start questionnaire"}
      </Link>
    </section>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <article className="rounded-lg border bg-white p-4">
      <p className="text-xs text-gray-500">{title}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </article>
  );
}
