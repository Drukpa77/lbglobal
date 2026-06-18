"use client";

import { useRef, useState } from "react";

type DeleteWithConfirmProps = {
  formAction: (formData: FormData) => Promise<void>;
  confirmMessage?: string;
  buttonLabel?: string;
  buttonClassName?: string;
  children?: React.ReactNode;
};

export function DeleteWithConfirm({
  formAction,
  confirmMessage = "Are you sure? This action cannot be undone.",
  buttonLabel = "Delete",
  buttonClassName,
  children,
}: DeleteWithConfirmProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const skipConfirm = useRef(false);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <form
        ref={formRef}
        action={formAction}
        className="inline"
        data-confirm-submit="true"
        onSubmit={(e) => {
          if (skipConfirm.current) return;
          e.preventDefault();
          setIsOpen(true);
        }}
      >
        {children}
        <button type="submit" className={buttonClassName}>
          {buttonLabel}
        </button>
      </form>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-900">Confirm Delete</h3>
            <p className="mt-2 text-sm text-slate-600">
              {confirmMessage}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Anything deleted cannot be restored.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  skipConfirm.current = true;
                  setIsOpen(false);
                  const form = formRef.current;
                  form?.removeAttribute("data-confirm-submit");
                  form?.requestSubmit();
                }}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Yes, delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
