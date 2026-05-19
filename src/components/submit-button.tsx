"use client";

import { useEffect } from "react";
import { useFormStatus } from "react-dom";

import { useGlobalLoadingOptional } from "@/components/loading/global-loading-provider";

type SubmitButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: React.ReactNode;
  loadingText?: string;
};

export function SubmitButton({
  children,
  loadingText = "Loading...",
  disabled,
  className,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const globalLoading = useGlobalLoadingOptional();

  useEffect(() => {
    globalLoading?.setFormPending(pending);
  }, [pending, globalLoading]);

  return (
    <button
      type="submit"
      disabled={disabled ?? pending}
      className={className}
      {...props}
    >
      {pending ? loadingText : children}
    </button>
  );
}
