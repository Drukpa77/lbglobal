import {
  CONTRIBUTION_DOC_WEIGHT,
  CONTRIBUTION_STAGE_WEIGHT,
  CONTRIBUTION_TASK_WEIGHT,
  type ContributionResult,
  type ContributionRow,
} from "@/lib/contributions";

type Props = {
  data: ContributionResult;
  title?: string;
  subtitle?: string;
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  SUB_ADMIN: "Agent",
  INTERNAL_STAFF: "Case Manager",
  USER: "Client",
  UNKNOWN: "Removed",
};

const ROLE_TONE: Record<string, string> = {
  ADMIN: "border-purple-200 bg-purple-50 text-purple-700",
  SUB_ADMIN: "border-blue-200 bg-blue-50 text-blue-700",
  INTERNAL_STAFF: "border-emerald-200 bg-emerald-50 text-emerald-700",
  USER: "border-slate-200 bg-slate-50 text-slate-700",
  UNKNOWN: "border-rose-200 bg-rose-50 text-rose-700",
};

function formatPct(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0%";
  return `${n.toFixed(1)}%`;
}

function formatCaseWorkUnits(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  return n < 10 ? n.toFixed(1) : String(Math.round(n));
}

function formatCaseWorkDetail(row: ContributionRow): string {
  const parts: string[] = [];
  if (row.doneTaskCount > 0) {
    parts.push(`${row.doneTaskCount} done`);
  }
  if (row.openTaskCount > 0) {
    parts.push(`${row.openTaskCount} open`);
  }
  if (row.teamSlotCount > 0) {
    parts.push(`${row.teamSlotCount} on team`);
  }
  if (row.caseActionCount > 0) {
    parts.push(`${row.caseActionCount} action${row.caseActionCount === 1 ? "" : "s"}`);
  }
  return parts.length > 0 ? parts.join(", ") : "case support";
}

export function ContributionLeaderboard({ data, title, subtitle }: Props) {
  const { rows, totals } = data;
  const hasAnyData =
    totals.stageMoves > 0 ||
    totals.docs > 0 ||
    totals.doneTasks > 0 ||
    totals.openAssignedTasks > 0 ||
    totals.caseWorkUnits > 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {title ?? "Contribution Leaderboard"}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {subtitle ??
              "Weighted scoring shows how much of the total work each teammate has done."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wide">
          <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-700">
            Stages {CONTRIBUTION_STAGE_WEIGHT}%
          </span>
          <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-blue-700">
            Docs {CONTRIBUTION_DOC_WEIGHT}%
          </span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
            Case work {CONTRIBUTION_TASK_WEIGHT}%
          </span>
        </div>
      </header>

      <div className="mt-4 grid gap-3 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="font-semibold uppercase tracking-wide text-slate-500">
            Stage moves
          </p>
          <p className="mt-1 text-base font-semibold text-slate-900">
            {totals.stageMoves}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="font-semibold uppercase tracking-wide text-slate-500">
            Documents uploaded
          </p>
          <p className="mt-1 text-base font-semibold text-slate-900">
            {totals.docs}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="font-semibold uppercase tracking-wide text-slate-500">
            Tasks completed
          </p>
          <p className="mt-1 text-base font-semibold text-slate-900">
            {totals.doneTasks}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="font-semibold uppercase tracking-wide text-slate-500">
            Open tasks & case actions
          </p>
          <p className="mt-1 text-base font-semibold text-slate-900">
            {totals.openAssignedTasks} open · {formatCaseWorkUnits(totals.caseWorkUnits)} work units
          </p>
        </div>
      </div>

      {!hasAnyData ? (
        <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
          No contribution activity yet — move a case stage, upload a document, join the
          case team, assign tasks, or complete work on the case.
        </div>
      ) : (
        <ol className="mt-6 space-y-4">
          {rows.map((row, idx) => (
            <LeaderboardRow key={row.userId} row={row} rank={idx + 1} />
          ))}
        </ol>
      )}
    </section>
  );
}

function LeaderboardRow({ row, rank }: { row: ContributionRow; rank: number }) {
  const totalSpan = Math.max(row.totalPts, 0.0001);
  const stagePctOfBar = (row.stagePts / totalSpan) * 100;
  const docPctOfBar = (row.docPts / totalSpan) * 100;
  const taskPctOfBar = (row.taskPts / totalSpan) * 100;

  const widthOfTotal = Math.min(100, Math.max(0, row.totalPts));

  const roleLabel = ROLE_LABELS[row.role] ?? row.role;
  const roleTone =
    ROLE_TONE[row.role] ?? "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
            {rank}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">{row.name}</p>
            <p className="text-xs text-slate-500">{row.email || "—"}</p>
            <span
              className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${roleTone}`}
            >
              {roleLabel}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-slate-900">
            {formatPct(row.totalPts)}
          </p>
          <p className="text-[11px] text-slate-500">of total work</p>
        </div>
      </div>

      <div className="mt-3">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="flex h-full"
            style={{ width: `${widthOfTotal}%` }}
          >
            {row.stagePts > 0 && (
              <div
                className="h-full bg-rose-500"
                style={{ width: `${stagePctOfBar}%` }}
                title={`Stages: ${formatPct(row.stagePts)}`}
              />
            )}
            {row.docPts > 0 && (
              <div
                className="h-full bg-blue-500"
                style={{ width: `${docPctOfBar}%` }}
                title={`Docs: ${formatPct(row.docPts)}`}
              />
            )}
            {row.taskPts > 0 && (
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${taskPctOfBar}%` }}
                title={`Case work: ${formatPct(row.taskPts)}`}
              />
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-500" />
            Stages: <span className="font-semibold">{formatPct(row.stagePts)}</span>
            <span className="ml-1 text-slate-400">
              ({row.stageCount} move{row.stageCount === 1 ? "" : "s"})
            </span>
          </span>
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-500" />
            Docs: <span className="font-semibold">{formatPct(row.docPts)}</span>
            <span className="ml-1 text-slate-400">
              ({row.docCount} doc{row.docCount === 1 ? "" : "s"})
            </span>
          </span>
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />
            Case work: <span className="font-semibold">{formatPct(row.taskPts)}</span>
            <span className="ml-1 text-slate-400">({formatCaseWorkDetail(row)})</span>
          </span>
        </div>
      </div>
    </li>
  );
}
