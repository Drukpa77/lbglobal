"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function messageFromDelegationParams(searchParams: URLSearchParams): string | null {
  const delegatedToRaw = searchParams.get("delegatedTo");
  const statusUpdated = searchParams.get("statusUpdated");
  if (!delegatedToRaw?.trim() && statusUpdated !== "1") return null;

  if (delegatedToRaw?.trim()) {
    let label: string;
    try {
      label = decodeURIComponent(delegatedToRaw.trim()).replace(/\s+/g, " ");
    } catch {
      label = delegatedToRaw.trim();
    }
    return `Successfully delegated to ${label}.`;
  }
  return "Status updated successfully.";
}

/** Fixed toast after server redirect with `delegatedTo` query (see `redirectWithDelegationNotice`). */
export function DelegationSuccessToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [latched, setLatched] = useState<string | null>(null);

  const fromUrl = useMemo(() => messageFromDelegationParams(searchParams), [searchParams]);
  const visible = latched ?? fromUrl;

  useEffect(() => {
    const delegatedToRaw = searchParams.get("delegatedTo");
    const statusUpdated = searchParams.get("statusUpdated");
    if (!delegatedToRaw?.trim() && statusUpdated !== "1") return;

    const msg = messageFromDelegationParams(searchParams);
    if (!msg) return;

    queueMicrotask(() => {
      setLatched(msg);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("delegatedTo");
      params.delete("statusUpdated");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (!visible) return undefined;

    const t = setTimeout(() => setLatched(null), 5000);
    return () => clearTimeout(t);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed right-4 top-4 z-50 max-w-sm rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-950 shadow-lg"
    >
      {visible}
    </div>
  );
}
