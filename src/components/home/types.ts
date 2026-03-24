export type HomePostItem = {
  id: string;
  title: string;
  slug: string | null;
  content: string;
  mediaType: "NONE" | "IMAGE" | "VIDEO";
  mediaUrl: string | null;
  featuredThumbnail: string | null;
  featuredThumbnailAlt: string | null;
  publishDate: string | null;
  createdAt: string;
  authorNameSnapshot: string;
  authorEmailSnapshot: string;
  metaDescription: string | null;
};

