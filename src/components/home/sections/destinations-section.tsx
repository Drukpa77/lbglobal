import { CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { destinations } from "@/components/home/content";
import { SectionReveal } from "@/components/home/section-reveal";

export function DestinationsSection() {
  return (
    <section id="destinations" className="home-section-space bg-white">
      <div className="home-fluid-shell w-full">
        <SectionReveal>
          <div className="text-center">
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
          </div>
        </SectionReveal>

        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {destinations.map((item, index) => (
            <SectionReveal key={item.country} delay={index * 0.08}>
              <article className="group h-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
                {/* Top gradient band */}
                <div className="h-2 w-full bg-gradient-to-r from-rose-500 to-blue-600" />
                <div className="p-6 md:p-8">
                  <div className="flex items-center gap-3">
                    <span className="text-4xl" role="img" aria-label={item.country}>
                      {item.flag}
                    </span>
                    <div>
                      <h3 className="text-xl font-bold text-blue-900">{item.country}</h3>
                      <p className="text-xs font-medium text-rose-500">
                        {item.tagline}
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-slate-600">
                    {item.description}
                  </p>
                  <ul className="mt-5 space-y-2">
                    {item.highlights.map((h) => (
                      <li key={h} className="flex items-center gap-2 text-sm text-slate-700">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-rose-500" />
                        {h}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/apply"
                    className="mt-6 inline-flex rounded bg-blue-900 px-5 py-2.5 text-sm font-semibold text-white transition group-hover:bg-gradient-to-r group-hover:from-rose-500 group-hover:to-blue-600"
                  >
                    Explore {item.country} →
                  </Link>
                </div>
              </article>
            </SectionReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
