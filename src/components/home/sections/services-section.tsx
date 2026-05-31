"use client";

import { Award, BookOpen, ChevronLeft, ChevronRight, FileText, GraduationCap, Heart, Home } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { services } from "@/components/home/content";
import { SectionReveal } from "@/components/home/section-reveal";

const serviceIcons = [GraduationCap, FileText, Heart, BookOpen, Home, Award];

export function ServicesSection() {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const isAdjustingRef = useRef(false);

  const moveByCard = (direction: "prev" | "next") => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>("[data-service-slide]");
    const amount = card ? card.offsetWidth + 24 : 320;
    track.scrollBy({ left: direction === "next" ? amount : -amount, behavior: "smooth" });
  };

  const ensureLoopBounds = () => {
    const track = trackRef.current;
    if (!track || isAdjustingRef.current) return;
    const card = track.querySelector<HTMLElement>("[data-service-slide]");
    const itemWidth = card ? card.offsetWidth + 24 : 320;
    const cloneBlock = services.length * itemWidth;
    const maxScrollable = track.scrollWidth - track.clientWidth;
    if (cloneBlock <= 0 || maxScrollable <= 0) return;

    if (track.scrollLeft <= itemWidth * 0.5) {
      isAdjustingRef.current = true;
      track.scrollLeft += cloneBlock;
      isAdjustingRef.current = false;
      return;
    }

    if (track.scrollLeft >= maxScrollable - itemWidth * 0.5) {
      isAdjustingRef.current = true;
      track.scrollLeft -= cloneBlock;
      isAdjustingRef.current = false;
    }
  };

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>("[data-service-slide]");
    const itemWidth = card ? card.offsetWidth + 24 : 320;
    track.scrollLeft = services.length * itemWidth;
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const onScroll = () => ensureLoopBounds();
    track.addEventListener("scroll", onScroll, { passive: true });

    const timer = window.setInterval(() => {
      moveByCard("next");
    }, 5000);

    return () => {
      track.removeEventListener("scroll", onScroll);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <section id="services" className="home-section-space bg-slate-50">
      <div className="home-fluid-shell w-full">
        <SectionReveal>
          <div className="text-center">
            <h2 className="text-[clamp(1.6rem,3.2vw,2.4rem)] font-bold tracking-tight text-blue-900">
              Our Services
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-[clamp(0.95rem,1.4vw,1.05rem)] leading-7 text-slate-600">
              Outcome-focused support for choosing the right course, submitting stronger
              applications, and completing visa steps with fewer mistakes.
            </p>
          </div>
        </SectionReveal>

        <div className="mt-12 flex items-center justify-end gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => moveByCard("prev")}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 transition hover:border-blue-300 hover:text-blue-900"
              aria-label="Previous service"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => moveByCard("next")}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 transition hover:border-blue-300 hover:text-blue-900"
              aria-label="Next service"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          ref={trackRef}
          className="mt-6 flex snap-x snap-mandatory gap-6 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {[...services, ...services, ...services].map((service, index) => {
            const iconIndex = index % serviceIcons.length;
            const Icon = serviceIcons[iconIndex] ?? GraduationCap;
            return (
              <div
                key={`${service.title}-${index}`}
                className="w-[85%] shrink-0 sm:w-[45%] md:w-[31%] lg:w-[calc((100%-6rem)/5)]"
              >
                <Link
                  href={`/apply?service=${encodeURIComponent(service.title)}`}
                  data-service-slide
                  className="group flex h-full w-full snap-start flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-rose-200 hover:shadow-md"
                >
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-rose-50 text-rose-500 ring-1 ring-rose-100 transition group-hover:bg-gradient-to-br group-hover:from-rose-500 group-hover:to-blue-500 group-hover:text-white">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-bold text-blue-900">{service.title}</h3>
                  <span className="mt-4 text-sm font-semibold text-rose-500 transition group-hover:text-rose-600">
                    Apply now →
                  </span>
                </Link>
              </div>
            );
          })}
        </div>

        <SectionReveal delay={0.3}>
          <div className="mt-10 text-center">
            <Link
              href="/apply"
              className="inline-flex items-center rounded border-2 border-blue-900 px-8 py-3 text-sm font-semibold text-blue-900 transition hover:bg-blue-900 hover:text-white"
            >
              Enquire Now
            </Link>
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}
