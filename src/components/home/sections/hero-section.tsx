"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { heroData } from "@/components/home/content";

const SPIN_WORDS = ["confidence", "clarity", "speed", "expert support"];

export function HeroSection() {
  const [spinIndex, setSpinIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSpinIndex((current) => (current + 1) % SPIN_WORDS.length);
    }, 2200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section
      className="relative -mt-16 overflow-hidden bg-blue-900"
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

      <div className="home-fluid-shell relative z-10 w-full pt-36 pb-20 lg:pt-44 lg:pb-28">
        <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
          {/* Left: supporting copy + primary CTA */}
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
                <AnimatePresence mode="wait">
                  <motion.span
                    id="spin"
                    key={SPIN_WORDS[spinIndex]}
                    className="absolute left-0 top-0 font-semibold text-rose-300"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                  >
                    {SPIN_WORDS[spinIndex]}
                  </motion.span>
                </AnimatePresence>
              </span>
              .
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href={heroData.primaryCta.href}
                className="inline-flex items-center gap-2 rounded bg-gradient-to-r from-rose-500 to-blue-500 px-7 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-110"
              >
                {heroData.primaryCta.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </motion.div>

          {/* Right: main headline */}
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
