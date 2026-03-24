"use client";

import { motion } from "framer-motion";
import { ArrowRight, BadgeCheck, FileCheck2, Globe2, GraduationCap, ShieldCheck } from "lucide-react";

import { featureBullets, heroData, trustStats } from "@/components/home/content";
import { PrimaryButton, SecondaryButton } from "@/components/home/ui-primitives";

const featureIcons = [GraduationCap, FileCheck2, ShieldCheck, Globe2] as const;

export function HeroSection() {
  return (
    <section
      className="relative overflow-hidden bg-[radial-gradient(circle_at_0%_0%,rgba(244,63,94,0.18),transparent_35%),radial-gradient(circle_at_100%_20%,rgba(59,130,246,0.2),transparent_40%),linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)]"
      aria-labelledby="home-hero-heading"
    >
      <div className="pointer-events-none absolute -left-16 top-16 h-72 w-72 rounded-full bg-rose-300/25 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 top-28 h-80 w-80 rounded-full bg-blue-300/30 blur-3xl" />

      <div className="home-fluid-shell relative grid w-full gap-10 py-14 md:py-20 lg:grid-cols-12 lg:items-center">
        <motion.div
          className="text-center lg:col-span-7 lg:text-left"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
            <BadgeCheck className="h-3.5 w-3.5" /> {heroData.eyebrow}
          </p>

          <h1
            id="home-hero-heading"
            className="mt-4 text-[clamp(2rem,6vw,4.3rem)] font-bold tracking-tight text-slate-900"
          >
            {heroData.title}
            <span className="block bg-gradient-to-r from-rose-600 to-blue-600 bg-clip-text text-transparent">
              {heroData.titleHighlight}
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-[clamp(1rem,1.5vw,1.15rem)] leading-relaxed text-slate-600 lg:mx-0">
            {heroData.subtitle}
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
            <PrimaryButton href={heroData.primaryCta.href} label={heroData.primaryCta.label} icon={<ArrowRight className="h-4 w-4" />} />
            <SecondaryButton href={heroData.secondaryCta.href} label={heroData.secondaryCta.label} />
          </div>

          <div className="mt-9 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
            {trustStats.map((item) => (
              <article
                key={item.label}
                className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-center shadow-sm lg:text-left"
              >
                <p className="text-lg font-bold text-slate-900">{item.value}</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
              </article>
            ))}
          </div>
        </motion.div>

        <motion.aside
          className="lg:col-span-5"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
        >
          <div className="rounded-3xl border border-white/70 bg-white/88 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.12)] backdrop-blur-sm">
            <h2 className="text-lg font-bold text-slate-900">What you get with L&B</h2>
            <div className="mt-4 space-y-3">
              {featureBullets.map((item, index) => {
                const Icon = featureIcons[index] ?? Globe2;
                return (
                  <div
                    key={item}
                    className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                    <span>{item}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.aside>
      </div>
    </section>
  );
}

