"use client";

import { useFormStatus } from "react-dom";

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
