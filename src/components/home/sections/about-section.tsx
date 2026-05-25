import { CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { proofBullets } from "@/components/home/content";
import { SectionReveal } from "@/components/home/section-reveal";

export function AboutSection() {
  return (
    <section id="about" className="home-section-space bg-slate-50">
      <div className="home-fluid-shell w-full">
        <div className="overflow-hidden rounded-xl border border-slate-200 shadow-md lg:grid lg:grid-cols-2">
          {/* Left — dark blue panel */}
          <SectionReveal>
            <div className="flex h-full flex-col justify-center bg-gradient-to-br from-blue-900 to-blue-800 p-8 md:p-12">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-400">
                About L&amp;B Global
              </p>
              <h2 className="mt-3 text-[clamp(1.6rem,3vw,2.3rem)] font-bold leading-tight tracking-tight text-white">
                Trusted Education Consultants Since Our Founding
              </h2>
              <p className="mt-5 text-base leading-relaxed text-blue-100/90">
                We are an overseas education consultancy delivering end-to-end support for
                admissions and visa outcomes. Our system is built for proactive follow-up
                and transparent student progress tracking — so no student is ever left
                guessing what happens next.
              </p>
              <p className="mt-4 text-base leading-relaxed text-blue-100/80">
                With offices in Thimphu, Bhutan and Perth, Australia, we operate where our
                students need us most — at both ends of the journey.
              </p>
              <Link
                href="/apply"
                className="mt-8 inline-flex w-fit rounded bg-gradient-to-r from-rose-500 to-blue-500 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
              >
                Book a Free Assessment
              </Link>
            </div>
          </SectionReveal>

          {/* Right — highlights panel */}
          <SectionReveal delay={0.1}>
            <div className="flex h-full flex-col justify-center bg-white p-8 md:p-12">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-500">
                Why Students Trust Us
              </p>
              <h3 className="mt-3 text-xl font-bold text-blue-900">
                Transparent process, tracked progress, and proactive follow-up
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Every inquiry is recorded, assigned, and tracked through clear stages so
                students always know what happens next.
              </p>
              <ul className="mt-6 space-y-4">
                {proofBullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
                    <span className="text-sm text-slate-700">{bullet}</span>
                  </li>
                ))}
              </ul>

              {/* Stat accents */}
              <div className="mt-8 grid grid-cols-3 gap-4 border-t border-slate-100 pt-6">
                {[
                  { value: "1,000+", label: "Students" },
                  { value: "2", label: "Offices" },
                  { value: "95%+", label: "Visa Success" },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <p className="text-2xl font-bold text-blue-900">{s.value}</p>
                    <p className="text-xs text-slate-500">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </SectionReveal>
        </div>
      </div>
    </section>
  );
}
