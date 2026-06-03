import Link from "next/link";

import { LocationFilterButtons } from "@/components/location-filter-buttons";
import type { InquiryLocationFilter } from "@/lib/submission-filters";

export type NewInquiry = {
  id: string;
  submittedAt: Date;
  sourceCity: string | null;
  sourceCountry: string | null;
  student: { id: string; name: string | null; email: string };
};

type NewInquiriesCardProps = {
  inquiries: NewInquiry[];
  last24hCount: number;
  locationFilter?: InquiryLocationFilter;
  // Server action that accepts a `submissionId` form field and claims the
  // submission for the current user. Each dashboard wires its own action so
  // this component stays usable from both Sub-Admin and Admin pages.
  claimAction: (formData: FormData) => Promise<void>;
  filterHrefBase?: string;
  viewAllHref?: string;
};

export function NewInquiriesCard({
  inquiries,
  last24hCount,
  locationFilter = "all",
  claimAction,
  filterHrefBase = "/dashboard/sub-admin?tab=overview",
  viewAllHref = "/dashboard/sub-admin?tab=students&queue=unassigned",
}: NewInquiriesCardProps) {
  const total = inquiries.length;
  const subtitle =
    total === 0
      ? "Nothing new in the last 7 days. We'll surface fresh applications here as they arrive."
      : `${last24hCount} new in the last 24h · ${total} unclaimed in the last 7 days.`;

  return (
    <section className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-emerald-900">New Inquiries (Unclaimed)</h2>
            <LocationFilterButtons active={locationFilter} hrefBase={filterHrefBase} tone="emerald" />
          </div>
          <p className="mt-1 text-xs text-emerald-800/80">{subtitle}</p>
        </div>
        <Link
          href={viewAllHref}
          className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100"
        >
          View unassigned queue
        </Link>
      </div>

      {total === 0 ? null : (
        <ul className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {inquiries.map((inquiry) => {
            const displayName = inquiry.student.name?.trim() || inquiry.student.email;
            const location = [inquiry.sourceCity, inquiry.sourceCountry]
              .map((part) => part?.trim())
              .filter((part): part is string => Boolean(part))
              .join(", ");
            return (
              <li
                key={inquiry.id}
                className="rounded-md border border-emerald-200 bg-white p-2.5 shadow-sm"
              >
                <p className="text-sm font-semibold text-slate-900">{displayName}</p>
                <p className="mt-0.5 text-xs text-slate-600">
                  {location || "Location not provided"}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Submitted {formatRelativeTime(inquiry.submittedAt)}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <Link
                    href={`/dashboard/students/${inquiry.student.id}`}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Open
                  </Link>
                  <form action={claimAction}>
                    <input type="hidden" name="submissionId" value={inquiry.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-emerald-400 bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-900 transition hover:bg-emerald-200"
                    >
                      Claim
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function formatRelativeTime(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
