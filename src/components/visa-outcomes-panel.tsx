import type { CaseStage, VisaStatus } from "@prisma/client";
import Link from "next/link";

import { CaseReferenceLabel } from "@/components/case-reference-label";
import { caseStageLabel, caseStageTone } from "@/lib/case-stage";
import { formatVisaStatus } from "@/lib/student-tracking";
import { formatVisaServiceDisplay } from "@/lib/visa-services";

export type VisaOutcomeItem = {
  id: string;
  caseReference: string;
  visaServiceType: string | null;
  otherServiceDescription: string | null;
  caseStage: CaseStage;
  visaStatus: VisaStatus;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  visaExpiryDate: Date | null;
  studentProfile: {
    user: { id: string; name: string | null; email: string };
  };
};

export function VisaOutcomesPanel({ outcomes }: { outcomes: VisaOutcomeItem[] }) {
  const granted = outcomes.filter((item) => item.caseStage === "VISA_GRANTED");
  const refused = outcomes.filter((item) => item.caseStage === "VISA_REFUSED");
  const aat = outcomes.filter((item) => item.caseStage === "AAT_CASE");
  const withdrawn = outcomes.filter((item) => item.caseStage === "WITHDRAWN");

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
        <h2 className="text-sm font-semibold text-emerald-950">Visa Outcomes</h2>
        <p className="mt-1 text-sm text-emerald-900">
          Completed visa cases live here so active case lists stay focused on work still in progress.
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OutcomeMetric title="Visa Granted" value={granted.length} tone="emerald" />
        <OutcomeMetric title="Visa Refused" value={refused.length} tone="rose" />
        <OutcomeMetric title="AAT Case" value={aat.length} tone="amber" />
        <OutcomeMetric title="Withdrawn" value={withdrawn.length} tone="slate" />
      </div>

      <section className="rounded-lg border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Outcome Cases</h2>
          <p className="text-xs text-gray-600">{outcomes.length} result{outcomes.length === 1 ? "" : "s"}</p>
        </div>
        {outcomes.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">No visa outcomes yet.</p>
        ) : (
          <ul className="mt-3 grid gap-3 lg:grid-cols-2">
            {outcomes.map((item) => (
              <li key={item.id} className={`rounded-md border p-3 ${caseStageTone(item.caseStage)}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">
                        {item.studentProfile.user.name ?? item.studentProfile.user.email}
                      </p>
                      <CaseReferenceLabel caseReference={item.caseReference} />
                    </div>
                    <p className="mt-1 text-xs opacity-80">
                      {formatVisaServiceDisplay({
                        visaServiceType: item.visaServiceType,
                        otherServiceDescription: item.otherServiceDescription,
                      })}
                    </p>
                    <p className="mt-1 text-xs opacity-80">
                      {caseStageLabel(item.caseStage)} · {formatVisaStatus(item.visaStatus)}
                      {item.completedAt ? ` · Outcome ${item.completedAt.toLocaleDateString()}` : ""}
                      {item.visaExpiryDate ? ` · Visa expiry ${item.visaExpiryDate.toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <Link
                    href={`/dashboard/students/${item.studentProfile.user.id}`}
                    className="rounded-md border border-current/20 bg-white/60 px-2 py-1 text-xs font-medium"
                  >
                    Open Client
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function OutcomeMetric({
  title,
  value,
  tone,
}: {
  title: string;
  value: number;
  tone: "emerald" | "rose" | "amber" | "slate";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "rose"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : tone === "amber"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <article className={`rounded-lg border p-4 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{title}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </article>
  );
}
