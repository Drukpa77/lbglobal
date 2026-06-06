"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export function UnreadChatBadge() {
  const [count, setCount] = useState<number | null>(null);
  const pathname = usePathname();

  const fetchCount = useCallback(() => {
    fetch("/api/notifications/unread-count")
      .then((res) => res.json())
      .then((data: { count: number }) => setCount(data.count))
      .catch(() => setCount(0));
  }, []);

  useEffect(() => {
    fetchCount();
  }, [fetchCount, pathname]);

  useEffect(() => {
    const onFocus = () => fetchCount();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchCount]);

  useEffect(() => {
    const intervalMs = process.env.NODE_ENV === "development" ? 60_000 : 45_000;
    const poll = () => { if (!document.hidden) fetchCount(); };
    const id = window.setInterval(poll, intervalMs);
    return () => window.clearInterval(id);
  }, [fetchCount]);

  if (count === null) return null;

  return (
    <Link
      href="/dashboard/communication"
      className="relative inline-flex items-center gap-1 text-sm font-medium text-rose-600 underline"
    >
      Chat
      {count > 0 && (
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
