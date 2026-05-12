"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Mail, Menu, Phone, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { homeNavLinks } from "@/components/home/content";

export function HomeNav() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      {/* ── Top utility bar ─────────────────────────────────── */}
      <div className="hidden bg-blue-950 py-2 sm:block">
        <div className="home-fluid-shell flex w-full items-center justify-between gap-4">
          <p className="text-xs text-blue-300/80">
            Premium overseas education &amp; visa support — Bhutan &amp; Australia
          </p>
          <div className="flex items-center gap-6">
            <a
              href="tel:+97577781399"
              className="flex items-center gap-1.5 text-xs text-blue-300/80 transition hover:text-white"
            >
              <Phone className="h-3 w-3" />
              +975 7778 1399
            </a>
            <a
              href="mailto:student@lbglobal.com"
              className="flex items-center gap-1.5 text-xs text-blue-300/80 transition hover:text-white"
            >
              <Mail className="h-3 w-3" />
              student@lbglobal.com
            </a>
          </div>
        </div>
      </div>

      {/* ── Main nav ────────────────────────────────────────── */}
      <motion.header
        className={`sticky top-0 z-40 border-b transition-all duration-300 ${
          scrolled
            ? "border-slate-200/80 bg-white/95 shadow-[0_4px_20px_rgba(0,0,0,0.07)] backdrop-blur-xl"
            : "border-transparent bg-white/90 backdrop-blur-md"
        }`}
        animate={{ paddingTop: scrolled ? 6 : 10, paddingBottom: scrolled ? 6 : 10 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="home-fluid-shell flex w-full items-center justify-between gap-6">

          {/* Brand */}
          <Link href="/" className="flex shrink-0 items-center gap-3">
            <div className="relative">
              <Image
                src="/loogo.png"
                alt="L&B Global logo"
                width={44}
                height={44}
                className="h-10 w-10 rounded-xl border border-slate-200 bg-white p-1 object-contain shadow-sm"
                priority
              />
              {/* Live dot */}
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-rose-500" />
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-rose-500">
                Overseas Education &amp; Visa
              </p>
              <p className="text-[1.05rem] font-extrabold tracking-tight text-blue-900">
                L&amp;B Global
              </p>
            </div>
          </Link>

          {/* Desktop pill nav */}
          <nav
            aria-label="Main navigation"
            className="hidden items-center gap-0.5 rounded-full border border-slate-200 bg-slate-50/80 px-1.5 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_2px_8px_rgba(0,0,0,0.05)] backdrop-blur-sm lg:flex"
          >
            {homeNavLinks.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-full px-3.5 py-1.5 text-[0.8125rem] font-medium text-slate-600 transition-all duration-200 hover:bg-white hover:text-blue-900 hover:shadow-sm"
              >
                {item.label}
              </a>
            ))}
            {/* Divider */}
            <span className="mx-1.5 h-4 w-px shrink-0 bg-slate-300/70" aria-hidden />
            <Link
              href="/newsletter"
              className="rounded-full bg-blue-900 px-3.5 py-1.5 text-[0.8125rem] font-semibold text-white transition-all duration-200 hover:bg-blue-800"
            >
              Newsletter
            </Link>
          </nav>

          {/* Right CTAs */}
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/login"
              className="hidden rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 sm:inline-flex"
            >
              Sign In
            </Link>
            <Link
              href="/apply"
              className="hidden items-center gap-1.5 rounded-full bg-gradient-to-r from-rose-500 to-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(244,63,94,0.35)] transition hover:brightness-110 hover:shadow-[0_6px_20px_rgba(244,63,94,0.4)] sm:inline-flex"
            >
              Book Assessment
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            {/* Mobile hamburger */}
            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-slate-600 shadow-sm transition hover:bg-slate-50 lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.header>

      {/* ── Mobile drawer ───────────────────────────────────── */}
      <AnimatePresence>
        {isDrawerOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Close menu overlay"
              className="fixed inset-0 z-50 bg-blue-950/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsDrawerOpen(false)}
            />

            <motion.aside
              className="fixed right-0 top-0 z-[60] flex h-full w-[min(88vw,380px)] flex-col border-l border-slate-200 bg-white shadow-2xl"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Drawer header */}
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <Link
                  href="/"
                  className="flex items-center gap-2.5"
                  onClick={() => setIsDrawerOpen(false)}
                >
                  <Image
                    src="/loogo.png"
                    alt="L&B Global"
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-lg border border-slate-200 object-contain p-0.5"
                  />
                  <span className="text-sm font-bold text-blue-900">L&amp;B Global</span>
                </Link>
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-50"
                  onClick={() => setIsDrawerOpen(false)}
                  aria-label="Close menu"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Drawer links */}
              <nav className="flex-1 overflow-y-auto px-4 py-4">
                <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  Navigation
                </p>
                <div className="grid gap-0.5">
                  {homeNavLinks.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsDrawerOpen(false)}
                      className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-blue-900"
                    >
                      {item.label}
                    </a>
                  ))}
                  <Link
                    href="/newsletter"
                    className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                    onClick={() => setIsDrawerOpen(false)}
                  >
                    Newsletter
                  </Link>
                </div>

                <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4">
                  <Link
                    href="/login"
                    className="rounded-lg border border-slate-300 px-4 py-2.5 text-center text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    onClick={() => setIsDrawerOpen(false)}
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/apply"
                    className="rounded-lg bg-gradient-to-r from-rose-500 to-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white shadow transition hover:brightness-105"
                    onClick={() => setIsDrawerOpen(false)}
                  >
                    Book Free Assessment
                  </Link>
                </div>
              </nav>

              {/* Drawer footer */}
              <div className="border-t border-slate-100 px-5 py-4">
                <a
                  href="tel:+97577781399"
                  className="flex items-center gap-2 text-xs text-slate-500 hover:text-blue-900"
                >
                  <Phone className="h-3.5 w-3.5 text-rose-500" />
                  +975 7778 1399
                </a>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
