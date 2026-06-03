import Link from "next/link";

import type { InquiryLocationFilter } from "@/lib/submission-filters";

type LocationFilterButtonsProps = {
  active: InquiryLocationFilter;
  hrefBase: string;
  tone?: "emerald" | "slate";
};

const filterItems: { value: InquiryLocationFilter; label: string }[] = [
  { value: "onshore", label: "Onshore" },
  { value: "offshore", label: "Offshore" },
  { value: "all", label: "All" },
];

export function LocationFilterButtons({
  active,
  hrefBase,
  tone = "slate",
}: LocationFilterButtonsProps) {
  const activeClass =
    tone === "emerald" ? "bg-emerald-700 text-white" : "bg-slate-900 text-white";
  const idleClass =
    tone === "emerald"
      ? "text-emerald-800 hover:bg-emerald-100"
      : "text-slate-700 hover:bg-slate-100";
  const borderClass = tone === "emerald" ? "border-emerald-300" : "border-slate-300";

  return (
    <div className={`flex rounded-md border ${borderClass} bg-white p-0.5`}>
      {filterItems.map((item) => {
        const isActive = active === item.value;
        return (
          <Link
            key={item.value}
            href={buildLocationFilterHref(hrefBase, item.value)}
            aria-current={isActive ? "true" : undefined}
            className={`rounded px-2 py-1 text-[11px] font-semibold transition ${
              isActive ? activeClass : idleClass
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

function buildLocationFilterHref(baseHref: string, location: InquiryLocationFilter) {
  const [pathname, queryString = ""] = baseHref.split("?");
  const params = new URLSearchParams(queryString);
  if (location === "all") {
    params.delete("inquiryLocation");
  } else {
    params.set("inquiryLocation", location);
  }
  const nextQueryString = params.toString();
  return nextQueryString ? `${pathname}?${nextQueryString}` : pathname;
}
