import Link from "next/link";

import type { Reminder, ReminderSeverity, ReminderType } from "@/lib/reminders";

const severityStyles: Record<ReminderSeverity, string> = {
  info: "border-l-blue-500 bg-blue-50/50",
  warning: "border-l-amber-500 bg-amber-50/50",
  urgent: "border-l-red-500 bg-red-50/50",
};

const typeLabels: Record<ReminderType, string> = {
  followup: "Follow-up",
  visa_expiry: "Visa",
  task_due: "Task",
  contract_reminder: "Contract",
  invoice_reminder: "Invoice",
};

type Props = {
  reminders: Reminder[];
  title?: string;
  maxItems?: number;
};

export function RemindersWidget({ reminders, title = "Reminders", maxItems = 10 }: Props) {
  const displayed = reminders.slice(0, maxItems);
  const hasMore = reminders.length > maxItems;

  if (reminders.length === 0) {
    return null;
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <p className="mt-0.5 text-xs text-slate-500">
        {reminders.length} reminder{reminders.length !== 1 ? "s" : ""} requiring attention
      </p>
      <ul className="mt-3 space-y-2">
        {displayed.map((reminder) => (
          <li
            key={reminder.id}
            className={`rounded-lg border-l-4 p-3 ${severityStyles[reminder.severity]}`}
          >
            <Link
              href={reminder.link}
              className="block transition hover:opacity-90"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="inline-block rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                    {typeLabels[reminder.type]}
                  </span>
                  <p className="mt-1 text-sm font-medium text-slate-900">{reminder.title}</p>
                  <p className="mt-0.5 text-xs text-slate-600 line-clamp-2">{reminder.description}</p>
                </div>
                <span className="shrink-0 text-xs text-slate-500">
                  {reminder.date.toLocaleDateString()}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {hasMore && (
        <p className="mt-2 text-xs text-slate-500">
          +{reminders.length - maxItems} more reminder{reminders.length - maxItems !== 1 ? "s" : ""}
        </p>
      )}
    </section>
  );
}
