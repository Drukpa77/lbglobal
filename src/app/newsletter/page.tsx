import Link from "next/link";

import { NewsletterNav } from "@/components/newsletter-nav";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 12;

type SearchParams = Promise<{ page?: string }>;

export default async function NewsletterPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const pageNumber = Number(searchParams.page ?? "1");
  const page = Number.isFinite(pageNumber) && pageNumber > 0 ? Math.floor(pageNumber) : 1;
  const skip = (page - 1) * PAGE_SIZE;

  const [posts, total] = await Promise.all([
    prisma.homePost.findMany({
      where: {
        isPublished: true,
        publishDate: { not: null, lte: new Date() },
        slug: { not: null },
      },
      include: {
        author: { select: { name: true, email: true } },
        galleryMedia: { orderBy: { sortOrder: "asc" }, take: 1 },
      },
      orderBy: { publishDate: "desc" },
      skip,
      take: PAGE_SIZE,
    }),
    prisma.homePost.count({
      where: {
        isPublished: true,
        publishDate: { not: null, lte: new Date() },
        slug: { not: null },
      },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900">
      <NewsletterNav />

      <section className="home-fluid-shell px-4 py-8 sm:px-6 md:py-10">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <h1 className="text-3xl font-bold text-slate-900 md:text-4xl">Latest News & Insights</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
            Browse published updates, policy changes, and guidance from the Admin and Sub Admin teams.
          </p>
        </div>

        {posts.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
            No published posts available yet.
          </div>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {posts.map((post) => (
              <article
                key={post.id}
                className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="relative h-52 overflow-hidden border-b border-slate-100 bg-slate-50 sm:h-56">
                  {post.mediaType === "VIDEO" && post.mediaUrl ? (
                    <video
                      controls
                      className="h-full w-full object-cover"
                      preload="metadata"
                      src={post.mediaUrl}
                    />
                  ) : post.featuredThumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={post.featuredThumbnail}
                      alt={post.featuredThumbnailAlt ?? post.title}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                    />
                  ) : post.mediaType === "IMAGE" && post.mediaUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={post.mediaUrl}
                      alt={post.title}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center p-6 text-sm text-slate-500">
                      Text-only update
                    </div>
                  )}
                </div>

                <div className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">
                    {(post.publishDate ?? post.createdAt).toLocaleDateString()} ·{" "}
                    {post.authorNameSnapshot || post.author.name || post.author.email || "L&B Team"}
                  </p>

                  <h2 className="mt-2 line-clamp-2 text-xl font-bold leading-tight text-slate-900">
                    <Link href={`/newsletter/${post.slug ?? post.id}`} className="hover:underline">
                      {post.title}
                    </Link>
                  </h2>

                  <p className="mt-3 line-clamp-4 text-sm leading-6 text-slate-600">
                    {post.metaDescription ?? post.content.slice(0, 180)}
                  </p>

                  <Link
                    href={`/newsletter/${post.slug ?? post.id}`}
                    className="mt-4 inline-flex items-center text-sm font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    Read full article →
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            {page > 1 && (
              <Link href={`/newsletter?page=${page - 1}`} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                Previous
              </Link>
            )}
            <span className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">
              Page {page} of {totalPages}
            </span>
            {page < totalPages && (
              <Link href={`/newsletter?page=${page + 1}`} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                Next
              </Link>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
