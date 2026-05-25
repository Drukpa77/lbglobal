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
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-500">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="mt-2 text-[clamp(1.5rem,3.2vw,2.4rem)] font-bold tracking-tight text-blue-900">
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
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md">
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
      className="inline-flex items-center gap-2 rounded bg-gradient-to-r from-rose-500 to-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
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
      className="inline-flex items-center rounded border border-blue-900 px-6 py-3 text-sm font-semibold text-blue-900 transition hover:bg-blue-900 hover:text-white"
    >
      {label}
    </Link>
  );
}
