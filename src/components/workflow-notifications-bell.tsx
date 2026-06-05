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

function normalizeWorkflowPayload(raw: unknown): Payload {
  if (!raw || typeof raw !== "object") {
    return { actionRequiredCount: 0, groups: [] };
  }
  const o = raw as Record<string, unknown>;
  const actionRequiredCount =
    typeof o.actionRequiredCount === "number" && Number.isFinite(o.actionRequiredCount)
      ? Math.max(0, o.actionRequiredCount)
      : 0;
  const rawGroups = o.groups;
  if (!Array.isArray(rawGroups)) {
    return { actionRequiredCount, groups: [] };
  }
  const groups: NotificationGroup[] = [];
  for (const g of rawGroups) {
    if (!g || typeof g !== "object") continue;
    const grp = g as Record<string, unknown>;
    const studentId = typeof grp.studentId === "string" ? grp.studentId : null;
    if (!studentId) continue;
    const studentName = typeof grp.studentName === "string" ? grp.studentName : "";
    const unreadRaw = grp.unreadCount;
    const unreadCount =
      typeof unreadRaw === "number" && Number.isFinite(unreadRaw)
        ? Math.max(0, unreadRaw)
        : 0;
    const rawItems = grp.items;
    const items = Array.isArray(rawItems)
      ? rawItems
          .filter(
            (it): it is Record<string, unknown> =>
              !!it && typeof it === "object" && typeof (it as Record<string, unknown>).id === "string",
          )
          .map((it) => ({
            id: String(it.id),
            title: typeof it.title === "string" ? it.title : "",
            message: typeof it.message === "string" ? it.message : "",
            note: typeof it.note === "string" || it.note === null ? (it.note as string | null) : null,
            link: typeof it.link === "string" ? it.link : "#",
            type: typeof it.type === "string" ? it.type : "UNKNOWN",
            actionRequired: Boolean(it.actionRequired),
            isRead: Boolean(it.isRead),
            createdAt: typeof it.createdAt === "string" ? it.createdAt : "",
          }))
      : [];
    groups.push({
      studentId,
      studentName,
      unreadCount,
      items,
    });
  }
  return { actionRequiredCount, groups };
}

export function WorkflowNotificationsBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Payload>({ actionRequiredCount: 0, groups: [] });
  const pathname = usePathname();

  const fetchNotifications = useCallback(() => {
    fetch("/api/notifications/workflow")
      .then(async (res) => {
        const text = await res.text();
        try {
          return JSON.parse(text) as unknown;
        } catch {
          return {};
        }
      })
      .then((raw) => setData(normalizeWorkflowPayload(raw)))
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
        <div className="fixed left-3 right-3 top-36 z-[80] max-h-[calc(100dvh-10rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[28rem] sm:max-w-[90vw]">
          <p className="text-sm font-semibold text-slate-900">Notifications</p>
          {!hasItems ? (
            <p className="mt-3 text-sm text-slate-600">No notifications right now.</p>
          ) : (
            <div className="mt-3 max-h-[calc(100dvh-14rem)] space-y-3 overflow-y-auto pr-1 sm:max-h-[28rem]">
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
