import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { DeleteWithConfirm } from "@/components/delete-with-confirm";
import { PostRichEditor } from "@/components/post-rich-editor";
import { savePostMedia } from "@/lib/post-media";
import { prisma } from "@/lib/prisma";
import {
  calculateSeoHealth,
  ensureUniqueSlug,
  generateMetaDescription,
  generateMetaTitle,
  slugifyTitle,
  toPlainText,
} from "@/lib/post-seo";

type Params = Promise<{ postId: string }>;

export default async function EditPostPage(props: { params: Params }) {
  const { postId } = await props.params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN") {
    redirect("/dashboard");
  }

  const post = await prisma.homePost.findUnique({
    where: { id: postId },
    include: {
      author: { select: { id: true, name: true, email: true } },
      galleryMedia: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!post) redirect("/dashboard");

  const canManage = session.user.role === "ADMIN" || post.authorId === session.user.id;
  if (!canManage) redirect("/dashboard");

  const seoHealth = calculateSeoHealth({
    title: post.title,
    contentHtml: post.contentHtml || `<p>${post.content}</p>`,
    focusKeyword: post.focusKeyword,
    metaDescription: post.metaDescription,
    featuredThumbnailAlt: post.featuredThumbnailAlt,
    galleryImagesAlt: post.galleryMedia
      .filter((item) => item.mediaType === "IMAGE")
      .map((item) => item.altText),
  });

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Edit Home Page Post</h1>
          <p className="mt-1 text-sm text-gray-600">
            Created by {post.author.name ?? post.author.email} on {post.createdAt.toLocaleDateString()}
          </p>
        </div>
        <Link href="/dashboard" className="rounded-md border px-3 py-2 text-sm">
          Back to dashboard
        </Link>
      </div>

      <form action={updatePostAction} className="space-y-4 rounded-lg border bg-white p-5">
        <input type="hidden" name="postId" value={post.id} />
        <label className="block text-sm">
          Title
          <input type="text" name="title" required minLength={3} maxLength={140} defaultValue={post.title} className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900" />
        </label>
        <label className="block text-sm">
          Slug
          <input type="text" name="slug" required defaultValue={post.slug ?? slugifyTitle(post.title)} className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900" />
        </label>

        <PostRichEditor initialHtml={post.contentHtml || `<p>${post.content}</p>`} />

        <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
          <p className="font-medium">Current SEO health: {seoHealth.score}/100</p>
          {seoHealth.warnings.length === 0 ? (
            <p className="text-xs text-gray-600">No SEO warnings.</p>
          ) : (
            <ul className="mt-1 list-disc pl-5 text-xs text-amber-700">
              {seoHealth.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            Featured thumbnail file (optional)
            <input name="featuredThumbnailFile" type="file" accept="image/*" className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900 file:mr-3 file:rounded-md file:border file:border-gray-300 file:bg-gray-50 file:px-3 file:py-1.5 file:text-xs file:font-medium" />
          </label>
          <label className="block text-sm">
            Featured thumbnail URL
            <input type="url" name="featuredThumbnailUrl" defaultValue={post.featuredThumbnail ?? ""} className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900" />
          </label>
          <label className="block text-sm md:col-span-2">
            Featured image alt text
            <input name="featuredThumbnailAlt" defaultValue={post.featuredThumbnailAlt ?? ""} className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900" />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            Add gallery uploads
            <input name="galleryFiles" type="file" accept="image/*,video/*" multiple className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900 file:mr-3 file:rounded-md file:border file:border-gray-300 file:bg-gray-50 file:px-3 file:py-1.5 file:text-xs file:font-medium" />
          </label>
          <label className="block text-sm">
            Add gallery URLs (one per line)
            <textarea name="galleryUrls" className="mt-1 min-h-24 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900" />
          </label>
        </div>

        <label className="block text-sm">
          Gallery image alt text (one line per item in order)
          <textarea
            name="galleryAltText"
            defaultValue={post.galleryMedia.map((item) => item.altText ?? "").join("\n")}
            className="mt-1 min-h-24 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            Meta title
            <input name="metaTitle" defaultValue={post.metaTitle ?? ""} className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900" />
          </label>
          <label className="block text-sm">
            Focus keyword
            <input name="focusKeyword" defaultValue={post.focusKeyword ?? ""} className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900" />
          </label>
          <label className="block text-sm md:col-span-2">
            Meta description
            <textarea name="metaDescription" defaultValue={post.metaDescription ?? ""} className="mt-1 min-h-20 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900" />
          </label>
          <label className="block text-sm">
            Meta keywords
            <input name="metaKeywords" defaultValue={post.metaKeywords ?? ""} className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900" />
          </label>
          <label className="block text-sm">
            OG image override URL
            <input type="url" name="ogImage" defaultValue={post.ogImage ?? ""} className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900" />
          </label>
        </div>

        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" name="isPublished" defaultChecked={post.isPublished} />
          Published
        </label>
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white">
            Save changes
          </button>
        </div>
      </form>

      <DeleteWithConfirm
        formAction={deletePostAction}
        confirmMessage="Delete this post? This cannot be undone."
        buttonLabel="Delete post"
        buttonClassName="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700"
      >
        <input type="hidden" name="postId" value={post.id} />
      </DeleteWithConfirm>
    </section>
  );
}

async function updatePostAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN") {
    redirect("/dashboard");
  }

  const postId = String(formData.get("postId") ?? "");
  const existing = await prisma.homePost.findUnique({
    where: { id: postId },
    include: { galleryMedia: { orderBy: { sortOrder: "asc" } } },
  });
  if (!existing) redirect("/dashboard");
  if (session.user.role !== "ADMIN" && existing.authorId !== session.user.id) {
    redirect("/dashboard");
  }

  const title = String(formData.get("title") ?? "").trim();
  const requestedSlug = String(formData.get("slug") ?? "").trim();
  const contentHtml = String(formData.get("contentHtml") ?? "").trim();
  const featuredThumbnailUrlInput = String(formData.get("featuredThumbnailUrl") ?? "").trim();
  const featuredThumbnailAlt = String(formData.get("featuredThumbnailAlt") ?? "").trim();
  const featuredThumbnailFile = formData.get("featuredThumbnailFile");
  const galleryFiles = formData
    .getAll("galleryFiles")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const galleryUrls = String(formData.get("galleryUrls") ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const galleryAltText = String(formData.get("galleryAltText") ?? "")
    .split("\n")
    .map((line) => line.trim());
  const metaTitleInput = String(formData.get("metaTitle") ?? "").trim();
  const metaDescriptionInput = String(formData.get("metaDescription") ?? "").trim();
  const metaKeywords = String(formData.get("metaKeywords") ?? "").trim();
  const focusKeyword = String(formData.get("focusKeyword") ?? "").trim();
  const ogImageInput = String(formData.get("ogImage") ?? "").trim();
  const isPublished = formData.get("isPublished") === "on";

  if (title.length < 3 || title.length > 140 || contentHtml.length < 10) {
    redirect(`/dashboard/posts/${postId}/edit`);
  }

  const slug = await ensureUniqueSlug(
    prisma,
    requestedSlug || slugifyTitle(title),
    postId,
  );

  let featuredThumbnail = featuredThumbnailUrlInput || existing.featuredThumbnail || null;
  if (featuredThumbnailFile instanceof File && featuredThumbnailFile.size > 0) {
    const saved = await savePostMedia(featuredThumbnailFile, `${slug}-hero`);
    featuredThumbnail = saved?.url ?? featuredThumbnail;
  }

  const gallery = existing.galleryMedia.map((item) => ({
    url: item.url,
    mediaType: item.mediaType as "IMAGE" | "VIDEO",
    altText: item.altText ?? null,
  }));
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
    gallery.push({
      url,
      mediaType: /\.(mp4|webm|ogg)(\?|$)/i.test(url) ? "VIDEO" : "IMAGE",
      altText: null,
    });
  }
  for (let i = 0; i < gallery.length; i += 1) {
    gallery[i].altText = galleryAltText[i] ? galleryAltText[i] : null;
  }

  const firstMedia = gallery[0];
  const resolvedMetaTitle = generateMetaTitle(title, metaTitleInput);
  const resolvedMetaDescription = generateMetaDescription(
    contentHtml,
    metaDescriptionInput,
  );
  const ogImage = ogImageInput || featuredThumbnail || firstMedia?.url || "/loogo.png";
  const publishDate = isPublished ? existing.publishDate ?? new Date() : null;

  await prisma.homePost.update({
    where: { id: postId },
    data: {
      title,
      slug,
      content: toPlainText(contentHtml),
      contentHtml,
      mediaUrl: firstMedia?.url ?? featuredThumbnail,
      mediaType: firstMedia
        ? firstMedia.mediaType === "VIDEO"
          ? "VIDEO"
          : "IMAGE"
        : featuredThumbnail
          ? "IMAGE"
          : "NONE",
      featuredThumbnail,
      featuredThumbnailAlt: featuredThumbnail ? featuredThumbnailAlt || null : null,
      isPublished,
      publishDate,
      metaTitle: resolvedMetaTitle,
      metaDescription: resolvedMetaDescription,
      metaKeywords: metaKeywords || null,
      focusKeyword: focusKeyword || null,
      ogImage,
      galleryMedia: {
        deleteMany: {},
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
  if (existing.slug) revalidatePath(`/newsletter/${existing.slug}`);
  revalidatePath(`/newsletter/${slug}`);
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath(`/dashboard/posts/${postId}/edit`);
  redirect(`/dashboard/posts/${postId}/edit`);
}

async function deletePostAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN") {
    redirect("/dashboard");
  }

  const postId = String(formData.get("postId") ?? "");
  const existing = await prisma.homePost.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, slug: true },
  });
  if (!existing) redirect("/dashboard");
  if (session.user.role !== "ADMIN" && existing.authorId !== session.user.id) {
    redirect("/dashboard");
  }

  await prisma.homePost.delete({ where: { id: postId } });

  revalidatePath("/");
  revalidatePath("/newsletter");
  if (existing.slug) revalidatePath(`/newsletter/${existing.slug}`);
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/sub-admin");
  redirect("/dashboard");
}

