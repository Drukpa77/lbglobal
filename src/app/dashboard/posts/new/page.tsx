import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PostRichEditor } from "@/components/post-rich-editor";
import { savePostMedia } from "@/lib/post-media";
import { prisma } from "@/lib/prisma";
import {
  calculateSeoHealth,
  ensureUniqueSlug,
  generateMetaDescription,
  generateMetaTitle,
  slugifyTitle,
} from "@/lib/post-seo";

export default async function NewPostPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN") {
    redirect("/dashboard");
  }

  const recentPosts = await prisma.homePost.findMany({
    where: { authorId: session.user.id },
    include: { galleryMedia: { where: { mediaType: "IMAGE" } } },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Create Home Page Post</h1>
          <p className="mt-1 text-sm text-gray-600">Share updates for the home page and newsletter.</p>
        </div>
        <Link href="/dashboard" className="rounded-md border px-3 py-2 text-sm">
          Back to dashboard
        </Link>
      </div>

      <form action={createPostAction} className="space-y-4 rounded-lg border bg-white p-5">
        <label className="block text-sm">
          Title
          <input name="title" type="text" required minLength={3} maxLength={140} className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900" />
        </label>

        <label className="block text-sm">
          Custom slug (optional)
          <input
            name="slug"
            placeholder="auto-from-title"
            className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900"
          />
        </label>

        <PostRichEditor initialHtml="<p></p>" />

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            Featured thumbnail (hero image)
            <input
              name="featuredThumbnailFile"
              type="file"
              accept="image/*"
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900 file:mr-3 file:rounded-md file:border file:border-gray-300 file:bg-gray-50 file:px-3 file:py-1.5 file:text-xs file:font-medium"
            />
          </label>
          <label className="block text-sm">
            Featured thumbnail URL (optional fallback)
            <input
              name="featuredThumbnailUrl"
              type="url"
              placeholder="https://..."
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900"
            />
          </label>
        </div>

        <label className="block text-sm">
          Featured image alt text
          <input
            name="featuredThumbnailAlt"
            placeholder="Describe the featured image for SEO/accessibility"
            className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            Gallery uploads (images/videos)
            <input name="galleryFiles" type="file" accept="image/*,video/*" multiple className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900 file:mr-3 file:rounded-md file:border file:border-gray-300 file:bg-gray-50 file:px-3 file:py-1.5 file:text-xs file:font-medium" />
          </label>
          <label className="block text-sm">
            Gallery media URLs (one URL per line)
            <textarea name="galleryUrls" placeholder="https://...&#10;https://..." className="mt-1 min-h-24 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900" />
          </label>
        </div>

        <label className="block text-sm">
          Gallery image alt text (one line per gallery item in same order)
          <textarea
            name="galleryAltText"
            placeholder="First image alt text&#10;Second image alt text"
            className="mt-1 min-h-20 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            Meta title (optional)
            <input name="metaTitle" className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900" />
          </label>
          <label className="block text-sm">
            Focus keyword (optional)
            <input name="focusKeyword" className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900" />
          </label>
          <label className="block text-sm md:col-span-2">
            Meta description (optional)
            <textarea name="metaDescription" className="mt-1 min-h-20 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900" />
          </label>
          <label className="block text-sm">
            Meta keywords (optional)
            <input name="metaKeywords" placeholder="study abroad, visa, australia" className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900" />
          </label>
          <label className="block text-sm">
            Open Graph image URL override (optional)
            <input name="ogImage" type="url" className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900" />
          </label>
        </div>

        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" name="isPublished" />
          Publish immediately
        </label>
        <button type="submit" className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white">
          Create post
        </button>
      </form>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="text-sm font-semibold">Your Recent Posts</h2>
        {recentPosts.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">No posts yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {recentPosts.map((post) => (
              <li key={post.id} className="rounded-md border border-gray-200 p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{post.title}</p>
                  <span className="text-xs text-gray-600">{post.isPublished ? "Published" : "Draft"}</span>
                </div>
                <p className="text-xs text-gray-600">Slug: {post.slug ? `/newsletter/${post.slug}` : "Not set yet"}</p>
                <p className="text-xs text-gray-600">{post.createdAt.toLocaleDateString()}</p>
                {(() => {
                  const health = calculateSeoHealth({
                    title: post.title,
                    contentHtml: post.contentHtml || `<p>${post.content}</p>`,
                    focusKeyword: post.focusKeyword,
                    metaDescription: post.metaDescription,
                    featuredThumbnailAlt: post.featuredThumbnailAlt,
                    galleryImagesAlt: post.galleryMedia.map((m) => m.altText),
                  });
                  return (
                    <p className="text-xs text-gray-600">
                      SEO health: {health.score}/100
                    </p>
                  );
                })()}
                <div className="mt-2">
                  <Link href={`/dashboard/posts/${post.id}/edit`} className="text-xs font-medium text-blue-600 underline">
                    Edit / Delete
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

async function createPostAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN") redirect("/dashboard");

  const title = String(formData.get("title") ?? "").trim();
  const requestedSlug = String(formData.get("slug") ?? "").trim();
  const contentHtml = String(formData.get("contentHtml") ?? "").trim();
  const featuredThumbnailUrlInput = String(formData.get("featuredThumbnailUrl") ?? "").trim();
  const featuredThumbnailAlt = String(formData.get("featuredThumbnailAlt") ?? "").trim();
  const featuredThumbnailFile = formData.get("featuredThumbnailFile");
  const galleryFiles = formData
    .getAll("galleryFiles")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const galleryUrlsRaw = String(formData.get("galleryUrls") ?? "").trim();
  const galleryUrls = galleryUrlsRaw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const galleryAltLines = String(formData.get("galleryAltText") ?? "")
    .split("\n")
    .map((line) => line.trim());
  const metaTitleInput = String(formData.get("metaTitle") ?? "").trim();
  const metaDescriptionInput = String(formData.get("metaDescription") ?? "").trim();
  const metaKeywords = String(formData.get("metaKeywords") ?? "").trim();
  const focusKeyword = String(formData.get("focusKeyword") ?? "").trim();
  const ogImageInput = String(formData.get("ogImage") ?? "").trim();
  const isPublished = formData.get("isPublished") === "on";

  if (title.length < 3 || title.length > 140 || contentHtml.length < 10) {
    redirect("/dashboard/posts/new");
  }

  const slug = await ensureUniqueSlug(
    prisma,
    requestedSlug || slugifyTitle(title),
  );

  let featuredThumbnail = featuredThumbnailUrlInput || null;
  if (featuredThumbnailFile instanceof File && featuredThumbnailFile.size > 0) {
    const saved = await savePostMedia(featuredThumbnailFile, `${slug}-hero`);
    featuredThumbnail = saved?.url ?? featuredThumbnail;
  }

  const gallery: Array<{ url: string; mediaType: "IMAGE" | "VIDEO"; altText: string | null }> = [];
  for (const file of galleryFiles) {
    const saved = await savePostMedia(file, `${slug}-gallery`);
    if (saved) {
      gallery.push({
        url: saved.url,
        mediaType: saved.mediaType,
        altText: null,
      });
    }
  }
  for (const url of galleryUrls) {
    const isVideo = /\.(mp4|webm|ogg)(\?|$)/i.test(url);
    gallery.push({
      url,
      mediaType: isVideo ? "VIDEO" : "IMAGE",
      altText: null,
    });
  }
  for (let i = 0; i < gallery.length; i += 1) {
    const alt = galleryAltLines[i];
    gallery[i].altText = alt ? alt : null;
  }

  const primaryMedia = gallery[0];
  const resolvedMetaTitle = generateMetaTitle(title, metaTitleInput);
  const resolvedMetaDescription = generateMetaDescription(
    contentHtml,
    metaDescriptionInput,
  );
  const ogImage =
    ogImageInput || featuredThumbnail || primaryMedia?.url || "/loogo.png";

  const plainContent = contentHtml
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  await prisma.homePost.create({
    data: {
      title,
      slug,
      content: plainContent,
      contentHtml,
      mediaUrl: primaryMedia?.url ?? featuredThumbnail,
      mediaType: primaryMedia
        ? primaryMedia.mediaType === "VIDEO"
          ? "VIDEO"
          : "IMAGE"
        : featuredThumbnail
          ? "IMAGE"
          : "NONE",
      featuredThumbnail,
      featuredThumbnailAlt: featuredThumbnail ? featuredThumbnailAlt || null : null,
      isPublished,
      publishDate: isPublished ? new Date() : null,
      metaTitle: resolvedMetaTitle,
      metaDescription: resolvedMetaDescription,
      metaKeywords: metaKeywords || null,
      focusKeyword: focusKeyword || null,
      ogImage,
      authorId: session.user.id,
      authorNameSnapshot: session.user.name ?? "Unknown",
      authorEmailSnapshot: session.user.email ?? "",
      galleryMedia: {
        create: gallery.map((item, index) => ({
          url: item.url,
          mediaType: item.mediaType,
          altText: item.altText,
          sortOrder: index,
        })),
      },
    },
  });

  revalidatePath("/");
  revalidatePath("/newsletter");
  revalidatePath(`/newsletter/${slug}`);
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/posts/new");
  redirect("/dashboard/posts/new");
}
