"use client";

import { useRef, useState } from "react";

type Props = {
  label?: string;
  className?: string;
};

export function DeleteStaffButton({ label = "Delete staff account", className }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(true)}
        className={
          className ??
          "rounded-lg border border-red-300 bg-red-100 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-200"
        }
      >
        {label}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-900">Confirm Delete</h3>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to delete this staff account?
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
                  setIsOpen(false);
                  buttonRef.current?.form?.requestSubmit();
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
