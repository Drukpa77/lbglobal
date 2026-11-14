import type { Metadata } from "next";

import { HomePage } from "@/components/home/home-page";
import { JsonLd } from "@/components/json-ld";
import { getAllPosts } from "@/lib/newsletter";

const siteName = "L&B Global";
const siteDescription =
  "Premium overseas education and visa support from inquiry to enrollment.";
const siteUrl = "https://lbglobal.com";

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

export default function Home() {
  const posts = getAllPosts().slice(0, 3);

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
      <JsonLd data={webSiteSchema} />
    </>
  );
}

