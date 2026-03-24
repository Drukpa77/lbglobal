"use client";

import { useState } from "react";

type HelpContent = {
  title: string;
  items: string[];
};

export function DashboardHelp({ content }: { content: HelpContent }) {
  const [open, setOpen] = useState(false);

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="rounded-lg border border-slate-200 bg-slate-50/80"
    >
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100/80">
        {content.title}
      </summary>
      <ul className="list-inside list-disc space-y-1.5 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
        {content.items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </details>
  );
}
