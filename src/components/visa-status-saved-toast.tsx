"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function VisaStatusSavedToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("profileSaved") !== "1") return;

    setMessage("Visa status updated successfully.");

    const params = new URLSearchParams(searchParams.toString());
    params.delete("profileSaved");
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
