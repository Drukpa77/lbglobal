"use client";

import { useEffect } from "react";

type Props = {
  studentId: string;
};

export function DocumentNotificationReadTracker({ studentId }: Props) {
  useEffect(() => {
    if (!studentId) return;
    fetch("/api/notifications/workflow/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId }),
    }).catch(() => undefined);
  }, [studentId]);

  return null;
}
