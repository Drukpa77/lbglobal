"use client";

const sections = [
  { id: "overview", label: "Overview & Notes" },
  { id: "case-stage", label: "Case Stage" },
  { id: "profile", label: "Profile & Assignment" },
  { id: "tasks", label: "Tasks & Documents" },
  { id: "financials", label: "Contracts & Invoices" },
  { id: "audit", label: "Audit Log" },
];

export function SectionNav() {
  return (
    <nav className="sticky top-0 z-10 -mx-6 -mt-2 mb-6 flex flex-wrap gap-2 border-b border-slate-200 bg-white/95 px-6 py-3 backdrop-blur-sm">
      {sections.map(({ id, label }) => (
        <a
          key={id}
          href={`#${id}`}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
