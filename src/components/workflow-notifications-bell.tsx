"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  note: string | null;
  link: string;
  type: string;
  actionRequired: boolean;
  isRead: boolean;
  createdAt: string;
};

type NotificationGroup = {
  studentId: string;
  studentName: string;
  unreadCount: number;
  items: NotificationItem[];
};

type Payload = {
  actionRequiredCount: number;
  groups: NotificationGroup[];
};

export function WorkflowNotificationsBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Payload>({ actionRequiredCount: 0, groups: [] });
  const pathname = usePathname();

  const fetchNotifications = useCallback(() => {
    fetch("/api/notifications/workflow")
      .then((res) => res.json())
      .then((payload: Payload) => setData(payload))
      .catch(() => setData({ actionRequiredCount: 0, groups: [] }));
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications, pathname]);

  useEffect(() => {
    const onFocus = () => fetchNotifications();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchNotifications]);

  useEffect(() => {
    const id = window.setInterval(fetchNotifications, process.env.NODE_ENV === "development" ? 20_000 : 10_000);
    return () => window.clearInterval(id);
  }, [fetchNotifications]);

  // Mark a single notification as read. Updates local state optimistically so
  // the badge counter and "unread" pill drop the instant the user clicks,
  // without waiting on the next 10s/20s poll. The fetch is fire-and-forget
  // (with `keepalive` so the request still flushes if a navigation begins).
  const markOneRead = useCallback((notificationId: string) => {
    setData((prev) => {
      let actionRequiredCount = prev.actionRequiredCount;
      const groups = prev.groups.map((group) => {
        let groupChanged = false;
        const items = group.items.map((item) => {
          if (item.id !== notificationId || item.isRead) return item;
          groupChanged = true;
          if (item.actionRequired) {
            actionRequiredCount = Math.max(0, actionRequiredCount - 1);
          }
          return { ...item, isRead: true };
        });
        if (!groupChanged) return group;
        const unreadCount = items.filter((item) => !item.isRead).length;
        return { ...group, items, unreadCount };
      });
      return { actionRequiredCount, groups };
    });

    fetch("/api/notifications/workflow/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId }),
      keepalive: true,
    }).catch(() => undefined);
  }, []);

  const hasItems = useMemo(() => data.groups.some((group) => group.items.length > 0), [data.groups]);

  return (
    <div className="relative z-50">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        aria-label="Open workflow notifications"
      >
        <span className="text-base" aria-hidden>
          🔔
        </span>
        {data.actionRequiredCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">
            {data.actionRequiredCount > 99 ? "99+" : data.actionRequiredCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-[80] mt-2 w-[28rem] max-w-[90vw] rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <p className="text-sm font-semibold text-slate-900">Notifications</p>
          {!hasItems ? (
            <p className="mt-3 text-sm text-slate-600">No notifications right now.</p>
          ) : (
            <div className="mt-3 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
              {data.groups.map((group) => (
                <section key={group.studentId} className="rounded-lg border border-slate-200 bg-slate-50/50 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      {group.studentName}
                    </p>
                    {group.unreadCount > 0 ? (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                        {group.unreadCount} unread
                      </span>
                    ) : null}
                  </div>
                  <ul className="mt-2 space-y-2">
                    {group.items.map((item) => (
                      <li key={item.id}>
                        <Link
                          href={item.link}
                          onClick={() => {
                            setOpen(false);
                            if (!item.isRead) markOneRead(item.id);
                          }}
                          className={`block rounded-md border p-2 text-xs transition ${notificationItemClasses(item)} ${
                            item.isRead ? "opacity-70" : ""
                          }`}
                        >
                          <p className="font-semibold">{item.title}</p>
                          <p className="mt-0.5">{item.message}</p>
                          {item.note ? <p className="mt-1 text-[11px] italic">Note: {item.note}</p> : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function notificationItemClasses(item: NotificationItem) {
  if (item.type === "NEW_STUDENT_APPLICATION") {
    return "border-emerald-300 bg-emerald-50 text-emerald-900 hover:border-emerald-400";
  }
  if (item.actionRequired) {
    return "border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-400";
  }
  return "border-blue-200 bg-blue-50 text-blue-900 hover:border-blue-300";
}
