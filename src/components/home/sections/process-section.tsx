import Link from "next/link";

import { processSteps } from "@/components/home/content";
import { SectionReveal } from "@/components/home/section-reveal";
import { SectionHeading, SurfaceCard } from "@/components/home/ui-primitives";

export function ProcessSection() {
  return (
    <section id="process" className="home-section-space">
      <div className="home-fluid-shell w-full">
        <SectionReveal>
          <SectionHeading
            title="How It Works"
            subtitle="A simple 4-step path designed to reduce confusion and speed up outcomes."
          />
        </SectionReveal>

        <div className="mt-10 grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          {processSteps.map((item, index) => (
            <SectionReveal key={item.step} delay={index * 0.05}>
              <SurfaceCard>
                <p className="text-xs font-semibold tracking-[0.2em] text-blue-600">{item.step}</p>
                <h3 className="mt-2 text-lg font-bold text-slate-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.description}</p>
              </SurfaceCard>
            </SectionReveal>
          ))}
        </div>

        <SectionReveal delay={0.2}>
          <div className="mt-8 text-center">
            <Link
              href="/apply"
              className="inline-flex rounded-2xl bg-gradient-to-r from-rose-500 to-blue-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(59,130,246,0.22)] transition hover:brightness-105"
            >
              Start My Plan
            </Link>
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}

