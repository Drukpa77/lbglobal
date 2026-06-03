import { revalidatePath } from "next/cache";

/** Revalidate dashboards that render contribution leaderboards. */
export function revalidateContributionPaths(studentUserId?: string) {
  const paths = [
    "/dashboard/admin",
    "/dashboard/sub-admin",
    "/dashboard/internal-staff",
  ];
  if (studentUserId) {
    paths.push(`/dashboard/students/${studentUserId}`);
  }
  return paths;
}

/** Invalidate contribution leaderboards after case work changes. */
export function revalidateContributionsCache(studentUserId?: string) {
  for (const path of revalidateContributionPaths(studentUserId)) {
    revalidatePath(path);
  }
}

export function revalidateContributionsCacheForCases(studentUserIds: Iterable<string>) {
  const seen = new Set<string>();
  for (const studentUserId of studentUserIds) {
    if (!studentUserId || seen.has(studentUserId)) continue;
    seen.add(studentUserId);
    revalidateContributionsCache(studentUserId);
  }
}
