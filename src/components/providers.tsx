"use client";

import { Suspense, type ReactNode } from "react";

import { FormSubmitLoadingListener } from "@/components/loading/form-submit-loading-listener";
import { GlobalLoadingProvider } from "@/components/loading/global-loading-provider";
import { NavigationLoadingListener } from "@/components/loading/navigation-loading-listener";

function LoadingListeners() {
  return (
    <>
      <NavigationLoadingListener />
      <FormSubmitLoadingListener />
    </>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <GlobalLoadingProvider>
      <Suspense fallback={null}>
        <LoadingListeners />
      </Suspense>
      {children}
    </GlobalLoadingProvider>
  );
}
