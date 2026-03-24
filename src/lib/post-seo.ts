import type { PrismaClient } from "@prisma/client";

const COMPANY_NAME = "L&B Global";
const DEFAULT_OG_IMAGE = "/loogo.png";

export function slugifyTitle(input: string) {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "post";
}

export async function ensureUniqueSlug(
  prisma: PrismaClient,
  desired: string,
  excludePostId?: string,
) {
  const base = slugifyTitle(desired);
  let candidate = base;
  let suffix = 2;

  while (true) {
    const existing = await prisma.homePost.findFirst({
      where: {
        slug: candidate,
        ...(excludePostId ? { id: { not: excludePostId } } : {}),
      },
      select: { id: true },
    });
    if (!existing) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

export function toPlainText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function generateMetaTitle(title: string, metaTitle?: string | null) {
  const normalized = (metaTitle ?? "").trim();
  if (normalized) return normalized;
  return `${title.trim()} | ${COMPANY_NAME}`;
}

export function generateMetaDescription(
  contentHtml: string,
  metaDescription?: string | null,
) {
  const normalized = (metaDescription ?? "").trim();
  if (normalized) return normalized;

  const plain = toPlainText(contentHtml);
  if (!plain) return "";

  if (plain.length <= 160) return plain;
  const clipped = plain.slice(0, 157).trimEnd();
  return `${clipped}...`;
}

export function resolveOgImage(options: {
  ogImage?: string | null;
  featuredThumbnail?: string | null;
  firstGalleryMediaUrl?: string | null;
}) {
  return (
    options.ogImage ||
    options.featuredThumbnail ||
    options.firstGalleryMediaUrl ||
    DEFAULT_OG_IMAGE
  );
}

export type SeoHealthInput = {
  title: string;
  contentHtml: string;
  focusKeyword?: string | null;
  metaDescription?: string | null;
  featuredThumbnailAlt?: string | null;
  galleryImagesAlt: Array<string | null | undefined>;
};

export function calculateSeoHealth(input: SeoHealthInput) {
  const warnings: string[] = [];
  let score = 100;

  const titleLength = input.title.trim().length;
  if (titleLength < 30 || titleLength > 60) {
    score -= 15;
    warnings.push("Title length is outside optimal SEO range (30-60 chars).");
  }

  if (!input.metaDescription?.trim()) {
    score -= 20;
    warnings.push("Meta description is missing.");
  }

  const keyword = input.focusKeyword?.trim().toLowerCase();
  if (keyword) {
    const body = toPlainText(input.contentHtml).toLowerCase();
    if (!body.includes(keyword)) {
      score -= 20;
      warnings.push("Focus keyword is not used in content.");
    }
  }

  const hasMissingFeaturedAlt = Boolean(
    input.featuredThumbnailAlt !== undefined &&
      input.featuredThumbnailAlt !== null &&
      input.featuredThumbnailAlt.trim().length === 0,
  );
  const hasMissingGalleryAlt = input.galleryImagesAlt.some(
    (alt) => !alt || alt.trim().length === 0,
  );

  if (hasMissingFeaturedAlt || hasMissingGalleryAlt) {
    score -= 20;
    warnings.push("One or more images are missing alt text.");
  }

  return {
    score: Math.max(0, score),
    warnings,
  };
}

