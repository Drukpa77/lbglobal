import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function AdminLeadSourcesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const submissions = await prisma.questionnaireSubmission.findMany({
    include: {
      student: {
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: { submittedAt: "desc" },
  });

  const sourceMap = new Map<
    string,
    Array<{ studentId: string; name: string; email: string; submittedAt: Date }>
  >();

  for (const submission of submissions) {
    const source = extractHearFromAnswer(submission.answers) ?? "Unknown";
    const existing = sourceMap.get(source) ?? [];
    existing.push({
      studentId: submission.student.id,
      name: getStudentDisplayName(submission.student, submission.answers),
      email: submission.student.email,
      submittedAt: submission.submittedAt,
    });
    sourceMap.set(source, existing);
  }

  const groupedSources = Array.from(sourceMap.entries())
    .map(([source, students]) => ({
      source,
      students,
    }))
    .sort((a, b) => b.students.length - a.students.length);

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Lead Source Analytics Details</h1>
          <p className="mt-1 text-sm text-gray-600">Students grouped by how they heard about L&B Global.</p>
        </div>
        <Link href="/dashboard/admin" className="rounded-md border px-3 py-2 text-sm">
          Back to admin dashboard
        </Link>
      </div>

      {groupedSources.length === 0 ? (
        <div className="rounded-lg border bg-white p-4 text-sm text-gray-600">No lead source responses available yet.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groupedSources.map((group) => (
            <article key={group.source} className="rounded-lg border bg-white p-4">
              <h2 className="text-sm font-semibold">{group.source}</h2>
              <p className="mt-1 text-xs text-gray-600">{group.students.length} student(s)</p>
              <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                {group.students.map((student) => (
                  <li key={`${group.source}-${student.studentId}-${student.submittedAt.getTime()}`}>
                    <Link href={`/dashboard/students/${student.studentId}`} className="block rounded-md border border-gray-200 px-3 py-2 text-sm transition hover:border-rose-300 hover:bg-rose-50/30">
                      <p className="font-medium text-gray-900">{student.name}</p>
                      <p className="text-xs text-gray-600">
                        {student.email} · {student.submittedAt.toLocaleDateString()}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function getStudentDisplayName(student: { name: string | null; email: string }, answers?: unknown) {
  const normalizedName = student.name?.trim();
  if (normalizedName && normalizedName.toLowerCase() !== "student user") return normalizedName;
  const fullNameFromAnswers = extractFullNameFromAnswers(answers);
  if (fullNameFromAnswers) return fullNameFromAnswers;
  return student.email;
}

function extractFullNameFromAnswers(answers?: unknown) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return null;
  const value = (answers as Record<string, unknown>).fullName;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function extractHearFromAnswer(answers?: unknown) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return null;
  const raw = (answers as Record<string, unknown>).hearFrom;
  if (typeof raw !== "string") return null;
  const normalized = raw.trim();
  return normalized.length > 0 ? normalized : null;
}
