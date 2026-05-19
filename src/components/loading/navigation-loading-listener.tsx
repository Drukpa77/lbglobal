"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { useGlobalLoading } from "@/components/loading/global-loading-provider";

function isInternalNavigationLink(anchor: HTMLAnchorElement) {
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return false;
  }
  if (anchor.target === "_blank" || anchor.hasAttribute("download")) {
    return false;
  }

  try {
    const url = new URL(href, window.location.origin);
    return url.origin === window.location.origin;
  } catch {
    return false;
  }
}

export function NavigationLoadingListener() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { startLoading, stopLoading, setFormPending } = useGlobalLoading();
  const navigationStartedRef = useRef(false);

  useEffect(() => {
    if (navigationStartedRef.current) {
      navigationStartedRef.current = false;
      stopLoading();
    }
    setFormPending(false);
  }, [pathname, searchParams, stopLoading, setFormPending]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!anchor || !isInternalNavigationLink(anchor)) return;

      const href = anchor.getAttribute("href");
      if (!href) return;

      const target = new URL(href, window.location.origin);
      const current = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
      const next = `${target.pathname}${target.search}`;

      if (next === current) return;

      navigationStartedRef.current = true;
      startLoading();
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [pathname, searchParams, startLoading]);

  return null;
}
