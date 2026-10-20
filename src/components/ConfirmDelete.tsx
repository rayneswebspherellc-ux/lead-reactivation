"use client";

import { useEffect, useRef } from "react";

export default function ConfirmDelete({
  account,
  onConfirm,
  onCancel,
}: {
  account: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <div className="sheet-backdrop absolute inset-0" onClick={onCancel} aria-hidden="true" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        aria-describedby="delete-text"
        className="sheet relative w-full max-w-lg bg-rws-bg border border-rws-box-border rounded-3xl p-4 sm:p-6"
      >
        <div className="bg-rws-box-fill rounded-2xl px-5 py-4 sm:px-8">
          <h2 id="delete-title" className="heading-section text-rws-text">
            Delete Everything?
          </h2>
        </div>
        <div className="px-1 sm:px-4 py-6 flex flex-col gap-6">
          <p id="delete-text" className="text-body-lg text-rws-text-secondary/80">
            This removes every chat, lead, AI read and note this app holds for you
            {account ? ", and your account" : ""}. It cannot be undone. The export files on your own computer or phone
            are not touched.
          </p>
          <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
            <button ref={cancel} type="button" className="btn-outline" onClick={onCancel}>
              Keep my data
            </button>
            <button type="button" className="btn-gold" onClick={onConfirm}>
              Yes, delete everything
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
