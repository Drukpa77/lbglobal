"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { ContributionLeaderboard } from "@/components/contribution-leaderboard";
import { caseStageLabel, caseStageTone } from "@/lib/case-stage";
import type { ContributionCaseSummary } from "@/lib/contribution-cases";
import type { ContributionResult } from "@/lib/contributions";

type Props = {
  cases: ContributionCaseSummary[];
};

export function ContributionCasePicker({ cases }: Props) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(cases[0]?.studentProfileId ?? null);
  const [data, setData] = useState<ContributionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const initialLoadDone = useRef(false);

  const filteredCases = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return cases;

    return cases.filter((item) => {
      const haystack = [
        item.caseReference,
        item.displayName,
        item.email,
        caseStageLabel(item.caseStage),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [cases, query]);

  const selectedCase =
    cases.find((item) => item.studentProfileId === selectedId) ??
    filteredCases[0] ??
    null;

  function loadContributions(studentProfileId: string) {
    setSelectedId(studentProfileId);
    setError(null);
    setData(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/contributions/${studentProfileId}`);
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Could not load contribution details.");
        }
        const payload = (await response.json()) as { data: ContributionResult };
        setData(payload.data);
      } catch (loadError) {
        setData(null);
        setError(loadError instanceof Error ? loadError.message : "Could not load contribution details.");
      }
    });
  }

  useEffect(() => {
    if (initialLoadDone.current || cases.length === 0) return;
    initialLoadDone.current = true;
    loadContributions(cases[0].studentProfileId);
  }, [cases]);

  if (cases.length === 0) {
    return (
      <section className="rounded-lg border bg-white p-4">
        <p className="text-sm text-gray-600">No student cases available yet.</p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-white p-4">
        <h2 className="text-sm font-semibold">Case Contributions</h2>
        <p className="mt-1 text-xs text-gray-600">
          Search by case reference, client name, email, or stage. Select a case to load its contribution breakdown.
        </p>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Search cases
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="LBG-2026-0001, name, email, stage..."
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Select case
            </span>
            <select
              value={selectedCase?.studentProfileId ?? ""}
              onChange={(event) => loadContributions(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            >
              {filteredCases.length === 0 ? (
                <option value="">No matching cases</option>
              ) : (
                filteredCases.map((item) => (
                  <option key={item.studentProfileId} value={item.studentProfileId}>
                    {item.caseReference} · {item.displayName} · {caseStageLabel(item.caseStage)}
                  </option>
                ))
              )}
            </select>
          </label>
        </div>

        {selectedCase ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{selectedCase.caseReference}</p>
              <p className="text-sm text-slate-700">{selectedCase.displayName}</p>
              <p className="text-xs text-slate-500">{selectedCase.email}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${caseStageTone(selectedCase.caseStage)}`}
              >
                {caseStageLabel(selectedCase.caseStage)}
              </span>
              <Link
                href={`/dashboard/students/${selectedCase.userId}?tab=contributions`}
                className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                Open profile
              </Link>
              <button
                type="button"
                onClick={() => loadContributions(selectedCase.studentProfileId)}
                disabled={isPending}
                className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {isPending ? "Loading..." : data ? "Refresh" : "Load breakdown"}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {error ? (
        <section className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </section>
      ) : null}

      {isPending && !data ? (
        <section className="rounded-lg border bg-white p-6">
          <div className="h-40 animate-pulse rounded-lg bg-slate-100" />
        </section>
      ) : null}

      {data && selectedCase ? (
        <ContributionLeaderboard
          data={data}
          title={`Contributions for ${selectedCase.caseReference}`}
          subtitle={`${selectedCase.displayName} · Stages 70% · Documents 15% · Tasks 15%`}
        />
      ) : !isPending && selectedCase && !data && !error ? (
        <section className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          Select a case and click <span className="font-medium">Load breakdown</span> to view contribution details.
        </section>
      ) : null}
    </div>
  );
}
