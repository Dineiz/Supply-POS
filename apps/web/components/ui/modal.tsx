"use client";

import { type ReactNode, useEffect } from "react";

export function Modal({
  title,
  onClose,
  children,
  position = "center",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** "bottom" anchors the sheet to the bottom edge, full-width — for small screens where a centered dialog has nowhere to breathe. Defaults to the standard centered dialog. */
  position?: "center" | "bottom";
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (position === "bottom") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
        <div
          className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-xl border-t border-border bg-paper shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            <button onClick={onClose} className="text-ink-muted hover:text-ink" aria-label="Close">
              ✕
            </button>
          </div>
          <div className="max-h-[calc(85vh-49px)] overflow-y-auto">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[10vh]" onClick={onClose}>
      <div
        className="max-h-[75vh] w-full max-w-md overflow-hidden rounded-lg border border-border bg-paper shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="max-h-[calc(75vh-49px)] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
