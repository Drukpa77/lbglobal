import Link from "next/link";

import { processSteps } from "@/components/home/content";
import { SectionReveal } from "@/components/home/section-reveal";

export function ProcessSection() {
  return (
    <section id="process" className="home-section-space bg-white">
      <div className="home-fluid-shell w-full">
        <SectionReveal>
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-500">
              Simple Process
            </p>
            <h2 className="mt-2 text-[clamp(1.6rem,3.2vw,2.4rem)] font-bold tracking-tight text-blue-900">
              How It Works
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-[clamp(0.95rem,1.4vw,1.05rem)] leading-7 text-slate-600">
              A simple 4-step path designed to reduce confusion and speed up your outcome.
            </p>
          </div>
        </SectionReveal>

        <div className="relative mt-14">
          {/* Connector line — desktop only */}
          <div className="absolute left-0 right-0 top-[2.6rem] hidden h-0.5 bg-slate-200 lg:block" />

          <div className="grid gap-8 lg:grid-cols-4">
            {processSteps.map((item, index) => (
              <SectionReveal key={item.step} delay={index * 0.08}>
                <div className="relative flex flex-col items-center text-center lg:items-start lg:text-left">
                  {/* Step badge */}
                  <div className="relative z-10 flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-blue-600 shadow-md">
                    <span className="text-xl font-bold text-white">{item.step}</span>
                    {/* White dot accent */}
                    <span className="absolute -right-1 -top-1 h-4 w-4 rounded-full border-2 border-white bg-rose-400" />
                  </div>
                  <h3 className="mt-5 text-base font-bold text-blue-900">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {item.description}
                  </p>
                </div>
              </SectionReveal>
            ))}
          </div>
        </div>

        <SectionReveal delay={0.32}>
          <div className="mt-12 text-center">
            <Link
              href="/apply"
              className="inline-flex rounded bg-gradient-to-r from-rose-500 to-blue-600 px-8 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
            >
              Start My Application
            </Link>
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}
