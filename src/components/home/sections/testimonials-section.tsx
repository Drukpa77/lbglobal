"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, Quote, Star } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { testimonials } from "@/components/home/content";
import { SectionReveal } from "@/components/home/section-reveal";
import { useSectionInView } from "@/hooks/use-section-in-view";

const AUTO_ADVANCE_MS = 6000;

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2";

export function TestimonialsSection() {
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement | null>(null);
  const inView = useSectionInView(sectionRef);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const active = testimonials[activeIndex];

  const goTo = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);

  const goNext = useCallback(() => {
    setActiveIndex((current) => (current + 1) % testimonials.length);
  }, []);

  const goPrev = useCallback(() => {
    setActiveIndex(
      (current) => (current - 1 + testimonials.length) % testimonials.length,
    );
  }, []);

  useEffect(() => {
    if (reduceMotion || isPaused || !inView) return;
    const timer = window.setInterval(goNext, AUTO_ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [goNext, inView, isPaused, reduceMotion]);

  return (
    <section
      ref={sectionRef}
      id="testimonials"
      className="home-section-space bg-slate-50"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={() => setIsPaused(false)}
    >
      <div className="home-fluid-shell w-full">
        <SectionReveal>
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-500">
              Student Stories
            </p>
            <h2 className="mt-2 text-[clamp(1.6rem,3.2vw,2.4rem)] font-bold tracking-tight text-blue-900">
              What Our Students Say
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-[clamp(0.95rem,1.4vw,1.05rem)] leading-7 text-slate-600">
              Real experiences from students we have helped achieve their international
              education goals.
            </p>
          </div>
        </SectionReveal>

        <SectionReveal delay={0.1}>
          <div className="relative mx-auto mt-10 max-w-3xl">
            <article className="min-h-[280px] rounded-2xl border border-slate-200 bg-white p-8 shadow-md md:p-10">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={active.name}
                  initial={reduceMotion ? false : { opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, x: -16 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="flex gap-0.5">
                    {Array.from({ length: active.rating }).map((_, i) => (
                      <Star
                        key={i}
                        className="h-4 w-4 fill-rose-500 text-rose-500"
                        aria-hidden
                      />
                    ))}
                  </div>
                  <Quote className="mt-4 h-8 w-8 text-blue-100" aria-hidden />
                  <p className="mt-3 text-lg leading-relaxed text-slate-700">
                    &ldquo;{active.quote}&rdquo;
                  </p>
                  <div className="mt-8 flex items-center gap-3 border-t border-slate-100 pt-6">
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-blue-600 text-base font-bold text-white"
                      aria-hidden
                    >
                      {active.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold text-blue-900">{active.name}</p>
                      <p className="text-sm text-slate-500">{active.location}</p>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </article>

            <div className="mt-6 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={goPrev}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-rose-200 hover:text-blue-900 ${focusRing}`}
                aria-label="Previous testimonial"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="flex gap-2" role="tablist" aria-label="Testimonials">
                {testimonials.map((item, index) => (
                  <button
                    key={item.name}
                    type="button"
                    role="tab"
                    aria-selected={index === activeIndex}
                    aria-label={`Show testimonial from ${item.name}`}
                    onClick={() => goTo(index)}
                    className={`h-2 rounded-full transition-all ${focusRing} ${
                      index === activeIndex
                        ? "w-8 bg-gradient-to-r from-rose-500 to-blue-600"
                        : "w-2 bg-slate-300 hover:bg-slate-400"
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={goNext}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-rose-200 hover:text-blue-900 ${focusRing}`}
                aria-label="Next testimonial"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}
