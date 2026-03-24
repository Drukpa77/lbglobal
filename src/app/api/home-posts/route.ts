import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET() {
  const posts = await prisma.homePost.findMany({
    where: {
      isPublished: true,
      publishDate: { not: null, lte: new Date() },
    },
    include: {
      author: {
        select: {
          name: true,
          email: true,
        },
      },
      galleryMedia: {
        orderBy: { sortOrder: "asc" },
        take: 3,
      },
    },
    orderBy: { publishDate: "desc" },
    take: 12,
  });

  return NextResponse.json({ posts });
}
