"use client";

import { useEffect } from "react";

const MESSAGES_CONTAINER_ID = "chat-messages-container";

export function ScrollMessagesToBottom() {
  useEffect(() => {
    const el = document.getElementById(MESSAGES_CONTAINER_ID);
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  return null;
}

export { MESSAGES_CONTAINER_ID };
