import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { NewsletterNav } from "@/components/newsletter-nav";
import { ZoomableImage } from "@/components/zoomable-image";
import {
  formatPostDate,
  getAllPosts,
  getPostBySlug,
  postDescription,
  postHref,
  postOgImage,
} from "@/lib/newsletter";

type Params = Promise<{ slug: string }>;

// Every article is known at build time; unknown slugs 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata(props: { params: Params }): Promise<Metadata> {
  const { slug } = await props.params;
  const post = getPostBySlug(slug);
  if (!post) {
    return { title: "Not Found | L&B Global" };
  }

  const title = post.metaTitle ?? `${post.title} | L&B Global`;
  const description = postDescription(post);
  const ogImage = postOgImage(post);
  const canonical = postHref(post);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      title,
      description,
      images: [ogImage],
      url: canonical,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function NewsletterDetailPage(props: { params: Params }) {
  const { slug } = await props.params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: postDescription(post),
    image: [postOgImage(post)],
    datePublished: post.publishDate,
    dateModified: post.updatedDate ?? post.publishDate,
    author: {
      "@type": "Organization",
      name: post.author,
    },
  };

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900">
      <NewsletterNav />

      <section className="home-fluid-tight px-4 py-8 sm:px-6 md:py-10 lg:py-14">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-8">
          <Link href="/newsletter" className="inline-flex text-sm font-semibold text-blue-600 hover:underline">
            ← Back to newsletter
          </Link>

          <h1 className="mt-3 text-3xl font-bold leading-tight md:text-5xl">{post.title}</h1>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
              {formatPostDate(post.publishDate)}
            </span>
            <span>By {post.author}</span>
          </div>

          {post.metaDescription && (
            <p className="mt-5 text-base leading-7 text-slate-600 md:text-lg">
              {post.metaDescription}
            </p>
          )}
        </div>

        {post.featuredImage && (
          <ZoomableImage
            src={post.featuredImage}
            alt={post.featuredImageAlt || post.title}
            previewClassName="group relative mt-6 block h-[300px] w-full overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 shadow-sm sm:h-[360px] md:h-[420px]"
          />
        )}

        <article
          className="prose prose-slate prose-headings:tracking-tight prose-a:text-blue-600 mt-8 max-w-none rounded-3xl border border-slate-200 bg-white p-6 leading-7 shadow-sm md:p-10"
          dangerouslySetInnerHTML={{ __html: post.contentHtml }}
        />
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
    </main>
  );
}
