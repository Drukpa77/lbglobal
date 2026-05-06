"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/** Fixed toast after server redirect with `delegatedTo` query (see `redirectWithDelegationNotice`). */
export function DelegationSuccessToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const delegatedToRaw = searchParams.get("delegatedTo");
    const statusUpdated = searchParams.get("statusUpdated");
    if (!delegatedToRaw?.trim() && statusUpdated !== "1") return;

    if (delegatedToRaw?.trim()) {
      let label: string;
      try {
        label = decodeURIComponent(delegatedToRaw.trim()).replace(/\s+/g, " ");
      } catch {
        label = delegatedToRaw.trim();
      }
      setMessage(`Successfully delegated to ${label}.`);
    } else {
      setMessage("Status updated successfully.");
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("delegatedTo");
    params.delete("statusUpdated");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (!message) return undefined;

    const t = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(t);
  }, [message]);

  if (!message) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed right-4 top-4 z-50 max-w-sm rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-950 shadow-lg"
    >
      {message}
    </div>
  );
}
