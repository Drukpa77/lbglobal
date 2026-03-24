import Link from "next/link";
import type { ReactNode } from "react";

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="mx-auto max-w-3xl text-center">
      {eyebrow ? (
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="mt-2 text-[clamp(1.5rem,3.2vw,2.4rem)] font-bold tracking-tight text-slate-900">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-3 text-[clamp(0.95rem,1.4vw,1.05rem)] leading-7 text-slate-600">
          {subtitle}
        </p>
      ) : null}
    </header>
  );
}

export function SurfaceCard({ children }: { children: ReactNode }) {
  return (
    <article className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_10px_30px_rgba(15,23,42,0.07)] backdrop-blur-sm transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_36px_rgba(15,23,42,0.1)]">
      {children}
    </article>
  );
}

export function PrimaryButton({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-rose-500 to-blue-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(59,130,246,0.22)] transition hover:brightness-105"
    >
      {label}
      {icon}
    </Link>
  );
}

export function SecondaryButton({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
    >
      {label}
    </Link>
  );
}

