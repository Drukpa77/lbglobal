import type { Metadata } from "next";

import { HomePage } from "@/components/home/home-page";
import type { HomePostItem } from "@/components/home/types";
import { prisma } from "@/lib/prisma";

const siteName = "L&B Global";
const siteDescription =
  "Premium overseas education and visa support from inquiry to enrollment.";
const siteUrl = "https://lbglobal.com";

// Rebuild the homepage at most once per hour; serve cached HTML instantly to all other visitors
export const revalidate = 3600;

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: `${siteName} | Overseas Education & Visa`,
  description: siteDescription,
  openGraph: {
    title: `${siteName} | Overseas Education & Visa`,
    description: siteDescription,
    type: "website",
    url: siteUrl,
    images: ["/loogo.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteName} | Overseas Education & Visa`,
    description: siteDescription,
    images: ["/loogo.png"],
  },
};

async function getHomePosts(): Promise<HomePostItem[]> {
  try {
    const posts = await prisma.homePost.findMany({
      where: {
        isPublished: true,
        publishDate: { not: null, lte: new Date() },
        slug: { not: null },
      },
      select: {
        id: true,
        title: true,
        slug: true,
        content: true,
        mediaType: true,
        mediaUrl: true,
        featuredThumbnail: true,
        featuredThumbnailAlt: true,
        publishDate: true,
        createdAt: true,
        authorNameSnapshot: true,
        authorEmailSnapshot: true,
        metaDescription: true,
      },
      orderBy: { publishDate: "desc" },
      take: 3,
    });

    return posts.map((post) => ({
      ...post,
      publishDate: post.publishDate?.toISOString() ?? null,
      createdAt: post.createdAt.toISOString(),
    }));
  } catch (error) {
    // Keep the homepage available during local setup if the DB is offline.
    console.error("Unable to load home posts from database.", error);
    return [];
  }
}

export default async function Home() {
  const posts = await getHomePosts();

  const webSiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteName,
    url: siteUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl}/newsletter?page={page}`,
      "query-input": "required name=page",
    },
  };

  return (
    <>
      <HomePage posts={posts} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteSchema) }}
      />
    </>
  );
}

