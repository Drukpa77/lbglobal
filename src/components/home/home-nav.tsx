"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
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
      <motion.header
        className={`sticky top-0 z-40 border-b transition ${
          scrolled
            ? "border-slate-200/80 bg-white/78 backdrop-blur-xl"
            : "border-transparent bg-white/45 backdrop-blur-md"
        }`}
        animate={{ paddingTop: scrolled ? 2 : 6, paddingBottom: scrolled ? 2 : 6 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="home-fluid-shell flex w-full items-center justify-between gap-4 px-2">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/loogo.png"
              alt="L&B Global logo"
              width={44}
              height={44}
              className="h-10 w-10 rounded-xl border border-slate-200 bg-white p-1 object-contain shadow-sm"
              priority
            />
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-blue-600">
                Overseas Education & Visa
              </p>
              <p className="text-lg font-bold tracking-tight text-slate-900">L&B Global</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 rounded-full border border-slate-200 bg-white/90 p-1 text-sm font-medium text-slate-600 shadow-[0_6px_14px_rgba(15,23,42,0.05)] lg:flex">
            {homeNavLinks.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-full px-3 py-1.5 transition hover:bg-slate-100 hover:text-slate-900"
              >
                {item.label}
              </a>
            ))}
            <Link
              href="/newsletter"
              className="rounded-full bg-slate-900 px-3 py-1.5 text-white transition hover:bg-slate-800"
            >
              Newsletter
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/apply"
              className="hidden rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 sm:inline-flex"
            >
              Apply Now
            </Link>
            <Link
              href="/login"
              className="hidden rounded-xl bg-gradient-to-r from-rose-500 to-blue-500 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:opacity-90 sm:inline-flex"
            >
              Sign in
            </Link>
            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white p-2 text-slate-700 shadow-sm hover:bg-slate-50 lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.header>

      <AnimatePresence>
        {isDrawerOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Close menu overlay"
              className="fixed inset-0 z-50 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setIsDrawerOpen(false)}
            />

            <motion.aside
              className="fixed right-0 top-0 z-[60] h-full w-[min(86vw,360px)] border-l border-slate-200 bg-white p-5 shadow-2xl"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-700">Menu</p>
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 p-1.5 text-slate-700 hover:bg-slate-50"
                  onClick={() => setIsDrawerOpen(false)}
                  aria-label="Close menu"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <nav className="mt-5 grid gap-1">
                {homeNavLinks.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsDrawerOpen(false)}
                    className="rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                  >
                    {item.label}
                  </a>
                ))}
                <Link
                  href="/newsletter"
                  className="rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-medium text-white"
                  onClick={() => setIsDrawerOpen(false)}
                >
                  Newsletter
                </Link>
                <Link
                  href="/apply"
                  className="rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                  onClick={() => setIsDrawerOpen(false)}
                >
                  Apply Now
                </Link>
                <Link
                  href="/login"
                  className="rounded-xl bg-gradient-to-r from-rose-500 to-blue-500 px-3 py-2.5 text-center text-sm font-semibold text-white"
                  onClick={() => setIsDrawerOpen(false)}
                >
                  Sign in
                </Link>
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

