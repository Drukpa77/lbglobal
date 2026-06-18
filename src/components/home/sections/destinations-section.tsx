"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { destinations, homeCta } from "@/components/home/content";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useSectionInView } from "@/hooks/use-section-in-view";

const AUTO_ADVANCE_MS = 7000;

const revealEase = [0.22, 1, 0.36, 1] as const;

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2";

export function DestinationsSection() {
  const reduceMotion = useReducedMotion();
  const isMobile = useIsMobile();
  const sectionRef = useRef<HTMLElement | null>(null);
  const inView = useSectionInView(sectionRef, { threshold: 0.12 });
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const active = destinations[activeIndex];

  const goNext = useCallback(() => {
    setActiveIndex((current) => (current + 1) % destinations.length);
  }, []);

  const goToDestination = useCallback((index: number) => {
    setActiveIndex((current) => (current === index ? current : index));
  }, []);

  useEffect(() => {
    if (reduceMotion || isPaused || !inView || isMobile) return;
    const timer = window.setInterval(goNext, AUTO_ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [goNext, inView, isMobile, isPaused, reduceMotion]);

  const reveal = (delay = 0) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 22 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: "-80px" },
          transition: { duration: 0.6, ease: revealEase, delay },
        };

  return (
    <section
      ref={sectionRef}
      id="destinations"
      className="home-section-space relative overflow-hidden bg-slate-50"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={() => setIsPaused(false)}
    >
      <div
        className="pointer-events-none absolute -right-20 top-8 h-64 w-64 rounded-full bg-rose-200/30 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-16 bottom-0 h-72 w-72 rounded-full bg-blue-200/25 blur-3xl"
        aria-hidden
      />

      <div className="home-fluid-shell relative w-full">
        <motion.div className="text-center" {...reveal(0)}>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-500">
            Study Destinations
          </p>
          <h2 className="mt-2 text-[clamp(1.6rem,3.2vw,2.4rem)] font-bold tracking-tight text-blue-900">
            Countries We Represent
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-[clamp(0.95rem,1.4vw,1.05rem)] leading-7 text-slate-600">
            Global destinations with strong outcomes and practical pathways for Bhutanese
            and international students.
          </p>
        </motion.div>

        <motion.div
          className="mt-8 flex flex-wrap justify-center gap-2"
          {...reveal(0.1)}
        >
          {destinations.map((item, index) => (
            <button
              key={item.country}
              type="button"
              onClick={() => goToDestination(index)}
              aria-pressed={index === activeIndex}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${focusRing} ${
                index === activeIndex
                  ? "border-transparent bg-gradient-to-r from-rose-500 to-blue-600 text-white shadow-md"
                  : "border-slate-200 bg-white/80 text-slate-600 hover:border-rose-200 hover:text-blue-900"
              }`}
            >
              <span className="mr-1.5" aria-hidden>
                {item.flag}
              </span>
              {item.country}
            </button>
          ))}
        </motion.div>

        <motion.div className="mt-8" {...reveal(0.18)}>
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl shadow-slate-200/40">
            <div className="h-2 w-full bg-gradient-to-r from-rose-500 to-blue-600" />
            <div className="p-6 md:p-10">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={active.country}
                  initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
                  transition={{ duration: 0.35, ease: revealEase }}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-5xl" role="img" aria-label={active.country}>
                      {active.flag}
                    </span>
                    <div>
                      <h3 className="text-2xl font-bold text-blue-900">{active.country}</h3>
                      <p className="text-sm font-medium text-rose-500">{active.tagline}</p>
                    </div>
                  </div>
                  <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-600">
                    {active.description}
                  </p>
                  <ul className="mt-6 grid gap-2 sm:grid-cols-3">
                    {active.highlights.map((highlight, highlightIndex) => (
                      <motion.li
                        key={highlight}
                        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.3,
                          delay: reduceMotion ? 0 : highlightIndex * 0.06,
                          ease: revealEase,
                        }}
                        className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm text-slate-700"
                      >
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-rose-500" />
                        {highlight}
                      </motion.li>
                    ))}
                  </ul>
                  <Link
                    href={homeCta.primary.href}
                    className={`mt-8 inline-flex items-center gap-2 rounded-full bg-blue-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-gradient-to-r hover:from-rose-500 hover:to-blue-600 ${focusRing}`}
                  >
                    {homeCta.primary.label} — {active.country}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
