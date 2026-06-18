"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  ClipboardList,
  FileStack,
  Headphones,
  PlaneTakeoff,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { homeCta, processSteps } from "@/components/home/content";
import { SectionReveal } from "@/components/home/section-reveal";
import { useSectionInView } from "@/hooks/use-section-in-view";

const STEP_ICONS = [ClipboardList, Headphones, FileStack, PlaneTakeoff] as const;

const AUTO_ADVANCE_MS = 5500;

const STEP_ACTIONS = [
  { href: "/apply", label: "Apply now" },
  { href: "/apply", label: "Apply now" },
  { href: "#contact", label: "Contact us" },
  { href: "#contact", label: "Contact us" },
] as const;

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2";

export function ProcessSection() {
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement | null>(null);
  const inView = useSectionInView(sectionRef);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const activeStep = processSteps[activeIndex];
  const ActiveIcon = STEP_ICONS[activeIndex] ?? ClipboardList;
  const progressPercent = ((activeIndex + 1) / processSteps.length) * 100;

  const goToStep = useCallback((index: number) => {
    setActiveIndex((current) => (current === index ? current : index));
  }, []);

  const goNext = useCallback(() => {
    setActiveIndex((current) => (current + 1) % processSteps.length);
  }, []);

  useEffect(() => {
    if (reduceMotion || isPaused || !inView) return;
    const timer = window.setInterval(goNext, AUTO_ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [goNext, inView, isPaused, reduceMotion]);

  const stepAction = STEP_ACTIONS[activeIndex];

  return (
    <section
      ref={sectionRef}
      id="process"
      className="home-section-space relative overflow-hidden bg-slate-50"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={() => setIsPaused(false)}
    >
      <div
        className="pointer-events-none absolute -left-32 top-0 h-72 w-72 rounded-full bg-rose-200/40 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-blue-200/35 blur-3xl"
        aria-hidden
      />

      <div className="home-fluid-shell relative w-full">
        <SectionReveal>
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-500">
              Your journey
            </p>
            <h2 className="mt-2 text-[clamp(1.6rem,3.2vw,2.4rem)] font-bold tracking-tight text-blue-900">
              How It Works
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-[clamp(0.95rem,1.4vw,1.05rem)] leading-7 text-slate-600">
              A simple 4-step path designed to reduce confusion and speed up your outcome.
              Select a step to see what happens at each stage.
            </p>
          </div>
        </SectionReveal>

        {/* Mobile: step chips */}
        <div className="mt-10 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
          {processSteps.map((item, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={item.step}
                type="button"
                onClick={() => goToStep(index)}
                aria-pressed={isActive}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  isActive
                    ? "border-transparent bg-gradient-to-r from-rose-500 to-blue-600 text-white shadow-md"
                    : "border-slate-200 bg-white text-slate-600 hover:border-rose-200 hover:text-blue-900"
                }`}
              >
                {item.step}
              </button>
            );
          })}
        </div>

        <div className="mt-8 grid gap-8 lg:mt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-stretch lg:gap-10">
          {/* Step navigator — desktop */}
          <div className="hidden lg:flex lg:flex-col lg:gap-2">
            {processSteps.map((item, index) => {
              const isActive = index === activeIndex;
              const isComplete = index < activeIndex;
              const Icon = STEP_ICONS[index] ?? ClipboardList;

              return (
                <button
                  key={item.step}
                  type="button"
                  onClick={() => goToStep(index)}
                  aria-current={isActive ? "step" : undefined}
                  className={`group relative flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition ${
                    isActive
                      ? "border-rose-200/80 bg-white shadow-lg shadow-rose-100/50"
                      : "border-transparent bg-white/60 hover:border-slate-200 hover:bg-white hover:shadow-sm"
                  }`}
                >
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition ${
                      isActive
                        ? "bg-gradient-to-br from-rose-500 to-blue-600 text-white shadow-md"
                        : isComplete
                          ? "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200"
                          : "bg-slate-100 text-slate-500 group-hover:bg-rose-50 group-hover:text-rose-500"
                    }`}
                  >
                    <Icon className="h-5 w-5" strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p
                      className={`text-[11px] font-bold uppercase tracking-wider ${
                        isActive ? "text-rose-500" : "text-slate-400"
                      }`}
                    >
                      Step {item.step}
                    </p>
                    <p
                      className={`mt-0.5 font-semibold ${
                        isActive ? "text-blue-900" : "text-slate-700"
                      }`}
                    >
                      {item.title}
                    </p>
                  </div>
                  {isActive ? (
                    <motion.span
                      layoutId="process-active-indicator"
                      className="absolute inset-y-3 left-0 w-1 rounded-full bg-gradient-to-b from-rose-500 to-blue-600"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* Detail panel */}
          <SectionReveal delay={0.08}>
            <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl shadow-slate-200/50">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_90%_10%,rgba(244,63,94,0.08),transparent_45%),radial-gradient(circle_at_10%_90%,rgba(59,130,246,0.1),transparent_40%)]" />

              <div className="relative flex flex-col p-6 sm:p-8 lg:min-h-[320px]">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <Sparkles className="h-3.5 w-3.5 text-rose-500" />
                    Step {activeIndex + 1} of {processSteps.length}
                  </div>
                  <div className="hidden gap-1.5 sm:flex">
                    {processSteps.map((_, index) => (
                      <button
                        key={processSteps[index].step}
                        type="button"
                        onClick={() => goToStep(index)}
                        aria-label={`Go to step ${index + 1}`}
                        className={`h-2 rounded-full transition-all ${
                          index === activeIndex
                            ? "w-8 bg-gradient-to-r from-rose-500 to-blue-600"
                            : "w-2 bg-slate-200 hover:bg-slate-300"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={activeStep.step}
                    initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, y: -10 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    className="flex flex-1 flex-col"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-blue-600 text-white shadow-lg">
                        <ActiveIcon className="h-8 w-8" strokeWidth={1.75} />
                      </div>
                      <div>
                        <span className="text-4xl font-bold tracking-tight text-slate-200">
                          {activeStep.step}
                        </span>
                        <h3 className="-mt-1 text-2xl font-bold text-blue-900 sm:text-[1.65rem]">
                          {activeStep.title}
                        </h3>
                      </div>
                    </div>

                    <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-600">
                      {activeStep.description}
                    </p>

                    <Link
                      href={stepAction.href}
                      className={`mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-rose-600 transition hover:text-rose-700 ${focusRing}`}
                    >
                      {stepAction.label}
                      <ArrowRight className="h-4 w-4" />
                    </Link>

                    {activeIndex < processSteps.length - 1 ? (
                      <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-sm text-slate-600">
                        <span className="font-medium text-slate-500">Up next:</span>
                        <span className="font-semibold text-blue-900">
                          {processSteps[activeIndex + 1].title}
                        </span>
                      </p>
                    ) : (
                      <p className="mt-5 text-sm font-medium text-emerald-700">
                        You are at the final stage — we stay with you through departure.
                      </p>
                    )}
                  </motion.div>
                </AnimatePresence>

                <div className="mt-8 border-t border-slate-100 pt-6">
                  <div className="mb-2 flex justify-between text-xs font-medium text-slate-500">
                    <span>Journey progress</span>
                    <span>{Math.round(progressPercent)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-rose-500 to-blue-600"
                      initial={false}
                      animate={{ width: `${progressPercent}%` }}
                      transition={{ duration: reduceMotion ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={goNext}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-900"
                  >
                    Next step
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  {activeIndex === 0 ? (
                    <Link
                      href={homeCta.primary.href}
                      className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-md transition hover:brightness-110 ${focusRing}`}
                    >
                      {homeCta.primary.label}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          </SectionReveal>
        </div>

        {/* Mobile progress dots */}
        <div className="mt-4 flex justify-center gap-2 lg:hidden">
          {processSteps.map((_, index) => (
            <button
              key={processSteps[index].step}
              type="button"
              onClick={() => goToStep(index)}
              aria-label={`Go to step ${index + 1}`}
              className={`h-2 rounded-full transition-all ${
                index === activeIndex
                  ? "w-8 bg-gradient-to-r from-rose-500 to-blue-600"
                  : "w-2 bg-slate-300"
              }`}
            />
          ))}
        </div>

        <SectionReveal delay={0.2}>
          <div className="mt-12 text-center">
            <Link
              href={homeCta.primary.href}
              className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-blue-600 px-8 py-3.5 text-sm font-semibold text-white shadow-md transition hover:brightness-110 ${focusRing}`}
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
