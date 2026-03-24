"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { SectionReveal } from "@/components/home/section-reveal";
import { SectionHeading } from "@/components/home/ui-primitives";
import type { HomePostItem } from "@/components/home/types";

export function UpdatesSection({ posts }: { posts: HomePostItem[] }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (posts.length <= 1 || isPaused) return;
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % posts.length);
    }, 9000);
    return () => clearInterval(timer);
  }, [posts.length, isPaused]);

  const active = posts.length > 0 ? posts[currentSlide % posts.length] : null;

  function goPrev() {
    setCurrentSlide((prev) => (prev - 1 + posts.length) % posts.length);
  }

  function goNext() {
    setCurrentSlide((prev) => (prev + 1) % posts.length);
  }

  return (
    <section id="updates" className="home-section-space border-y border-slate-200/90 bg-white">
      <div className="home-fluid-shell w-full">
        <SectionReveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHeading
              title="Featured Content & Insights"
              subtitle="Latest policy updates, opportunities, and application guidance from the L&B team."
            />
            <Link
              href="/newsletter"
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              View All Articles
            </Link>
          </div>
        </SectionReveal>

        {active ? (
          <SectionReveal delay={0.05}>
            <article
              className="mt-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_16px_34px_rgba(15,23,42,0.1)]"
              onMouseEnter={() => setIsPaused(true)}
              onMouseLeave={() => setIsPaused(false)}
            >
              <div className="grid gap-0 lg:grid-cols-2">
                <div className="relative aspect-[16/10] bg-slate-100 lg:aspect-auto">
                  {active.mediaType === "VIDEO" && active.mediaUrl ? (
                    <video controls className="h-full w-full object-cover" preload="metadata" src={active.mediaUrl} />
                  ) : active.featuredThumbnail ? (
                    <Image
                      src={active.featuredThumbnail}
                      alt={active.featuredThumbnailAlt ?? active.title}
                      fill
                      sizes="(max-width: 1024px) 100vw, 50vw"
                      className="object-cover"
                      priority
                    />
                  ) : active.mediaType === "IMAGE" && active.mediaUrl ? (
                    <Image
                      src={active.mediaUrl}
                      alt={active.title}
                      fill
                      sizes="(max-width: 1024px) 100vw, 50vw"
                      className="object-cover"
                      priority
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-400">Text-only update</div>
                  )}
                </div>
                <div className="flex flex-col justify-center p-6 md:p-8">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-600">
                    {(active.publishDate ?? active.createdAt).slice(0, 10)} · {active.authorNameSnapshot || active.authorEmailSnapshot || "L&B Team"}
                  </p>
                  <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{active.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    {active.metaDescription ?? active.content.slice(0, 220)}
                  </p>
                  <Link
                    href={`/newsletter/${active.slug ?? active.id}`}
                    className="mt-5 inline-flex text-sm font-semibold text-blue-600 hover:underline"
                  >
                    Read featured article →
                  </Link>
                </div>
              </div>

              {posts.length > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-white px-4 py-3">
                  <button
                    type="button"
                    onClick={goPrev}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                    aria-label="Previous featured article"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">Previous</span>
                  </button>

                  <div className="flex items-center gap-2">
                    {posts.map((post, idx) => (
                      <button
                        key={post.id}
                        type="button"
                        onClick={() => setCurrentSlide(idx)}
                        className={`h-2 rounded-full transition-all ${
                          idx === currentSlide
                            ? "w-6 bg-rose-500"
                            : "w-2 bg-slate-300 hover:bg-slate-400"
                        }`}
                        aria-label={`Go to featured article ${idx + 1}`}
                      />
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={goNext}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                    aria-label="Next featured article"
                  >
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </article>
          </SectionReveal>
        ) : (
          <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-10 text-center text-slate-500">
            No updates posted yet. Check back soon.
          </div>
        )}
      </div>
    </section>
  );
}

