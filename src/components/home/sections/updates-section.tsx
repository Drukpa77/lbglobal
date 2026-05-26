import Link from "next/link";

import { PostCard, type PostCardData } from "@/components/blog/post-card";
import { SectionReveal } from "@/components/home/section-reveal";
import type { HomePostItem } from "@/components/home/types";

function toPostCardData(item: HomePostItem): PostCardData {
  return {
    id: item.id,
    title: item.title,
    slug: item.slug,
    content: item.content,
    metaDescription: item.metaDescription,
    publishDate: item.publishDate,
    createdAt: item.createdAt,
    authorNameSnapshot: item.authorNameSnapshot,
    authorEmailSnapshot: item.authorEmailSnapshot,
    mediaType: item.mediaType,
    mediaUrl: item.mediaUrl,
    featuredThumbnail: item.featuredThumbnail,
    featuredThumbnailAlt: item.featuredThumbnailAlt,
  };
}

export function UpdatesSection({ posts }: { posts: HomePostItem[] }) {
  const display = posts.slice(0, 3).map(toPostCardData);
  const hasPosts = display.length > 0;

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
              <p className="mt-2 max-w-2xl text-sm text-slate-600 md:text-base">
                Visa updates, course guides, and student stories — written by our team and updated as we publish on the newsletter.
              </p>
            </div>
            <Link
              href="/newsletter"
              className="inline-flex items-center gap-2 rounded-full border border-blue-900 px-5 py-2 text-sm font-semibold text-blue-900 transition hover:bg-blue-900 hover:text-white"
            >
              View all articles
              <span aria-hidden>→</span>
            </Link>
          </div>
        </SectionReveal>

        {hasPosts ? (
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {display.map((post, i) => (
              <SectionReveal key={post.id} delay={i * 0.07}>
                <PostCard post={post} />
              </SectionReveal>
            ))}
          </div>
        ) : (
          <SectionReveal>
            <div className="mt-10 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-10 text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-rose-500">
                Coming soon
              </p>
              <h3 className="mt-2 text-xl font-bold text-blue-900">
                Our editorial team is preparing the first set of articles.
              </h3>
              <p className="mx-auto mt-3 max-w-xl text-sm text-slate-600">
                Subscribe to our newsletter to be notified when we publish visa updates, course guides, and student stories.
              </p>
              <Link
                href="/newsletter"
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-blue-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800"
              >
                Visit the newsletter
                <span aria-hidden>→</span>
              </Link>
            </div>
          </SectionReveal>
        )}
      </div>
    </section>
  );
}
