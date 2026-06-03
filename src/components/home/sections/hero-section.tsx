"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { featureBullets, heroData, heroTrustLine } from "@/components/home/content";

const SPIN_WORDS = ["confidence", "clarity", "speed", "expert support"];

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-blue-900";

export function HeroSection() {
  const reduceMotion = useReducedMotion();
  const [spinIndex, setSpinIndex] = useState(0);
  const spinWord = reduceMotion ? SPIN_WORDS[0] : SPIN_WORDS[spinIndex];

  useEffect(() => {
    if (reduceMotion) return;
    const timer = window.setInterval(() => {
      setSpinIndex((current) => (current + 1) % SPIN_WORDS.length);
    }, 2200);
    return () => window.clearInterval(timer);
  }, [reduceMotion]);

  return (
    <section
      className="relative -mt-[5.25rem] overflow-hidden bg-blue-900"
      aria-labelledby="home-hero-heading"
    >
      <Image
        src="/homepage_bg.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
        aria-hidden="true"
      />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-blue-900/85 via-blue-900/55 to-blue-900/25" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-blue-900/40" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="home-fluid-shell relative z-10 w-full pt-36 pb-20 lg:pt-44 lg:pb-28">
        <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
          <motion.div
            className="lg:col-span-5"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="max-w-xl text-[clamp(1rem,1.4vw,1.1rem)] leading-relaxed text-blue-100/90">
              We help students choose the right course, prepare stronger applications, and
              move through visa steps with{" "}
              <span className="relative inline-flex h-[1.4em] min-w-[14ch] align-middle">
                {reduceMotion ? (
                  <span className="font-semibold text-rose-200">{spinWord}</span>
                ) : (
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={spinWord}
                      className="absolute left-0 top-0 font-semibold text-rose-200"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.35, ease: "easeOut" }}
                    >
                      {spinWord}
                    </motion.span>
                  </AnimatePresence>
                )}
              </span>
              .
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href={heroData.primaryCta.href}
                className={`inline-flex items-center gap-2 rounded bg-gradient-to-r from-rose-500 to-blue-500 px-7 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 ${focusRing}`}
              >
                {heroData.primaryCta.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href={heroData.secondaryCta.href}
                className={`inline-flex items-center gap-2 rounded border border-white/40 bg-white/10 px-7 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 ${focusRing}`}
              >
                {heroData.secondaryCta.label}
              </Link>
            </div>

            <p className="mt-6 text-xs font-medium tracking-wide text-blue-100/80">
              {heroTrustLine}
            </p>

            <ul className="mt-5 grid gap-2 sm:grid-cols-2">
              {featureBullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-2 text-sm text-blue-50/90">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            className="lg:col-span-7 lg:text-right"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
          >
            <h1
              id="home-hero-heading"
              className="text-[clamp(2.2rem,5.5vw,4rem)] font-bold leading-tight tracking-tight text-white"
            >
              {heroData.title}
              <br />
              <span className="text-rose-400">{heroData.titleHighlight}</span>
            </h1>
          </motion.div>
        </div>
      </div>

      <div className="relative z-10 h-10 bg-blue-900">
        <svg
          className="absolute bottom-0 left-0 w-full text-white"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1440 40"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path d="M0,40 L1440,40 L1440,0 Q720,40 0,0 Z" fill="currentColor" />
        </svg>
      </div>
    </section>
  );
}
