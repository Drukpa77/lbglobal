"use client";

import Link from "next/link";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import type { ReminderSeverity, ReminderType } from "@/lib/reminders";

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
  stage_stalled: "Stage Stalled",
  stage_info: "Stage",
};

export type ReminderCarouselItem = {
  id: string;
  type: ReminderType;
  severity: ReminderSeverity;
  title: string;
  description: string;
  dateLabel: string;
  link: string;
};

type Props = {
  reminders: ReminderCarouselItem[];
  title: string;
  totalCount: number;
  hiddenCount: number;
};

export function RemindersCarousel({
  reminders,
  title,
  totalCount,
  hiddenCount,
}: Props) {
  return (
    <Carousel
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      opts={{ align: "start", loop: false }}
      aria-label={title}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {totalCount} reminder{totalCount !== 1 ? "s" : ""} requiring attention
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <CarouselPrevious aria-label="Show previous reminder" />
          <CarouselNext aria-label="Show next reminder" />
        </div>
      </div>

      <CarouselContent className="mt-3" role="list">
        {reminders.map((reminder) => (
          <CarouselItem
            key={reminder.id}
            className="basis-[86%] sm:basis-1/2 xl:basis-1/3"
            role="listitem"
          >
            <Link
              href={reminder.link}
              className={`block h-full rounded-lg border-l-4 p-3 transition hover:opacity-90 ${severityStyles[reminder.severity]} min-h-28`}
            >
              <div className="flex h-full flex-col justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="inline-block rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                    {typeLabels[reminder.type]}
                  </span>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    {reminder.title}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">
                    {reminder.description}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="shrink-0 text-xs text-slate-500">
                    {reminder.dateLabel}
                  </span>
                  <span className="text-[11px] font-medium text-blue-700">
                    Open
                  </span>
                </div>
              </div>
            </Link>
          </CarouselItem>
        ))}
      </CarouselContent>

      {hiddenCount > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          +{hiddenCount} more reminder{hiddenCount !== 1 ? "s" : ""}
        </p>
      )}
    </Carousel>
  );
}
