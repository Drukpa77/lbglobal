import Image from "next/image";
import Link from "next/link";

import { WHATSAPP_MOBILE_DISPLAY, WHATSAPP_URL } from "@/lib/contact";

const studentServices = [
  "Student Admission",
  "Visa Application",
  "Health Insurance",
  "PTE / IELTS Preparation",
  "Student Accommodation",
  "Skills Assessment",
];

const aboutLinks = [
  { label: "About Us", href: "#about" },
  { label: "How It Works", href: "#process" },
  { label: "Destinations", href: "#destinations" },
  { label: "Testimonials", href: "#testimonials" },
];

const quickLinks = [
  { label: "Book Assessment", href: "/apply" },
  { label: "Newsletter", href: "/newsletter" },
  { label: "Contact Us", href: "#contact" },
  { label: "Sign In", href: "/login" },
];

export function FooterSection() {
  return (
    <footer className="bg-blue-950 text-white">
      {/* Main footer grid */}
      <div className="home-fluid-shell w-full py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand column */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/loogo.png"
                alt="L&B Global"
                width={40}
                height={40}
                className="h-10 w-10 rounded-lg bg-white/10 p-1 object-contain"
              />
              <div>
                <p className="font-bold text-white">L&amp;B Global</p>
                <p className="text-xs text-blue-300">Overseas Education &amp; Visa</p>
              </div>
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-blue-200/80">
              Premium overseas education and visa support from inquiry to enrollment.
              Offices in Thimphu, Bhutan and Perth, Australia.
            </p>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-2 rounded bg-[#25D366] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#20bd5a]"
            >
              WhatsApp Us
            </a>
          </div>

          {/* Student Services */}
          <div>
            <h4 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-rose-400">
              Student Services
            </h4>
            <ul className="space-y-2.5">
              {studentServices.map((s) => (
                <li key={s}>
                  <Link
                    href="/apply"
                    className="text-sm text-blue-200/80 transition hover:text-white"
                  >
                    {s}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* About */}
          <div>
            <h4 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-rose-400">
              About
            </h4>
            <ul className="space-y-2.5">
              {aboutLinks.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    className="text-sm text-blue-200/80 transition hover:text-white"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-rose-400">
              Quick Links
            </h4>
            <ul className="space-y-2.5">
              {quickLinks.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="text-sm text-blue-200/80 transition hover:text-white"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>

            {/* Contact mini */}
            <div className="mt-6 space-y-1.5 border-t border-white/10 pt-5">
              <p className="text-xs text-blue-300">+975 7778 1399</p>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-xs text-blue-300 hover:text-white"
              >
                {WHATSAPP_MOBILE_DISPLAY} (WhatsApp)
              </a>
              <a
                href="mailto:student@lbglobal.com"
                className="block text-xs text-rose-400 hover:text-rose-300"
              >
                student@lbglobal.com
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/10">
        <div className="home-fluid-shell flex w-full flex-wrap items-center justify-between gap-3 py-5">
          <p className="text-xs text-blue-300/70">
            &copy; {new Date().getFullYear()} L&amp;B Global. All rights reserved.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link href="/apply" className="text-xs text-blue-300/70 transition hover:text-white">
              Privacy Policy
            </Link>
            <Link href="/apply" className="text-xs text-blue-300/70 transition hover:text-white">
              Terms of Use
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
