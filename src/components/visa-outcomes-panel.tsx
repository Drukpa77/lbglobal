import type { CaseStage, VisaStatus } from "@prisma/client";

import { VisaOutcomesCarousel } from "@/components/visa-outcomes-carousel";

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
          <p className="text-xs text-gray-600">
            {outcomes.length} result{outcomes.length === 1 ? "" : "s"}
          </p>
        </div>
        {outcomes.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">No visa outcomes yet.</p>
        ) : (
          <VisaOutcomesCarousel outcomes={outcomes} />
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
