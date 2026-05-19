"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type GlobalLoadingContextValue = {
  isLoading: boolean;
  startLoading: () => void;
  stopLoading: () => void;
  withLoading: <T>(fn: () => Promise<T>) => Promise<T>;
  setFormPending: (pending: boolean) => void;
};

const GlobalLoadingContext = createContext<GlobalLoadingContextValue | null>(null);

export function GlobalLoadingProvider({ children }: { children: ReactNode }) {
  const [taskCount, setTaskCount] = useState(0);
  const [formPending, setFormPending] = useState(false);
  const taskCountRef = useRef(0);

  const startLoading = useCallback(() => {
    taskCountRef.current += 1;
    setTaskCount(taskCountRef.current);
  }, []);

  const stopLoading = useCallback(() => {
    taskCountRef.current = Math.max(0, taskCountRef.current - 1);
    setTaskCount(taskCountRef.current);
  }, []);

  const withLoading = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      startLoading();
      try {
        return await fn();
      } finally {
        stopLoading();
      }
    },
    [startLoading, stopLoading],
  );

  const isLoading = taskCount > 0 || formPending;

  useEffect(() => {
    if (!formPending) return;
    const timeout = window.setTimeout(() => setFormPending(false), 12000);
    return () => window.clearTimeout(timeout);
  }, [formPending]);

  const value = useMemo(
    () => ({
      isLoading,
      startLoading,
      stopLoading,
      withLoading,
      setFormPending,
    }),
    [isLoading, startLoading, stopLoading, withLoading],
  );

  return (
    <GlobalLoadingContext.Provider value={value}>
      {children}
      {isLoading ? <GlobalLoadingOverlay /> : null}
    </GlobalLoadingContext.Provider>
  );
}

export function useGlobalLoading() {
  const context = useContext(GlobalLoadingContext);
  if (!context) {
    throw new Error("useGlobalLoading must be used within GlobalLoadingProvider");
  }
  return context;
}

/** Safe when provider is optional (e.g. tests). */
export function useGlobalLoadingOptional() {
  return useContext(GlobalLoadingContext);
}

function GlobalLoadingOverlay() {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/20 bg-white/95 px-8 py-7 shadow-2xl">
        <div className="relative h-12 w-12" aria-hidden="true">
          <span className="absolute inset-0 rounded-full border-4 border-slate-200" />
          <span className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-rose-500 border-r-blue-500" />
        </div>
        <p className="text-sm font-semibold text-slate-800">Please wait…</p>
        <p className="text-xs text-slate-500">This may take a moment</p>
      </div>
    </div>
  );
}
