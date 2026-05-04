"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { id: string; label: string; count?: number };

export function DashboardTabBar({
  tabs,
  activeTab,
}: {
  tabs: Tab[];
  activeTab: string;
}) {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-10 -mx-4 -mt-2 mb-6 flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-3 sm:-mx-6 sm:flex-wrap sm:overflow-visible sm:px-6">
      {tabs.map(({ id, label, count }) => {
        const isActive = activeTab === id;
        return (
          <Link
            key={id}
            href={`${pathname}?tab=${id}`}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-all ${
              isActive
                ? "bg-blue-600 text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            {label}
            {count !== undefined && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  isActive
                    ? "bg-white/25 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
