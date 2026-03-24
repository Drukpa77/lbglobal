import Link from "next/link";

import { destinations } from "@/components/home/content";
import { SectionReveal } from "@/components/home/section-reveal";
import { SectionHeading, SurfaceCard } from "@/components/home/ui-primitives";

export function DestinationsSection() {
  return (
    <section id="destinations" className="home-section-space border-y border-slate-200/90 bg-white">
      <div className="home-fluid-shell w-full">
        <SectionReveal>
          <SectionHeading
            title="Countries We Represent"
            subtitle="Global destinations with strong outcomes and practical pathways for Bhutanese and international students."
          />
        </SectionReveal>

        <div className="mt-10 grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
          {destinations.map((item, index) => (
            <SectionReveal key={item.country} delay={index * 0.05}>
              <SurfaceCard>
                <h3 className="text-xl font-bold text-rose-600">{item.country}</h3>
                <p className="mt-3 text-slate-600">{item.description}</p>
                <Link
                  href="/apply"
                  className="mt-4 inline-flex text-sm font-semibold text-blue-600 hover:underline"
                >
                  Learn more →
                </Link>
              </SurfaceCard>
            </SectionReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

