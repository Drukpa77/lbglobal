/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require("@prisma/client");

function slugifyTitle(input) {
  const base = String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "post";
}

function toPlainText(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function generateMetaDescription(contentHtml) {
  const plain = toPlainText(contentHtml);
  if (!plain) return "";
  if (plain.length <= 160) return plain;
  return `${plain.slice(0, 157).trimEnd()}...`;
}

async function ensureUniqueSlug(prisma, desired, excludeId) {
  const base = slugifyTitle(desired);
  let candidate = base;
  let i = 2;

  while (true) {
    const existing = await prisma.homePost.findFirst({
      where: {
        slug: candidate,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (!existing) return candidate;
    candidate = `${base}-${i}`;
    i += 1;
  }
}

async function main() {
  const prisma = new PrismaClient();
  const posts = await prisma.homePost.findMany({
    include: { author: { select: { name: true, email: true } } },
  });

  for (const post of posts) {
    const contentHtml =
      post.contentHtml && post.contentHtml.trim().length > 0
        ? post.contentHtml
        : `<p>${String(post.content || "").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`;

    const slug = await ensureUniqueSlug(
      prisma,
      post.slug && post.slug.trim().length > 0 ? post.slug : post.title,
      post.id,
    );

    const featured = post.featuredThumbnail || post.mediaUrl || null;
    const publishDate = post.publishDate || (post.isPublished ? post.createdAt : null);
    const authorNameSnapshot = post.authorNameSnapshot || post.author?.name || "Unknown";
    const authorEmailSnapshot = post.authorEmailSnapshot || post.author?.email || "";

    await prisma.homePost.update({
      where: { id: post.id },
      data: {
        slug,
        contentHtml,
        featuredThumbnail: featured,
        publishDate,
        authorNameSnapshot,
        authorEmailSnapshot,
        metaTitle: post.metaTitle || `${post.title} | L&B Global`,
        metaDescription: post.metaDescription || generateMetaDescription(contentHtml),
      },
    });

    if (post.mediaUrl) {
      const existingMedia = await prisma.postMedia.findFirst({
        where: { postId: post.id, url: post.mediaUrl },
        select: { id: true },
      });
      if (!existingMedia) {
        await prisma.postMedia.create({
          data: {
            postId: post.id,
            url: post.mediaUrl,
            mediaType: post.mediaType === "VIDEO" ? "VIDEO" : "IMAGE",
            sortOrder: 0,
          },
        });
      }
    }
  }

  await prisma.$disconnect();
  console.log(`Backfilled ${posts.length} home posts.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

