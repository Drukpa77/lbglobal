"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Menu, Phone, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { homeCta, homeNavLinks } from "@/components/home/content";

export function HomeNav() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  useEffect(() => {
    const sectionIds = homeNavLinks.map((link) => link.href.replace("#", ""));
    let frameId = 0;

    const updateNavState = () => {
      frameId = 0;
      const nextScrolled = window.scrollY > 24;
      const scrollMarker = window.scrollY + 120;
      let currentId = sectionIds[0] ?? null;

      for (const id of sectionIds) {
        const element = document.getElementById(id);
        if (element && element.offsetTop <= scrollMarker) {
          currentId = id;
        }
      }

      setScrolled((current) => (current === nextScrolled ? current : nextScrolled));
      setActiveSection((current) => (current === currentId ? current : currentId));
    };

    const requestUpdate = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(updateNavState);
    };

    updateNavState();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
    };
  }, []);

  const overHero = !scrolled;

  const navLinkClass = (href: string, onHero: boolean) => {
    const isActive = activeSection === href.replace("#", "");
    if (onHero) {
      return isActive
        ? "rounded-full bg-white/20 px-3.5 py-1.5 text-[0.8125rem] font-semibold text-white shadow-sm"
        : "rounded-full px-3.5 py-1.5 text-[0.8125rem] font-medium text-white/90 transition-all duration-300 hover:bg-white/15 hover:text-white";
    }
    return isActive
      ? "rounded-full bg-white px-3.5 py-1.5 text-[0.8125rem] font-semibold text-blue-900 shadow-sm transition-all duration-300"
      : "rounded-full px-3.5 py-1.5 text-[0.8125rem] font-medium text-slate-600 transition-all duration-300 hover:bg-white hover:text-blue-900 hover:shadow-sm";
  };

  return (
    <>
      {/* ── Main nav ────────────────────────────────────────── */}
      <motion.header
        className={`sticky top-0 z-40 transition-all duration-300 ${
          scrolled
            ? "border-b border-slate-200/80 bg-white/95 shadow-[0_4px_20px_rgba(0,0,0,0.07)] backdrop-blur-xl"
            : "border-b-0 bg-transparent shadow-none"
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
                className="h-10 w-10 rounded-xl border border-white/40 bg-white p-1 object-contain shadow-sm"
                priority
              />
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-rose-500" />
            </div>
            <div>
              <p
                className={`text-[9px] font-bold uppercase tracking-[0.22em] transition-colors duration-300 ${
                  overHero ? "text-rose-300" : "text-rose-500"
                }`}
              >
                Overseas Education &amp; Visa
              </p>
              <p
                className={`text-[1.05rem] font-extrabold tracking-tight transition-colors duration-300 ${
                  overHero ? "text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.35)]" : "text-blue-900"
                }`}
              >
                L&amp;B Global
              </p>
            </div>
          </Link>

          {/* Desktop pill nav */}
          <nav
            aria-label="Main navigation"
            className={`hidden items-center gap-0.5 rounded-full border px-1.5 py-1 backdrop-blur-md transition-all duration-300 lg:flex ${
              overHero
                ? "border-white/20 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_4px_18px_rgba(0,0,0,0.18)]"
                : "border-slate-200 bg-slate-50/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_2px_8px_rgba(0,0,0,0.05)]"
            }`}
          >
            {homeNavLinks.map((item) => (
              <a
                key={item.href}
                href={item.href}
                aria-current={
                  activeSection === item.href.replace("#", "") ? "location" : undefined
                }
                className={navLinkClass(item.href, overHero)}
              >
                {item.label}
              </a>
            ))}
            <span
              className={`mx-1.5 h-4 w-px shrink-0 transition-colors duration-300 ${
                overHero ? "bg-white/30" : "bg-slate-300/70"
              }`}
              aria-hidden
            />
            <Link
              href="/newsletter"
              className={`rounded-full px-3.5 py-1.5 text-[0.8125rem] font-semibold transition-all duration-200 ${
                overHero
                  ? "bg-white text-blue-900 hover:bg-blue-50"
                  : "bg-blue-900 text-white hover:bg-blue-800"
              }`}
            >
              Newsletter
            </Link>
          </nav>

          {/* Right CTAs */}
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/login"
              className={`hidden rounded-full border px-4 py-2 text-sm font-medium transition sm:inline-flex ${
                overHero
                  ? "border-white/40 text-white hover:border-white/70 hover:bg-white/10"
                  : "border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50"
              }`}
            >
              Sign In
            </Link>
            <Link
              href={homeCta.primary.href}
              className="hidden items-center gap-1.5 rounded-full bg-gradient-to-r from-rose-500 to-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(244,63,94,0.35)] transition hover:brightness-110 hover:shadow-[0_6px_20px_rgba(244,63,94,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 sm:inline-flex"
            >
              {homeCta.primary.label}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            {/* Mobile hamburger */}
            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              className={`inline-flex items-center justify-center rounded-xl border p-2 shadow-sm transition lg:hidden ${
                overHero
                  ? "border-white/30 bg-white/10 text-white hover:bg-white/20 backdrop-blur-md"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
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
                  {homeNavLinks.map((item) => {
                    const isActive = activeSection === item.href.replace("#", "");
                    return (
                      <a
                        key={item.href}
                        href={item.href}
                        onClick={() => setIsDrawerOpen(false)}
                        aria-current={isActive ? "location" : undefined}
                        className={`rounded-lg px-3 py-2.5 text-sm font-medium transition hover:bg-slate-100 hover:text-blue-900 ${
                          isActive
                            ? "bg-rose-50 font-semibold text-blue-900"
                            : "text-slate-700"
                        }`}
                      >
                        {item.label}
                      </a>
                    );
                  })}
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
                    href={homeCta.primary.href}
                    className="rounded-lg bg-gradient-to-r from-rose-500 to-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white shadow transition hover:brightness-105"
                    onClick={() => setIsDrawerOpen(false)}
                  >
                    {homeCta.primary.label}
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
