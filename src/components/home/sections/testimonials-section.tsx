import { Quote, Star } from "lucide-react";

import { testimonials } from "@/components/home/content";
import { SectionReveal } from "@/components/home/section-reveal";

export function TestimonialsSection() {
  return (
    <section id="testimonials" className="home-section-space bg-slate-50">
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

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {testimonials.map((item, index) => (
            <SectionReveal key={item.name} delay={index * 0.08}>
              <article className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                {/* Stars */}
                <div className="flex gap-0.5">
                  {Array.from({ length: item.rating }).map((_, i) => (
                    <Star
                      key={i}
                      className="h-4 w-4 fill-rose-500 text-rose-500"
                    />
                  ))}
                </div>

                {/* Quote icon */}
                <Quote className="mt-4 h-7 w-7 text-blue-100" />

                {/* Quote text */}
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-700">
                  {item.quote}
                </p>

                {/* Author */}
                <div className="mt-6 flex items-center gap-3 border-t border-slate-100 pt-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-blue-600 text-sm font-bold text-white">
                    {item.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-blue-900">{item.name}</p>
                    <p className="text-xs text-rose-500">{item.location}</p>
                  </div>
                </div>
              </article>
            </SectionReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
