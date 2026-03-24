import Image from "next/image";
import Link from "next/link";

export function FooterSection() {
  return (
    <footer className="relative overflow-hidden border-t border-rose-200/50 bg-gradient-to-br from-rose-900 via-rose-800 to-blue-900 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.08)_0%,transparent_50%)]" />
      <div className="home-fluid-shell relative w-full">
        <div className="flex flex-col items-center justify-between gap-8 sm:flex-row">
          <div className="flex items-center gap-3">
            <Image
              src="/loogo.png"
              alt="L&B Global"
              width={40}
              height={40}
              className="h-10 w-10 rounded-lg object-contain"
            />
            <div>
              <p className="font-bold text-white">L&B Global</p>
              <p className="text-xs text-rose-200/90">Overseas Education & Visa</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6">
            <Link href="/apply" className="text-sm text-white/90 transition hover:text-white">
              Apply
            </Link>
            <Link href="/newsletter" className="text-sm text-white/90 transition hover:text-white">
              Newsletter
            </Link>
            <a href="#contact" className="text-sm text-white/90 transition hover:text-white">
              Contact
            </a>
          </div>
          <Link
            href="/apply"
            className="rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-[#20bd5a]"
          >
            WhatsApp Us
          </Link>
        </div>
        <div className="mt-10 border-t border-white/10 pt-8 text-center">
          <p className="text-sm text-white/70">© {new Date().getFullYear()} L&B Global. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

