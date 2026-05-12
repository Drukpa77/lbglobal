import {
  Award,
  BookOpen,
  FileText,
  GraduationCap,
  Heart,
  Home,
} from "lucide-react";
import Link from "next/link";

import { services } from "@/components/home/content";
import { SectionReveal } from "@/components/home/section-reveal";

const serviceIcons = [GraduationCap, FileText, Heart, BookOpen, Home, Award];

export function ServicesSection() {
  return (
    <section id="services" className="home-section-space bg-slate-50">
      <div className="home-fluid-shell w-full">
        <SectionReveal>
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-500">
              What We Offer
            </p>
            <h2 className="mt-2 text-[clamp(1.6rem,3.2vw,2.4rem)] font-bold tracking-tight text-blue-900">
              Our Services
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-[clamp(0.95rem,1.4vw,1.05rem)] leading-7 text-slate-600">
              Outcome-focused support for choosing the right course, submitting stronger
              applications, and completing visa steps with fewer mistakes.
            </p>
          </div>
        </SectionReveal>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service, index) => {
            const Icon = serviceIcons[index] ?? GraduationCap;
            return (
              <SectionReveal key={service.title} delay={index * 0.06}>
                <article className="group flex flex-col rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:border-rose-200 hover:shadow-md">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-rose-50 text-rose-500 ring-1 ring-rose-100 transition group-hover:bg-gradient-to-br group-hover:from-rose-500 group-hover:to-blue-500 group-hover:text-white">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-bold text-blue-900">{service.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">
                    {service.description}
                  </p>
                  <Link
                    href="/apply"
                    className="mt-4 text-sm font-semibold text-rose-500 transition hover:text-rose-600"
                  >
                    Learn More →
                  </Link>
                </article>
              </SectionReveal>
            );
          })}
        </div>

        <SectionReveal delay={0.3}>
          <div className="mt-10 text-center">
            <Link
              href="/apply"
              className="inline-flex items-center rounded border-2 border-blue-900 px-8 py-3 text-sm font-semibold text-blue-900 transition hover:bg-blue-900 hover:text-white"
            >
              View All Services
            </Link>
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}
