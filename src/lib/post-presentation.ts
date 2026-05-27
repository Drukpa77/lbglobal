// Shared presentation helpers used by both the home "Latest Blogs" section
// and the /newsletter pages. Keeping these in one place ensures that home
// cards and newsletter cards always show the same author label, date, excerpt
// length, and reading-time estimate.

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export type PostLike = {
  title: string;
  content: string;
  metaDescription?: string | null;
  publishDate: Date | string | null;
  createdAt: Date | string;
  authorNameSnapshot?: string | null;
  authorEmailSnapshot?: string | null;
  author?: { name?: string | null; email?: string | null } | null;
};

export function formatPostDate(value: Date | string | null | undefined) {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function postAuthorLabel(post: PostLike) {
  return (
    post.authorNameSnapshot?.trim() ||
    post.author?.name?.trim() ||
    post.authorEmailSnapshot?.trim() ||
    post.author?.email?.trim() ||
    "L&B Team"
  );
}

export function postExcerpt(post: PostLike, maxLength = 180) {
  const fromMeta = post.metaDescription?.trim();
  if (fromMeta && fromMeta.length > 0) return fromMeta;
  const plain = (post.content ?? "").replace(/\s+/g, " ").trim();
  if (plain.length <= maxLength) return plain;
  const sliced = plain.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(" ");
  return `${sliced.slice(0, lastSpace > 60 ? lastSpace : sliced.length)}…`;
}

export function postReadingTimeMinutes(content: string) {
  const words = (content ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean).length;
  if (words === 0) return 1;
  return Math.max(1, Math.round(words / 220));
}

export function postPrimaryDate(post: PostLike) {
  return formatPostDate(post.publishDate ?? post.createdAt);
}
