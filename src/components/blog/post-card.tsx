import Link from "next/link";

import {
  formatPostDate,
  postAuthorLabel,
  postExcerpt,
  postPrimaryDate,
  postReadingTimeMinutes,
  type PostLike,
} from "@/lib/post-presentation";

export type PostCardData = PostLike & {
  id: string;
  slug: string | null;
  mediaType?: "NONE" | "IMAGE" | "VIDEO" | null;
  mediaUrl?: string | null;
  featuredThumbnail?: string | null;
  featuredThumbnailAlt?: string | null;
};

export type PostCardVariant = "featured" | "regular" | "compact";

function postHref(post: PostCardData) {
  return `/newsletter/${post.slug ?? post.id}`;
}

function postImage(post: PostCardData) {
  if (post.featuredThumbnail) return { src: post.featuredThumbnail, alt: post.featuredThumbnailAlt ?? post.title };
  if (post.mediaType === "IMAGE" && post.mediaUrl) return { src: post.mediaUrl, alt: post.title };
  return null;
}

export function PostCard({ post, variant = "regular" }: { post: PostCardData; variant?: PostCardVariant }) {
  if (variant === "featured") return <FeaturedCard post={post} />;
  if (variant === "compact") return <CompactCard post={post} />;
  return <RegularCard post={post} />;
}

function FeaturedCard({ post }: { post: PostCardData }) {
  const image = postImage(post);
  const href = postHref(post);
  const author = postAuthorLabel(post);
  const date = postPrimaryDate(post);
  const reading = postReadingTimeMinutes(post.content);
  const excerpt = postExcerpt(post, 260);

  return (
    <article className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:shadow-lg">
      <div className="grid md:grid-cols-[1.15fr_1fr]">
        <Link href={href} className="relative block aspect-[16/10] bg-slate-100 md:aspect-auto">
          {post.mediaType === "VIDEO" && post.mediaUrl ? (
            <video
              src={post.mediaUrl}
              className="h-full w-full object-cover"
              muted
              playsInline
              preload="metadata"
            />
          ) : image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.src}
              alt={image.alt}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
            />
          ) : (
            <PlaceholderArt />
          )}
          <span className="absolute left-4 top-4 rounded-full bg-rose-500 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white shadow">
            Featured
          </span>
        </Link>
        <div className="flex flex-col justify-center p-7 md:p-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-500">
            {date} · {reading} min read
          </p>
          <Link href={href} className="mt-3 block">
            <h2 className="text-2xl font-bold leading-tight tracking-tight text-blue-900 transition group-hover:text-rose-500 md:text-3xl">
              {post.title}
            </h2>
          </Link>
          <p className="mt-4 text-base leading-relaxed text-slate-600 line-clamp-4">{excerpt}</p>
          <AuthorRow author={author} />
          <Link
            href={href}
            className="mt-6 inline-flex w-fit items-center gap-2 rounded-full bg-blue-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800"
          >
            Read article
            <ArrowIcon />
          </Link>
        </div>
      </div>
    </article>
  );
}

function RegularCard({ post }: { post: PostCardData }) {
  const image = postImage(post);
  const href = postHref(post);
  const author = postAuthorLabel(post);
  const date = postPrimaryDate(post);
  const reading = postReadingTimeMinutes(post.content);
  const excerpt = postExcerpt(post, 170);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <Link href={href} className="relative block aspect-[16/10] bg-slate-100">
        {post.mediaType === "VIDEO" && post.mediaUrl ? (
          <video src={post.mediaUrl} className="h-full w-full object-cover" muted playsInline preload="metadata" />
        ) : image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.src}
            alt={image.alt}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <PlaceholderArt />
        )}
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-500">
          {date} · {reading} min read
        </p>
        <Link href={href} className="mt-2 block">
          <h3 className="text-lg font-bold leading-snug text-blue-900 transition group-hover:text-rose-500 line-clamp-2">
            {post.title}
          </h3>
        </Link>
        <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-600 line-clamp-3">{excerpt}</p>
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <span className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <Avatar name={author} />
            {author}
          </span>
          <Link
            href={href}
            className="text-sm font-semibold text-rose-500 transition hover:text-rose-600"
          >
            Read →
          </Link>
        </div>
      </div>
    </article>
  );
}

function CompactCard({ post }: { post: PostCardData }) {
  const image = postImage(post);
  const href = postHref(post);
  const date = formatPostDate(post.publishDate ?? post.createdAt);

  return (
    <Link
      href={href}
      className="group flex gap-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md"
    >
      <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-slate-100">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.src} alt={image.alt} className="h-full w-full object-cover" />
        ) : (
          <PlaceholderArt />
        )}
      </div>
      <div className="flex min-w-0 flex-col">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-500">{date}</p>
        <p className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-blue-900 transition group-hover:text-rose-500">
          {post.title}
        </p>
      </div>
    </Link>
  );
}

function AuthorRow({ author }: { author: string }) {
  return (
    <div className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-4">
      <Avatar name={author} />
      <div>
        <p className="text-sm font-semibold text-slate-900">{author}</p>
        <p className="text-xs text-slate-500">L&B Global Editorial</p>
      </div>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "L";
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-blue-600 text-[11px] font-bold text-white">
      {initials}
    </span>
  );
}

function PlaceholderArt() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-50 via-white to-rose-50">
      <span className="text-3xl">📰</span>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M5 12h14" />
      <path d="M13 5l7 7-7 7" />
    </svg>
  );
}
