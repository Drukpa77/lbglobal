import Link from "next/link";

import { PostCard, type PostCardData } from "@/components/blog/post-card";
import { NewsletterNav } from "@/components/newsletter-nav";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 9;

type SearchParams = Promise<{ page?: string }>;

export const revalidate = 600;

export default async function NewsletterPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const pageNumber = Number(searchParams.page ?? "1");
  const page = Number.isFinite(pageNumber) && pageNumber > 0 ? Math.floor(pageNumber) : 1;
  const isFirstPage = page === 1;
  const featuredCount = isFirstPage ? 1 : 0;
  const skip = (page - 1) * PAGE_SIZE + featuredCount;
  const take = PAGE_SIZE - featuredCount;

  const where = {
    isPublished: true,
    publishDate: { not: null, lte: new Date() },
    slug: { not: null },
  } as const;

  const [featuredPost, posts, total, recent] = await Promise.all([
    isFirstPage
      ? prisma.homePost.findFirst({
          where,
          include: {
            author: { select: { name: true, email: true } },
            galleryMedia: { orderBy: { sortOrder: "asc" }, take: 1 },
          },
          orderBy: { publishDate: "desc" },
        })
      : Promise.resolve(null),
    prisma.homePost.findMany({
      where,
      include: {
        author: { select: { name: true, email: true } },
        galleryMedia: { orderBy: { sortOrder: "asc" }, take: 1 },
      },
      orderBy: { publishDate: "desc" },
      skip,
      take,
    }),
    prisma.homePost.count({ where }),
    prisma.homePost.findMany({
      where,
      include: { author: { select: { name: true, email: true } } },
      orderBy: { publishDate: "desc" },
      take: 5,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const adjustedPage = Math.min(page, totalPages);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 text-slate-900">
      <NewsletterNav />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-slate-200 bg-white">
        <div className="absolute inset-0 -z-10">
          <div className="absolute -top-32 left-1/3 h-72 w-72 rounded-full bg-rose-200/40 blur-3xl" />
          <div className="absolute -bottom-32 right-1/4 h-72 w-72 rounded-full bg-blue-200/40 blur-3xl" />
        </div>
        <div className="home-fluid-shell flex flex-col items-start gap-6 px-4 py-12 sm:px-6 md:py-16">
          <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-600">
            L&amp;B Global Newsletter
          </span>
          <h1 className="text-[clamp(2rem,4.5vw,3.4rem)] font-extrabold tracking-tight text-slate-900">
            Visa updates, course guides &amp; student stories
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-slate-600 md:text-lg">
            Hand-picked insights from our advisors and case managers — written for students preparing
            to study in Australia. New articles published as soon as our team approves them.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="#latest"
              className="inline-flex items-center gap-2 rounded-full bg-blue-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800"
            >
              Browse articles
            </a>
            <Link
              href="/apply"
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Book a free consultation
            </Link>
          </div>
        </div>
      </section>

      {/* ── Featured + recent rail ───────────────────────────── */}
      {featuredPost ? (
        <section className="home-fluid-shell px-4 py-10 sm:px-6 md:py-14">
          <div className="grid gap-6 lg:grid-cols-[2.2fr_1fr]">
            <PostCard post={toPostCardData(featuredPost)} variant="featured" />
            <aside className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-500">Most recent</p>
              {recent.map((post) => (
                <PostCard key={post.id} post={toPostCardData(post)} variant="compact" />
              ))}
              {recent.length === 0 ? (
                <p className="text-sm text-slate-500">No other posts yet.</p>
              ) : null}
            </aside>
          </div>
        </section>
      ) : null}

      {/* ── All articles grid ────────────────────────────────── */}
      <section id="latest" className="home-fluid-shell px-4 pb-16 pt-2 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3 border-t border-slate-200 pt-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-500">All articles</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
              Latest updates from L&amp;B Global
            </h2>
          </div>
          <p className="text-sm text-slate-500">
            Showing {posts.length + (featuredPost ? 1 : 0)} of {total}
          </p>
        </div>

        {posts.length === 0 && !featuredPost ? (
          <EmptyState />
        ) : posts.length === 0 ? (
          <p className="mt-8 text-sm text-slate-500">No more articles for this page.</p>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <PostCard key={post.id} post={toPostCardData(post)} />
            ))}
          </div>
        )}

        {totalPages > 1 ? (
          <Pagination page={adjustedPage} totalPages={totalPages} />
        ) : null}

        <Subscribe />
      </section>
    </main>
  );
}

function toPostCardData(post: {
  id: string;
  title: string;
  slug: string | null;
  content: string;
  metaDescription: string | null;
  publishDate: Date | null;
  createdAt: Date;
  authorNameSnapshot: string;
  authorEmailSnapshot: string;
  author: { name: string | null; email: string | null } | null;
  mediaType: "NONE" | "IMAGE" | "VIDEO";
  mediaUrl: string | null;
  featuredThumbnail: string | null;
  featuredThumbnailAlt: string | null;
}): PostCardData {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    content: post.content,
    metaDescription: post.metaDescription,
    publishDate: post.publishDate,
    createdAt: post.createdAt,
    authorNameSnapshot: post.authorNameSnapshot,
    authorEmailSnapshot: post.authorEmailSnapshot,
    author: post.author ?? undefined,
    mediaType: post.mediaType,
    mediaUrl: post.mediaUrl,
    featuredThumbnail: post.featuredThumbnail,
    featuredThumbnailAlt: post.featuredThumbnailAlt,
  };
}

function EmptyState() {
  return (
    <div className="mt-10 rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-blue-600 text-2xl">
        ✍️
      </span>
      <h3 className="mt-4 text-xl font-bold text-slate-900">No published articles yet</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
        Our editors are preparing the first set of guides. Check back soon, or reach out for personalised
        guidance in the meantime.
      </p>
      <Link
        href="/apply"
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-blue-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800"
      >
        Talk to our team
      </Link>
    </div>
  );
}

function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  const pages = buildPageList(page, totalPages);
  return (
    <nav
      aria-label="Newsletter pagination"
      className="mt-12 flex flex-wrap items-center justify-center gap-2"
    >
      {page > 1 ? (
        <Link
          href={`/newsletter?page=${page - 1}`}
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          ← Previous
        </Link>
      ) : null}
      {pages.map((entry, i) =>
        entry === "ellipsis" ? (
          <span key={`e${i}`} className="px-2 text-sm text-slate-400">
            …
          </span>
        ) : (
          <Link
            key={entry}
            href={`/newsletter?page=${entry}`}
            aria-current={entry === page ? "page" : undefined}
            className={`min-w-[40px] rounded-full px-3 py-1.5 text-center text-sm font-semibold transition ${
              entry === page
                ? "bg-blue-900 text-white"
                : "border border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {entry}
          </Link>
        ),
      )}
      {page < totalPages ? (
        <Link
          href={`/newsletter?page=${page + 1}`}
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Next →
        </Link>
      ) : null}
    </nav>
  );
}

function buildPageList(current: number, total: number): Array<number | "ellipsis"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: Array<number | "ellipsis"> = [1];
  if (current > 3) pages.push("ellipsis");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p += 1) {
    pages.push(p);
  }
  if (current < total - 2) pages.push("ellipsis");
  pages.push(total);
  return pages;
}

function Subscribe() {
  return (
    <section className="mt-16 overflow-hidden rounded-3xl bg-gradient-to-br from-blue-900 via-blue-800 to-rose-700 px-6 py-10 text-white shadow-xl md:px-12">
      <div className="grid gap-6 md:grid-cols-[2fr_1fr] md:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-200">Stay in the loop</p>
          <h3 className="mt-2 text-2xl font-bold md:text-3xl">
            One email a month. Visa updates, intake reminders, and student wins.
          </h3>
          <p className="mt-2 max-w-xl text-sm text-blue-100/90 md:text-base">
            No spam, ever. Unsubscribe anytime.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Link
            href="/apply"
            className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-blue-900 transition hover:bg-blue-50"
          >
            Get personalised guidance
          </Link>
          <a
            href="mailto:student@lbglobal.com?subject=Subscribe%20to%20newsletter"
            className="inline-flex items-center justify-center rounded-full border border-white/30 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Subscribe via email
          </a>
        </div>
      </div>
    </section>
  );
}
