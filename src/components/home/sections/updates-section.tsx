"use client";

import Image from "next/image";
import Link from "next/link";

import { SectionReveal } from "@/components/home/section-reveal";
import type { HomePostItem } from "@/components/home/types";

const PLACEHOLDER_POSTS = [
  {
    id: "1",
    title: "Best Intakes to Study in Australia: 2026 Guide",
    metaDescription:
      "Understand which intake period suits your profile and how to prepare a strong application for Australian universities.",
    publishDate: "2026-03-15",
    authorNameSnapshot: "L&B Team",
    slug: null,
  },
  {
    id: "2",
    title: "Student Visa (Subclass 500): Requirements & Timeline",
    metaDescription:
      "A complete breakdown of the Australian student visa process, documentation checklist, and processing timelines.",
    publishDate: "2026-02-20",
    authorNameSnapshot: "L&B Team",
    slug: null,
  },
  {
    id: "3",
    title: "How to Choose the Right Course for Your Career Goals",
    metaDescription:
      "Matching your academic background, budget, and career ambitions to the right course and institution is the first step.",
    publishDate: "2026-01-10",
    authorNameSnapshot: "L&B Team",
    slug: null,
  },
] as const;

function BlogCard({
  title,
  description,
  date,
  author,
  href,
  thumbnail,
  thumbnailAlt,
  index,
}: {
  title: string;
  description: string;
  date: string;
  author: string;
  href: string;
  thumbnail?: string | null;
  thumbnailAlt?: string | null;
  index: number;
}) {
  return (
    <SectionReveal delay={index * 0.07}>
      <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
        {/* Thumbnail */}
          <div className="relative h-48 w-full overflow-hidden bg-blue-900/10">
          {thumbnail ? (
            <Image
              src={thumbnail}
              alt={thumbnailAlt ?? title}
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              className="object-cover transition group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="text-4xl">📰</span>
            </div>
          )}
        </div>
        {/* Content */}
        <div className="flex flex-1 flex-col p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-rose-500">
            {date.slice(0, 10)} &middot; {author}
          </p>
          <h3 className="text-base font-bold leading-snug text-blue-900 transition group-hover:text-rose-500">
            {title}
          </h3>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600 line-clamp-3">
            {description}
          </p>
          <Link
            href={href}
            className="mt-4 text-sm font-semibold text-rose-500 transition hover:text-rose-600"
          >
            Read More →
          </Link>
        </div>
      </article>
    </SectionReveal>
  );
}

export function UpdatesSection({ posts }: { posts: HomePostItem[] }) {
  const displayPosts = posts.length > 0 ? posts.slice(0, 3) : null;

  return (
    <section id="updates" className="home-section-space bg-white">
      <div className="home-fluid-shell w-full">
        <SectionReveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-500">
                News &amp; Insights
              </p>
              <h2 className="mt-2 text-[clamp(1.6rem,3.2vw,2.4rem)] font-bold tracking-tight text-blue-900">
                Latest Blogs
              </h2>
            </div>
            <Link
              href="/newsletter"
              className="rounded border border-blue-900 px-5 py-2 text-sm font-semibold text-blue-900 transition hover:bg-blue-900 hover:text-white"
            >
              View All Articles
            </Link>
          </div>
        </SectionReveal>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {displayPosts
            ? displayPosts.map((post, i) => (
                <BlogCard
                  key={post.id}
                  title={post.title}
                  description={
                    post.metaDescription ?? post.content.slice(0, 160)
                  }
                  date={post.publishDate ?? post.createdAt}
                  author={post.authorNameSnapshot || post.authorEmailSnapshot || "L&B Team"}
                  href={`/newsletter/${post.slug ?? post.id}`}
                  thumbnail={post.featuredThumbnail ?? post.mediaUrl}
                  thumbnailAlt={post.featuredThumbnailAlt}
                  index={i}
                />
              ))
            : PLACEHOLDER_POSTS.map((post, i) => (
                <BlogCard
                  key={post.id}
                  title={post.title}
                  description={post.metaDescription}
                  date={post.publishDate}
                  author={post.authorNameSnapshot}
                  href="/newsletter"
                  index={i}
                />
              ))}
        </div>
      </div>
    </section>
  );
}
