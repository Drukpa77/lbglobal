"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Award,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileText,
  GraduationCap,
  Heart,
  Home,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { homeCta, services } from "@/components/home/content";
import { SectionReveal } from "@/components/home/section-reveal";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useSectionInView } from "@/hooks/use-section-in-view";

const SERVICE_ICONS = [GraduationCap, FileText, Heart, BookOpen, Home, Award] as const;
const GAP_PX = 24;
const AUTO_SCROLL_PX_PER_FRAME = 0.45;
const MOBILE_STEP_MS = 7000;

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2";

export function ServicesSection() {
  const reduceMotion = useReducedMotion();
  const isMobile = useIsMobile();
  const sectionRef = useRef<HTMLElement | null>(null);
  const inView = useSectionInView(sectionRef);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const isAdjustingRef = useRef(false);
  const lastSyncedIndexRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const getItemWidth = useCallback(() => {
    const track = trackRef.current;
    if (!track) return 320;
    const card = track.querySelector<HTMLElement>("[data-service-slide]");
    return card ? card.offsetWidth + GAP_PX : 320;
  }, []);

  const getLogicalIndexFromScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return 0;
    const itemWidth = getItemWidth();
    if (itemWidth <= 0) return 0;
    const centered = Math.round(track.scrollLeft / itemWidth);
    return ((centered % services.length) + services.length) % services.length;
  }, [getItemWidth]);

  const scrollToLogicalIndex = useCallback(
    (logicalIndex: number, behavior: ScrollBehavior = "smooth") => {
      const track = trackRef.current;
      if (!track) return;
      const itemWidth = getItemWidth();
      const currentCentered = Math.round(track.scrollLeft / itemWidth);
      const currentLogical = ((currentCentered % services.length) + services.length) % services.length;
      let delta = logicalIndex - currentLogical;
      if (delta > services.length / 2) delta -= services.length;
      if (delta < -services.length / 2) delta += services.length;
      track.scrollTo({
        left: track.scrollLeft + delta * itemWidth,
        behavior,
      });
    },
    [getItemWidth],
  );

  const moveByCard = useCallback(
    (direction: "prev" | "next") => {
      const track = trackRef.current;
      if (!track) return;
      const itemWidth = getItemWidth();
      track.scrollBy({
        left: direction === "next" ? itemWidth : -itemWidth,
        behavior: "smooth",
      });
    },
    [getItemWidth],
  );

  const ensureLoopBounds = useCallback(() => {
    const track = trackRef.current;
    if (!track || isAdjustingRef.current) return;
    const itemWidth = getItemWidth();
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
  }, [getItemWidth]);

  const syncActiveIndex = useCallback(() => {
    const next = getLogicalIndexFromScroll();
    if (next !== lastSyncedIndexRef.current) {
      lastSyncedIndexRef.current = next;
      setActiveIndex(next);
    }
  }, [getLogicalIndexFromScroll]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollLeft = services.length * getItemWidth();
    syncActiveIndex();
  }, [getItemWidth, syncActiveIndex]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const onScroll = () => {
      ensureLoopBounds();
      syncActiveIndex();
    };
    track.addEventListener("scroll", onScroll, { passive: true });

    return () => track.removeEventListener("scroll", onScroll);
  }, [ensureLoopBounds, syncActiveIndex]);

  useEffect(() => {
    if (reduceMotion || isPaused || !inView || isMobile) return;

    let frameId = 0;
    const tick = () => {
      const track = trackRef.current;
      if (track) {
        track.scrollLeft += AUTO_SCROLL_PX_PER_FRAME;
        ensureLoopBounds();
        syncActiveIndex();
      }
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [ensureLoopBounds, inView, isMobile, isPaused, reduceMotion, syncActiveIndex]);

  useEffect(() => {
    if (reduceMotion || isPaused || !inView || !isMobile) return;
    const timer = window.setInterval(() => moveByCard("next"), MOBILE_STEP_MS);
    return () => window.clearInterval(timer);
  }, [inView, isMobile, isPaused, moveByCard, reduceMotion]);

  return (
    <section
      ref={sectionRef}
      id="services"
      className="home-section-space relative overflow-hidden bg-slate-50"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={() => setIsPaused(false)}
    >
      <div
        className="pointer-events-none absolute -right-20 top-10 h-64 w-64 rounded-full bg-rose-200/35 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-16 bottom-8 h-72 w-72 rounded-full bg-blue-200/30 blur-3xl"
        aria-hidden
      />

      <div className="home-fluid-shell relative w-full">
        <SectionReveal>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="text-center sm:text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-500">
                What we offer
              </p>
              <h2 className="mt-2 text-[clamp(1.6rem,3.2vw,2.4rem)] font-bold tracking-tight text-blue-900">
                Our Services
              </h2>
              <p className="mt-3 max-w-xl text-[clamp(0.95rem,1.4vw,1.05rem)] leading-7 text-slate-600">
                Outcome-focused support for choosing the right course, submitting stronger
                applications, and completing visa steps with fewer mistakes.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => moveByCard("prev")}
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200/80 bg-white text-slate-600 shadow-sm transition hover:border-rose-200 hover:text-blue-900 hover:shadow-md ${focusRing}`}
                  aria-label="Previous service"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => moveByCard("next")}
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200/80 bg-white text-slate-600 shadow-sm transition hover:border-rose-200 hover:text-blue-900 hover:shadow-md ${focusRing}`}
                  aria-label="Next service"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </SectionReveal>

        {/* Quick jump pills */}
        <div className="mt-8 flex flex-wrap justify-center gap-2 sm:justify-start">
          {services.map((service, index) => (
            <button
              key={service.title}
              type="button"
              onClick={() => scrollToLogicalIndex(index)}
              aria-pressed={index === activeIndex}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                index === activeIndex
                  ? "border-transparent bg-gradient-to-r from-rose-500 to-blue-600 text-white shadow-md"
                  : "border-slate-200 bg-white/80 text-slate-600 hover:border-rose-200 hover:text-blue-900"
              }`}
            >
              {service.title}
            </button>
          ))}
        </div>

        <div className="relative mt-8">
          <div
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-slate-50 to-transparent sm:w-20"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-slate-50 to-transparent sm:w-20"
            aria-hidden
          />

          <div
            ref={trackRef}
            role="region"
            aria-label="Services carousel"
            className="flex snap-x snap-mandatory gap-6 overflow-x-auto py-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {[...services, ...services, ...services].map((service, index) => {
              const logicalIndex = index % services.length;
              const isActive = logicalIndex === activeIndex;
              const Icon = SERVICE_ICONS[logicalIndex] ?? GraduationCap;

              return (
                <div
                  key={`${service.title}-${index}`}
                  className="w-[min(88vw,320px)] shrink-0 snap-center sm:w-[min(42vw,300px)] md:w-[min(32vw,280px)] lg:w-[calc((100%-6rem)/3.25)]"
                >
                  <motion.div
                    animate={
                      reduceMotion
                        ? undefined
                        : {
                            scale: isActive ? 1 : 0.96,
                            opacity: isActive ? 1 : 0.88,
                          }
                    }
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full"
                  >
                    <Link
                      href={`/apply?service=${encodeURIComponent(service.title)}`}
                      data-service-slide
                      className={`group relative flex h-full min-h-[220px] flex-col overflow-hidden rounded-2xl border bg-white p-6 transition-shadow duration-300 ${
                        isActive
                          ? "border-rose-200/90 shadow-xl shadow-rose-100/40 ring-1 ring-rose-100"
                          : "border-slate-200/90 shadow-sm hover:border-rose-200/70 hover:shadow-lg"
                      }`}
                    >
                      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(244,63,94,0.06),transparent_50%),radial-gradient(circle_at_0%_100%,rgba(59,130,246,0.08),transparent_45%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                      {isActive ? (
                        <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-600">
                          <Sparkles className="h-3 w-3" />
                          Featured
                        </span>
                      ) : null}

                      <div
                        className={`relative mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl transition duration-300 ${
                          isActive
                            ? "bg-gradient-to-br from-rose-500 to-blue-600 text-white shadow-lg"
                            : "bg-rose-50 text-rose-500 ring-1 ring-rose-100 group-hover:bg-gradient-to-br group-hover:from-rose-500 group-hover:to-blue-600 group-hover:text-white"
                        }`}
                      >
                        <Icon className="h-6 w-6" strokeWidth={2} />
                      </div>

                      <h3 className="relative text-lg font-bold leading-snug text-blue-900">
                        {service.title}
                      </h3>
                      <p className="relative mt-2 flex-1 text-sm leading-relaxed text-slate-600">
                        {service.description}
                      </p>

                      <span
                        className={`relative mt-5 inline-flex w-fit items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${
                          isActive
                            ? "bg-gradient-to-r from-rose-500 to-blue-600 text-white shadow-md"
                            : "bg-slate-50 text-rose-600 group-hover:bg-rose-50"
                        }`}
                      >
                        Apply now
                        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                      </span>
                    </Link>
                  </motion.div>
                </div>
              );
            })}
          </div>
        </div>

        <SectionReveal delay={0.2}>
          <div className="mt-10 text-center">
            <Link
              href="/apply"
              className="inline-flex items-center gap-2 rounded-full border-2 border-blue-900 px-8 py-3 text-sm font-semibold text-blue-900 transition hover:bg-blue-900 hover:text-white"
            >
              {homeCta.primary.label}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}
