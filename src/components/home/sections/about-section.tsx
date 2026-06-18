"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  FileCheck2,
  Globe2,
  LayoutDashboard,
  MapPin,
  Newspaper,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { homeCta, proofBullets } from "@/components/home/content";
import { SectionReveal } from "@/components/home/section-reveal";
import { useSectionInView } from "@/hooks/use-section-in-view";

const PROOF_PILLARS = [
  {
    title: "Dedicated counselors",
    icon: Users,
    body: proofBullets[0],
  },
  {
    title: "Document excellence",
    icon: FileCheck2,
    body: proofBullets[1],
  },
  {
    title: "Tracked accountability",
    icon: LayoutDashboard,
    body: proofBullets[2],
  },
  {
    title: "Live policy updates",
    icon: Newspaper,
    body: proofBullets[3],
  },
] as const;

const OFFICES = [
  { flag: "🇧🇹", city: "Thimphu", country: "Bhutan" },
  { flag: "🇦🇺", city: "Perth", country: "Australia" },
] as const;

const AUTO_ADVANCE_MS = 6000;

export function AboutSection() {
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement | null>(null);
  const inView = useSectionInView(sectionRef);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const activePillar = PROOF_PILLARS[activeIndex];
  const ActiveIcon = activePillar.icon;

  const goNext = useCallback(() => {
    setActiveIndex((current) => (current + 1) % PROOF_PILLARS.length);
  }, []);

  const goToPillar = useCallback((index: number) => {
    setActiveIndex((current) => (current === index ? current : index));
  }, []);

  useEffect(() => {
    if (reduceMotion || isPaused || !inView) return;
    const timer = window.setInterval(goNext, AUTO_ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [goNext, inView, isPaused, reduceMotion]);

  return (
    <section
      ref={sectionRef}
      id="about"
      className="home-section-space relative overflow-hidden bg-slate-50"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={() => setIsPaused(false)}
    >
      <div
        className="pointer-events-none absolute -left-24 top-0 h-80 w-80 rounded-full bg-blue-200/30 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-rose-200/35 blur-3xl"
        aria-hidden
      />

      <div className="home-fluid-shell relative w-full">
        <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xl shadow-slate-200/40 lg:grid lg:grid-cols-[1.05fr_1fr]">
          {/* Story panel */}
          <SectionReveal>
            <div className="relative flex h-full flex-col justify-center overflow-hidden bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 p-8 md:p-10 lg:p-12">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.04]"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
                  backgroundSize: "48px 48px",
                }}
                aria-hidden
              />
              <div className="relative">
                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-rose-300">
                  <Globe2 className="h-3.5 w-3.5" />
                  About L&amp;B Global
                </p>
                <h2 className="mt-4 text-[clamp(1.55rem,3vw,2.25rem)] font-bold leading-tight tracking-tight text-white">
                  Trusted education consultants at both ends of your journey
                </h2>
                <p className="mt-5 max-w-lg text-base leading-relaxed text-blue-100/90">
                  We are an overseas education consultancy delivering end-to-end support for
                  admissions and visa outcomes — with proactive follow-up and transparent
                  progress tracking so you always know what happens next.
                </p>

                <div className="mt-6 flex flex-wrap gap-3">
                  {OFFICES.map((office) => (
                    <div
                      key={office.city}
                      className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 backdrop-blur-sm"
                    >
                      <span className="text-lg" aria-hidden>
                        {office.flag}
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-white">{office.city}</p>
                        <p className="text-[11px] text-blue-200/80">{office.country}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <p className="mt-5 flex items-start gap-2 text-sm text-blue-100/75">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
                  Bhutan for counselling and assessment · Australia for onshore student support
                </p>

                <Link
                  href={homeCta.primary.href}
                  className="mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-blue-500 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:brightness-110"
                >
                  {homeCta.primary.label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </SectionReveal>

          {/* Interactive pillars */}
          <SectionReveal delay={0.1}>
            <div className="flex h-full flex-col p-8 md:p-10 lg:p-12">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-500">
                Why students trust us
              </p>
              <h3 className="mt-2 text-xl font-bold text-blue-900 sm:text-2xl">
                Built for clarity, not confusion
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                Tap a pillar to explore how we keep your case moving forward.
              </p>

              <div className="relative mt-6 min-h-[7.5rem] rounded-2xl border border-slate-100 bg-slate-50/80 p-5">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={activePillar.title}
                    initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-blue-600 text-white shadow-md">
                        <ActiveIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-bold text-blue-900">{activePillar.title}</p>
                        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                          {activePillar.body}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                {PROOF_PILLARS.map((pillar, index) => {
                  const isActive = index === activeIndex;
                  const Icon = pillar.icon;
                  return (
                    <button
                      key={pillar.title}
                      type="button"
                      onClick={() => goToPillar(index)}
                      aria-pressed={isActive}
                      className={`relative flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition ${
                        isActive
                          ? "border-rose-200 bg-white shadow-md ring-1 ring-rose-100"
                          : "border-slate-200/80 bg-white/60 hover:border-rose-200/60 hover:bg-white hover:shadow-sm"
                      }`}
                    >
                      {isActive ? (
                        <motion.span
                          layoutId="about-pillar-ring"
                          className="absolute inset-0 rounded-xl ring-2 ring-rose-400/30"
                          transition={{ type: "spring", stiffness: 400, damping: 34 }}
                        />
                      ) : null}
                      <Icon
                        className={`h-5 w-5 ${isActive ? "text-rose-500" : "text-slate-400"}`}
                      />
                      <span
                        className={`text-sm font-semibold leading-snug ${
                          isActive ? "text-blue-900" : "text-slate-700"
                        }`}
                      >
                        {pillar.title}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <div className="flex gap-1.5">
                  {PROOF_PILLARS.map((_, index) => (
                    <button
                      key={PROOF_PILLARS[index].title}
                      type="button"
                      onClick={() => goToPillar(index)}
                      aria-label={`Show ${PROOF_PILLARS[index].title}`}
                      className={`h-2 rounded-full transition-all ${
                        index === activeIndex
                          ? "w-7 bg-gradient-to-r from-rose-500 to-blue-600"
                          : "w-2 bg-slate-300 hover:bg-slate-400"
                      }`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={goNext}
                  className="text-xs font-semibold text-rose-600 transition hover:text-rose-700"
                >
                  Next highlight →
                </button>
              </div>
            </div>
          </SectionReveal>
        </div>
      </div>
    </section>
  );
}
