"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const TASK_ERROR_MESSAGES: Record<string, string> = {
  "not-assigned": "You can only create tasks for students assigned to you.",
  "sub-admin-access": "You don't have access to create tasks for this student.",
  "no-profile": "This student does not have a profile yet.",
  "missing-title": "Enter a task title before saving.",
};

export function TaskActionToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [toast, setToast] = useState<{ variant: "success" | "error"; message: string } | null>(
    null,
  );

  useEffect(() => {
    const created = searchParams.get("taskCreated") === "1";
    const errCode = searchParams.get("taskError");

    if (!created && !errCode) return;

    queueMicrotask(() => {
      if (created) {
        setToast({ variant: "success", message: "Task created." });
      } else if (errCode) {
        setToast({
          variant: "error",
          message: TASK_ERROR_MESSAGES[errCode] ?? "Something went wrong while saving the task.",
        });
      }

      const params = new URLSearchParams(searchParams.toString());
      params.delete("taskCreated");
      params.delete("taskError");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  const tone =
    toast.variant === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : "border-amber-200 bg-amber-50 text-amber-950";

  return (
    <div
      role="status"
      className={`pointer-events-none fixed right-4 top-4 z-50 max-w-sm rounded-lg border px-4 py-3 text-sm font-medium shadow-lg ${tone}`}
    >
      {toast.message}
    </div>
  );
}
