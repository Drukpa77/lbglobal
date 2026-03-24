import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { NewsletterNav } from "@/components/newsletter-nav";
import { ZoomableImage } from "@/components/zoomable-image";
import { prisma } from "@/lib/prisma";
import { resolveOgImage } from "@/lib/post-seo";

type Params = Promise<{ slug: string }>;

async function getPublishedPost(slug: string) {
  return prisma.homePost.findFirst({
    where: {
      slug,
      isPublished: true,
      publishDate: { not: null, lte: new Date() },
    },
    include: {
      galleryMedia: { orderBy: { sortOrder: "asc" } },
      author: { select: { name: true, email: true } },
    },
  });
}

export async function generateMetadata(props: { params: Params }): Promise<Metadata> {
  const { slug } = await props.params;
  const post = await getPublishedPost(slug);
  if (!post) {
    return { title: "Not Found | L&B Global" };
  }

  const ogImage = resolveOgImage({
    ogImage: post.ogImage,
    featuredThumbnail: post.featuredThumbnail,
    firstGalleryMediaUrl: post.galleryMedia[0]?.url,
  });
  const canonical = `/newsletter/${post.slug ?? slug}`;

  return {
    title: post.metaTitle ?? `${post.title} | L&B Global`,
    description: post.metaDescription ?? post.content.slice(0, 160),
    alternates: { canonical },
    openGraph: {
      type: "article",
      title: post.metaTitle ?? `${post.title} | L&B Global`,
      description: post.metaDescription ?? post.content.slice(0, 160),
      images: [ogImage],
      url: canonical,
    },
    twitter: {
      card: "summary_large_image",
      title: post.metaTitle ?? `${post.title} | L&B Global`,
      description: post.metaDescription ?? post.content.slice(0, 160),
      images: [ogImage],
    },
  };
}

export default async function NewsletterDetailPage(props: { params: Params }) {
  const { slug } = await props.params;
  const post = await getPublishedPost(slug);
  if (!post) notFound();

  const ogImage = resolveOgImage({
    ogImage: post.ogImage,
    featuredThumbnail: post.featuredThumbnail,
    firstGalleryMediaUrl: post.galleryMedia[0]?.url,
  });

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.metaDescription ?? post.content.slice(0, 160),
    image: [ogImage],
    datePublished: (post.publishDate ?? post.createdAt).toISOString(),
    dateModified: post.updatedAt.toISOString(),
    author: {
      "@type": "Person",
      name:
        post.authorNameSnapshot ||
        post.author.name ||
        post.author.email ||
        "L&B Global Team",
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
              {(post.publishDate ?? post.createdAt).toLocaleDateString()}
            </span>
            <span>By {post.authorNameSnapshot || post.author.name || post.author.email || "L&B Global Team"}</span>
          </div>

          {post.metaDescription && (
            <p className="mt-5 text-base leading-7 text-slate-600 md:text-lg">
              {post.metaDescription}
            </p>
          )}
        </div>

        {post.featuredThumbnail && (
          <ZoomableImage
            src={post.featuredThumbnail}
            alt={post.featuredThumbnailAlt || post.title}
            previewClassName="group relative mt-6 block h-[300px] w-full overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 shadow-sm sm:h-[360px] md:h-[420px]"
          />
        )}

        <article
          className="prose prose-slate prose-headings:tracking-tight prose-a:text-blue-600 mt-8 max-w-none rounded-3xl border border-slate-200 bg-white p-6 leading-7 shadow-sm md:p-10"
          dangerouslySetInnerHTML={{ __html: post.contentHtml || `<p>${post.content}</p>` }}
        />

        {post.galleryMedia.length > 0 && (
          <section className="mt-10 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-8">
            <h2 className="text-xl font-semibold text-slate-900">Media Gallery</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {post.galleryMedia.map((item) => (
                <div key={item.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                  {item.mediaType === "VIDEO" ? (
                    <video controls src={item.url} className="h-64 w-full object-cover md:h-72" />
                  ) : (
                    <ZoomableImage
                      src={item.url}
                      alt={item.altText ?? post.title}
                      previewClassName="group relative block h-64 w-full overflow-hidden bg-slate-100 md:h-72"
                      showHint={false}
                    />
                  )}                  
                </div>
              ))}
            </div>
          </section>
        )}
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
    </main>
  );
}

