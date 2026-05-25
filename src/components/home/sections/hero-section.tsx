"use client";

import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { heroData, trustStats } from "@/components/home/content";

export function HeroSection() {
  return (
    <section
      className="relative overflow-hidden bg-blue-900"
      aria-labelledby="home-hero-heading"
    >
      {/* Background photo — fills the section, rendered below all overlays */}
      <Image
        src="/homepage_bg.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
        aria-hidden="true"
      />

      {/* Gradient overlay — left dense enough for text, right lets photo breathe */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-blue-900/85 via-blue-900/55 to-blue-900/25" />

      {/* Thin bottom fade so the wave edge is seamless */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-blue-900/40" />

      {/* Fine grid texture over the photo */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="home-fluid-shell relative z-10 w-full py-20 lg:py-28">
        <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
          {/* Left: headline & CTAs */}
          <motion.div
            className="lg:col-span-7"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="inline-block rounded bg-rose-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-rose-400">
              {heroData.eyebrow}
            </span>

            <h1
              id="home-hero-heading"
              className="mt-5 text-[clamp(2.2rem,5.5vw,4rem)] font-bold leading-tight tracking-tight text-white"
            >
              {heroData.title}
              <br />
              <span className="text-rose-400">{heroData.titleHighlight}</span>
            </h1>

            <p className="mt-6 max-w-xl text-[clamp(1rem,1.4vw,1.1rem)] leading-relaxed text-blue-100/90">
              {heroData.subtitle}
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href={heroData.primaryCta.href}
                className="inline-flex items-center gap-2 rounded bg-gradient-to-r from-rose-500 to-blue-500 px-7 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-110"
              >
                {heroData.primaryCta.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href={heroData.secondaryCta.href}
                className="inline-flex items-center rounded border border-white/30 px-7 py-3.5 text-sm font-semibold text-white transition hover:border-white/60 hover:bg-white/10"
              >
                {heroData.secondaryCta.label}
              </Link>
            </div>

            {/* Quick trust points */}
            <div className="mt-10 flex flex-wrap gap-3">
              {[
                "Free Initial Assessment",
                "Dedicated Counselor",
                "End-to-End Visa Support",
              ].map((point) => (
                <span
                  key={point}
                  className="flex items-center gap-1.5 text-sm text-blue-100"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-rose-400" />
                  {point}
                </span>
              ))}
            </div>
          </motion.div>

          {/* Right: stats card */}
          <motion.div
            className="lg:col-span-5"
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.78, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          >
            <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
              <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-rose-400">
                Why Choose L&amp;B Global
              </p>
              <div className="grid grid-cols-2 gap-4">
                {trustStats.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-lg border border-white/10 bg-white/5 p-4"
                  >
                    <p className="text-2xl font-bold text-white">{stat.value}</p>
                    <p className="mt-1 text-xs text-blue-200">{stat.label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 border-t border-white/10 pt-5">
                <p className="text-sm text-blue-100/80">
                  Helping students from Bhutan and beyond achieve their international
                  education goals with clear plans and real results.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Bottom wave */}
      <div className="relative z-10 h-10 bg-blue-900">
        <svg
          className="absolute bottom-0 left-0 w-full text-white"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1440 40"
          preserveAspectRatio="none"
        >
          <path d="M0,40 L1440,40 L1440,0 Q720,40 0,0 Z" fill="currentColor" />
        </svg>
      </div>
    </section>
  );
}
