"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function messageFromProfileSavedParam(searchParams: URLSearchParams): string | null {
  if (searchParams.get("profileSaved") !== "1") return null;
  return "Visa status updated successfully.";
}

export function VisaStatusSavedToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [latched, setLatched] = useState<string | null>(null);

  const fromUrl = useMemo(() => messageFromProfileSavedParam(searchParams), [searchParams]);
  const visible = latched ?? fromUrl;

  useEffect(() => {
    if (searchParams.get("profileSaved") !== "1") return;

    const msg = messageFromProfileSavedParam(searchParams);
    if (!msg) return;

    queueMicrotask(() => {
      setLatched(msg);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("profileSaved");
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
