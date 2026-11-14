import { newsletterPosts } from "@/content/newsletter-posts";

export type NewsletterPost = {
  slug: string;
  title: string;
  /** YYYY-MM-DD */
  publishDate: string;
  /** YYYY-MM-DD; defaults to publishDate */
  updatedDate?: string;
  author: string;
  featuredImage?: string;
  featuredImageAlt?: string;
  metaTitle?: string;
  metaDescription?: string;
  contentHtml: string;
};

const DEFAULT_OG_IMAGE = "/loogo.png";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const sortedPosts = [...newsletterPosts].sort((a, b) =>
  b.publishDate.localeCompare(a.publishDate),
);

/** All articles, newest first. */
export function getAllPosts(): NewsletterPost[] {
  return sortedPosts;
}

export function getPostBySlug(slug: string): NewsletterPost | undefined {
  return sortedPosts.find((post) => post.slug === slug);
}

export function postHref(post: NewsletterPost) {
  return `/newsletter/${post.slug}`;
}

export function postOgImage(post: NewsletterPost) {
  return post.featuredImage || DEFAULT_OG_IMAGE;
}

export function postPlainText(post: NewsletterPost) {
  return post.contentHtml
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function postDescription(post: NewsletterPost) {
  return post.metaDescription?.trim() || postPlainText(post).slice(0, 160);
}

export function formatPostDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function postExcerpt(post: NewsletterPost, maxLength = 180) {
  const fromMeta = post.metaDescription?.trim();
  if (fromMeta) return fromMeta;
  const plain = postPlainText(post);
  if (plain.length <= maxLength) return plain;
  const sliced = plain.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(" ");
  return `${sliced.slice(0, lastSpace > 60 ? lastSpace : sliced.length)}…`;
}

export function postReadingTimeMinutes(post: NewsletterPost) {
  const words = postPlainText(post).split(" ").filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}
