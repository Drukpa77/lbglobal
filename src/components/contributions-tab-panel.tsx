import { Suspense } from "react";

import { auth } from "@/auth";
import { ContributionCasePicker } from "@/components/contribution-case-picker";
import { getContributionCasesForUser } from "@/lib/contribution-cases";

function ContributionsTabSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-28 animate-pulse rounded-lg border bg-gray-100" />
      <div className="h-40 animate-pulse rounded-lg border bg-gray-100" />
    </div>
  );
}

export async function ContributionsTabPanel() {
  const session = await auth();
  if (!session?.user) {
    return null;
  }

  const cases = await getContributionCasesForUser(session.user);

  return <ContributionCasePicker cases={cases} />;
}

export function ContributionsTabSection() {
  return (
    <Suspense fallback={<ContributionsTabSkeleton />}>
      <ContributionsTabPanel />
    </Suspense>
  );
}
