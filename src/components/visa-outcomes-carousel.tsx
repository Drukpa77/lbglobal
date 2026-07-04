"use client";

import Link from "next/link";

import { CaseReferenceLabel } from "@/components/case-reference-label";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import type { VisaOutcomeItem } from "@/components/visa-outcomes-panel";
import { caseStageLabel, caseStageTone } from "@/lib/case-stage";
import { formatVisaStatus } from "@/lib/student-tracking";
import { formatVisaServiceDisplay } from "@/lib/visa-services";

export function VisaOutcomesCarousel({ outcomes }: { outcomes: VisaOutcomeItem[] }) {
  const showControls = outcomes.length > 1;

  return (
    <Carousel className="mt-3" opts={{ align: "start", loop: false }} aria-label="Outcome cases">
      {showControls && (
        <div className="mb-2 flex justify-end gap-2">
          <CarouselPrevious aria-label="Show previous outcome case" />
          <CarouselNext aria-label="Show next outcome case" />
        </div>
      )}
      <CarouselContent role="list">
        {outcomes.map((item) => (
          <CarouselItem key={item.id} className="basis-[92%] md:basis-1/2 xl:basis-1/3" role="listitem">
            <article
              className={`flex min-h-32 flex-col justify-between rounded-md border p-3 ${caseStageTone(item.caseStage)}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">
                      {item.studentProfile.user.name ?? item.studentProfile.user.email}
                    </p>
                    <CaseReferenceLabel caseReference={item.caseReference} />
                  </div>
                  <p className="mt-1 text-xs opacity-80">
                    {formatVisaServiceDisplay({
                      visaServiceType: item.visaServiceType,
                      otherServiceDescription: item.otherServiceDescription,
                    })}
                  </p>
                  <p className="mt-1 text-xs opacity-80">
                    {caseStageLabel(item.caseStage)} - {formatVisaStatus(item.visaStatus)}
                    {item.completedAt ? ` - Outcome ${item.completedAt.toLocaleDateString()}` : ""}
                    {item.visaExpiryDate ? ` - Visa expiry ${item.visaExpiryDate.toLocaleDateString()}` : ""}
                  </p>
                </div>
                <Link
                  href={`/dashboard/students/${item.studentProfile.user.id}`}
                  className="rounded-md border border-current/20 bg-white/60 px-2 py-1 text-xs font-medium"
                >
                  Open Client
                </Link>
              </div>
            </article>
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  );
}
