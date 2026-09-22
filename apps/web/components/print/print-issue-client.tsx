"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { DeliveryNote } from "./delivery-note";
import { PickingSlip } from "./picking-slip";
import { authFetch, ApiError } from "@/lib/api";
import { getToken } from "@/lib/session";
import type { PrintData } from "@/lib/types";

function applyThermalPageStyle(widthMm: number, heightMm: number) {
  if (typeof document === "undefined") return;
  let styleEl = document.getElementById("dynamic-thermal-print-css") as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "dynamic-thermal-print-css";
    document.head.appendChild(styleEl);
  }
  styleEl.innerHTML = `
    @media print {
      @page {
        size: ${widthMm}mm ${heightMm}mm;
        margin: 0;
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: transparent !important;
      }
      .no-print {
        display: none !important;
      }
      .receipt-preview {
        padding: 0 !important;
        margin: 0 !important;
        background: transparent !important;
      }
    }
  `;
}

export function PrintIssueClient({ issueId }: { issueId: string }) {
  const [data, setData] = useState<PrintData | null>(null);
  const [printCount, setPrintCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<"all" | "delivery-note" | "warehouse">("all");

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleAfterPrint() {
      if (typeof window !== "undefined" && window.opener) {
        window.close();
      }
    }
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      setError("Sign in first, then reopen this print link.");
      return;
    }
    let cancelled = false;

    async function load() {
      try {
        const printData = await authFetch<PrintData>(`/issues/${issueId}/print-data`);
        const countResult = await authFetch<{ printCount: number }>(`/issues/${issueId}/print`, {
          method: "POST",
        });
        if (cancelled) return;
        setData(printData);
        setPrintCount(countResult.printCount);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load this receipt.");
      }
    }
    load();

    return () => {
      cancelled = true;
    };
  }, [issueId]);

  const is58mm = data?.warehouse.receiptPaperWidth === "58mm";
  const widthMm = is58mm ? 58 : 80;
  const paperClass = is58mm ? "paper-58mm" : "paper-80mm";

  const triggerPrint = useCallback(
    (mode: "all" | "delivery-note" | "warehouse" = filterMode) => {
      if (!data || !containerRef.current) return;
      setFilterMode(mode);

      // Allow DOM to re-render with the selected filter, then measure and print
      setTimeout(() => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const heightPx = Math.max(
          containerRef.current.scrollHeight,
          containerRef.current.offsetHeight,
          rect.height
        );
        const measuredMm = Math.ceil((heightPx * 25.4) / 96) + 4;
        const heightMm = Math.max(widthMm, measuredMm);

        applyThermalPageStyle(widthMm, heightMm);

        requestAnimationFrame(() => {
          setTimeout(() => {
            window.print();
          }, 100);
        });
      }, 50);
    },
    [data, filterMode, widthMm]
  );

  // Automatically trigger print on initial load
  useEffect(() => {
    if (!data || printCount === null) return;
    let cancelled = false;

    const initialPrint = () => {
      if (cancelled || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const heightPx = Math.max(
        containerRef.current.scrollHeight,
        containerRef.current.offsetHeight,
        rect.height
      );
      const measuredMm = Math.ceil((heightPx * 25.4) / 96) + 4;
      const heightMm = Math.max(widthMm, measuredMm);

      applyThermalPageStyle(widthMm, heightMm);

      requestAnimationFrame(() => {
        setTimeout(() => {
          if (!cancelled) {
            window.print();
          }
        }, 120);
      });
    };

    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready
        .then(() => {
          requestAnimationFrame(() => {
            setTimeout(initialPrint, 120);
          });
        })
        .catch(() => {
          setTimeout(initialPrint, 200);
        });
    } else {
      setTimeout(initialPrint, 200);
    }

    return () => {
      cancelled = true;
    };
  }, [data, printCount, widthMm]);

  if (error) {
    return (
      <div className="p-6 text-center text-sm text-danger">
        <p>{error}</p>
      </div>
    );
  }

  if (!data || printCount === null) {
    return <p className="p-6 text-center text-sm text-ink-muted">Preparing receipt…</p>;
  }

  return (
    <div className={`receipt-preview ${paperClass}`}>
      {/* On-Screen Controls */}
      <div className="no-print mx-auto mb-6 max-w-md rounded-lg border border-border bg-surface p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink">Print Controls</h2>
            <p className="text-xs text-ink-muted">
              {filterMode === "all"
                ? "Both Customer Delivery Note & Warehouse Slip are included"
                : filterMode === "delivery-note"
                ? "Only Customer Delivery Note is visible"
                : "Only Warehouse Slip / KOT is visible"}
            </p>
          </div>
          <span className="rounded bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
            {is58mm ? "58mm Roll" : "80mm Roll"}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => triggerPrint("all")}
            className={`rounded px-3 py-1.5 text-xs font-medium transition ${
              filterMode === "all"
                ? "bg-accent text-white hover:bg-accent-hover"
                : "border border-border bg-surface-raised text-ink hover:bg-surface"
            }`}
          >
            🖨 Print Both (Continuous)
          </button>
          <button
            onClick={() => triggerPrint("delivery-note")}
            className={`rounded px-3 py-1.5 text-xs font-medium transition ${
              filterMode === "delivery-note"
                ? "bg-accent text-white hover:bg-accent-hover"
                : "border border-border bg-surface-raised text-ink hover:bg-surface"
            }`}
          >
            📄 Delivery Note Only
          </button>
          <button
            onClick={() => triggerPrint("warehouse")}
            className={`rounded px-3 py-1.5 text-xs font-medium transition ${
              filterMode === "warehouse"
                ? "bg-accent text-white hover:bg-accent-hover"
                : "border border-border bg-surface-raised text-ink hover:bg-surface"
            }`}
          >
            📦 Warehouse Slip Only
          </button>
        </div>
      </div>

      {/* Printable Container */}
      <div ref={containerRef} style={{ display: "flow-root" }}>
        {/* 1. Customer Delivery Note */}
        {(filterMode === "all" || filterMode === "delivery-note") && (
          <DeliveryNote data={data} printCount={printCount} />
        )}

        {/* Tear/Cut Separator between Delivery Note and Warehouse Slip */}
        {filterMode === "all" && (
          <div className="cut-separator">
            <hr className="rule-cut" />
            <p
              className="bold center"
              style={{ fontSize: "10px", margin: "1mm 0", letterSpacing: "1px" }}
            >
              ✂ - - - - - - CUT HERE (WAREHOUSE) - - - - - - ✂
            </p>
            <hr className="rule-cut" />
          </div>
        )}

        {/* 2. Warehouse Slip / KOT */}
        {(filterMode === "all" || filterMode === "warehouse") && (
          <div>
            {data.warehouse.printMultipleTickets ? (
              data.issue.lines.map((line, i) => (
                <div key={line.id}>
                  {i > 0 && (
                    <div className="cut-separator">
                      <hr className="rule-cut" />
                      <p
                        className="bold center"
                        style={{ fontSize: "10px", margin: "1mm 0", letterSpacing: "1px" }}
                      >
                        ✂ - - - - - - CUT HERE (TICKET {i + 1} OF {data.issue.lines.length}) - - - - - - ✂
                      </p>
                      <hr className="rule-cut" />
                    </div>
                  )}
                  <PickingSlip
                    data={data}
                    lines={[line]}
                    ticketLabel={`KOT ${i + 1} OF ${data.issue.lines.length}`}
                  />
                </div>
              ))
            ) : (
              <PickingSlip data={data} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
