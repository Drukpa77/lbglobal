"use client";

import { Download, X } from "lucide-react";
import { useMemo, useState } from "react";

export type CaseStageFunnelStudent = {
  id: string;
  name: string;
  email: string;
  phone: string;
  visaService: string;
  profileHref: string;
};

export type CaseStageFunnelItem = {
  stage: string;
  label: string;
  toneClass: string;
  count: number;
  percentage: number;
  exportUrl: string;
  students: CaseStageFunnelStudent[];
};

type Props = {
  items: CaseStageFunnelItem[];
  workflowStageCount: number;
  total: number;
};

export function CaseStageFunnelDetail({ items, workflowStageCount, total }: Props) {
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const selected = useMemo(
    () => items.find((item) => item.stage === selectedStage) ?? null,
    [items, selectedStage],
  );
  const workflowItems = items.slice(0, workflowStageCount);
  const outcomeItems = items.slice(workflowStageCount);

  return (
    <section className="rounded-lg border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Case Stage Funnel</h2>
          <p className="mt-1 text-xs text-gray-600">
            {total} client{total === 1 ? "" : "s"} across the workflow
          </p>
        </div>
      </div>
      <div className="mt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Funnel view</p>
        <ul className="mt-2 space-y-1.5">
          {workflowItems.map((item) => (
            <li key={`${item.stage}-funnel`}>
              <button
                type="button"
                onClick={() => setSelectedStage(item.stage)}
                className="grid w-full grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-x-3 gap-y-1 rounded-md px-1 py-1 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:grid-cols-[minmax(12rem,15rem)_2.5rem_minmax(8rem,1fr)_3.5rem]"
                aria-label={`View ${item.label} clients`}
              >
                <span className="min-w-0 text-xs font-medium text-gray-700">
                  {item.label}
                </span>
                <span className="text-center text-xs font-semibold text-gray-700">
                  {item.count}
                </span>
                <span className="relative col-span-1 h-5 overflow-hidden rounded-md bg-gray-100">
                  <span
                    className="block h-full rounded-md bg-gradient-to-r from-rose-400 to-blue-500"
                    style={{ width: `${Math.max(item.percentage, item.count > 0 ? 2 : 0)}%` }}
                  />
                </span>
                <span className="text-right text-xs font-semibold text-gray-700">
                  {item.percentage}%
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Outcomes / end states</p>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
          {outcomeItems.map((item) => (
            <button
              key={item.stage}
              type="button"
              onClick={() => setSelectedStage(item.stage)}
              className={`min-w-[150px] rounded-md border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${item.toneClass}`}
              aria-label={`View ${item.label} clients`}
            >
              <span className="block text-[11px] font-semibold uppercase tracking-wide opacity-80">
                {item.label}
              </span>
              <span className="mt-1 block text-xl font-semibold">{item.count}</span>
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 px-3 py-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="case-stage-modal-title"
            className="flex max-h-[calc(100dvh-3rem)] w-full max-w-4xl flex-col rounded-lg bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
              <div>
                <h3 id="case-stage-modal-title" className="text-base font-semibold text-slate-900">
                  {selected.label}
                </h3>
                <p className="mt-1 text-xs text-slate-600">
                  {selected.count} client{selected.count === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={selected.exportUrl}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <Download className="h-4 w-4" aria-hidden />
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => setSelectedStage(null)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-slate-700 transition hover:bg-slate-50"
                  aria-label="Close case stage clients"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {selected.students.length === 0 ? (
                <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                  No clients are currently in this stage.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-semibold">Student</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Email</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Phone</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Visa Service</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selected.students.map((student) => (
                        <tr key={student.id} className="align-top">
                          <td className="px-3 py-3 font-medium text-slate-900">
                            <a href={student.profileHref} className="hover:text-blue-700 hover:underline">
                              {student.name}
                            </a>
                          </td>
                          <td className="px-3 py-3 text-slate-700">{student.email}</td>
                          <td className="px-3 py-3 text-slate-700">{student.phone}</td>
                          <td className="px-3 py-3 text-slate-700">{student.visaService}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
