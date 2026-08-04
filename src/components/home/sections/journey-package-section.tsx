"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Award,
  Briefcase,
  CheckCircle2,
  Compass,
  FileCheck2,
  GraduationCap,
  Handshake,
  Home as HomeIcon,
  PackageCheck,
  Plane,
  PlaneLanding,
  Route,
} from "lucide-react";
import Link from "next/link";

import { homeCta, journeyInclusions, journeyPackage } from "@/components/home/content";
import { SectionReveal } from "@/components/home/section-reveal";

const INCLUSION_ICONS = [
  Compass,
  GraduationCap,
  FileCheck2,
  PlaneLanding,
  HomeIcon,
  Plane,
  PackageCheck,
  Briefcase,
  Award,
  Handshake,
  Route,
] as const;

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-blue-900";

export function JourneyPackageSection() {
  const reduceMotion = useReducedMotion();

  return (
    <section
      id="package"
      className="home-section-space relative overflow-hidden bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-24 top-0 h-80 w-80 rounded-full bg-rose-500/20 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-20 bottom-0 h-96 w-96 rounded-full bg-blue-400/20 blur-3xl"
        aria-hidden
      />

      <div className="home-fluid-shell relative w-full">
        <SectionReveal>
          <div className="mx-auto max-w-3xl text-center">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-rose-300">
              {journeyPackage.eyebrow}
            </p>
            <h2 className="mt-3 text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-tight tracking-tight text-white">
              L&amp;B Global – {journeyPackage.title}
            </h2>
            <p className="mt-5 text-[clamp(1.05rem,1.8vw,1.3rem)] leading-relaxed text-blue-100/90">
              {journeyPackage.tagline}
              <br className="hidden sm:block" />{" "}
              <span className="font-semibold text-white">{journeyPackage.taglineHighlight}</span>
            </p>
          </div>
        </SectionReveal>

        <SectionReveal delay={0.1}>
          <p className="mt-12 text-center text-sm font-semibold uppercase tracking-[0.16em] text-blue-200/80">
            {journeyPackage.inclusionsLabel}
          </p>
        </SectionReveal>

        <div className="mx-auto mt-6 grid max-w-5xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {journeyInclusions.map((item, index) => {
            const Icon = INCLUSION_ICONS[index] ?? CheckCircle2;
            return (
              <motion.div
                key={item}
                initial={reduceMotion ? undefined : { opacity: 0, y: 14 }}
                whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: index * 0.04 }}
                className="group flex items-center gap-3 rounded-2xl border border-white/15 bg-white/[0.07] px-4 py-3.5 backdrop-blur-sm transition hover:border-rose-300/40 hover:bg-white/[0.12]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-blue-500 text-white shadow-md transition group-hover:brightness-110">
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="text-sm font-medium leading-snug text-white sm:text-[0.95rem]">
                  {item}
                </span>
              </motion.div>
            );
          })}
        </div>

        <SectionReveal delay={0.15}>
          <div className="mt-12 flex flex-col items-center gap-3 text-center">
            <Link
              href={homeCta.primary.href}
              className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-blue-500 px-8 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 ${focusRing}`}
            >
              {homeCta.primary.label}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="text-xs text-blue-200/70">
              Package inclusions vary by service tier — talk to a counselor for your personalised plan.
            </p>
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}
