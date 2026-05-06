import { headers } from "next/headers";
import { redirect } from "next/navigation";

type DashboardPath = "/dashboard/admin" | "/dashboard/sub-admin";

function buildRedirectTarget(pathname: string, searchParams: URLSearchParams, anchorId?: string) {
  const qs = searchParams.toString();
  const hash = anchorId ? `#${anchorId}` : "";
  return qs ? `${pathname}?${qs}${hash}` : `${pathname}${hash}`;
}

/**
 * Sends the browser back to the admin or sub-admin dashboard after delegating,
 * preserving query params when possible (referer must match dashboard path).
 * The client reads query notice params for brief success toasts.
 */
export async function redirectWithDashboardNotice(opts: {
  dashboardPath: DashboardPath;
  noticeParams: Record<string, string>;
  anchorId?: string;
}) {
  const h = await headers();
  const referer = h.get("referer");
  const host = h.get("x-forwarded-host") ?? h.get("host");

  if (referer && host) {
    try {
      const ref = new URL(referer);
      if (ref.host === host && ref.pathname === opts.dashboardPath) {
        for (const [key, value] of Object.entries(opts.noticeParams)) {
          ref.searchParams.set(key, value);
        }
        redirect(buildRedirectTarget(ref.pathname, ref.searchParams, opts.anchorId));
      }
    } catch {
      // Fall through to default redirect.
    }
  }

  const fallbackParams = new URLSearchParams("tab=students");
  for (const [key, value] of Object.entries(opts.noticeParams)) {
    fallbackParams.set(key, value);
  }
  redirect(buildRedirectTarget(opts.dashboardPath, fallbackParams, opts.anchorId));
}

export async function redirectWithDelegationNotice(opts: {
  dashboardPath: DashboardPath;
  staffLabel: string;
  anchorId?: string;
}) {
  return redirectWithDashboardNotice({
    dashboardPath: opts.dashboardPath,
    noticeParams: { delegatedTo: opts.staffLabel },
    anchorId: opts.anchorId,
  });
}
