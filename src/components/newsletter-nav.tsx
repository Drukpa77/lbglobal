import Image from "next/image";
import Link from "next/link";

export function NewsletterNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
      <div className="newsletter-header-inner home-fluid-shell flex w-full items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="newsletter-brand flex items-center gap-3">
          <Image
            src="/loogo.png"
            alt="L&B Global logo"
            width={44}
            height={44}
            className="h-11 w-11 rounded-md object-contain"
            priority
          />
          <div>
            <p className="newsletter-brand-kicker text-[11px] uppercase tracking-[0.22em] text-blue-600">
              L&B Global
            </p>
            <p className="newsletter-brand-title text-lg font-extrabold text-slate-900">
              Newsletter
            </p>
          </div>
        </Link>

        <nav className="newsletter-actions flex items-center gap-2">
          <Link
            href="/"
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Home
          </Link>
          <Link
            href="/newsletter"
            className="rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100"
          >
            Newsletter
          </Link>
          <Link
            href="/apply"
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Submit Inquiry
          </Link>
        </nav>
      </div>
    </header>
  );
}

