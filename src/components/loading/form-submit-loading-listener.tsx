"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { useGlobalLoading } from "@/components/loading/global-loading-provider";

export function FormSubmitLoadingListener() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setFormPending } = useGlobalLoading();

  useEffect(() => {
    setFormPending(false);
  }, [pathname, searchParams, setFormPending]);

  useEffect(() => {
    const handleSubmit = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.getAttribute("data-skip-global-loading") === "true") return;
      if (form.getAttribute("data-confirm-submit") === "true") return;
      setFormPending(true);
    };

    document.addEventListener("submit", handleSubmit, true);
    return () => document.removeEventListener("submit", handleSubmit, true);
  }, [setFormPending]);

  return null;
}
