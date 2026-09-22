"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { DeliveryNote } from "./delivery-note";
import { PickingSlip } from "./picking-slip";
import { authFetch, ApiError } from "@/lib/api";
import { getToken } from "@/lib/session";
import type { PrintData, PrintLine } from "@/lib/types";

interface Ticket {
  id: string;
  name: string;
  type: "delivery-note" | "kot";
  lines?: PrintLine[];
  ticketLabel?: string;
}

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
      .thermal-print-container {
        display: block !important;
      }
      .thermal-ticket-item {
        display: none !important;
      }
      .thermal-ticket-item.is-active-print {
        display: block !important;
        page-break-inside: avoid;
        break-inside: avoid;
      }
    }
  `;
}

function applyContinuousPrintStyle(widthMm: number, totalHeightMm: number) {
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
        size: ${widthMm}mm ${totalHeightMm}mm;
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
      .thermal-ticket-item {
        display: block !important;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .thermal-cut-guide {
        display: block !important;
        margin: 2mm 0;
      }
    }
  `;
}

export function PrintIssueClient({ issueId }: { issueId: string }) {
  const [data, setData] = useState<PrintData | null>(null);
  const [printCount, setPrintCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Printing state
  const [currentTicketIndex, setCurrentTicketIndex] = useState<number>(0);
  const [isContinuous, setIsContinuous] = useState<boolean>(false);
  const [isPrintingDone, setIsPrintingDone] = useState<boolean>(false);
  const [printedIndices, setPrintedIndices] = useState<number[]>([]);

  const ticketRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const isAutoPrintingRef = useRef<boolean>(true);
  const currentTicketIndexRef = useRef<number>(0);
  const ticketsCountRef = useRef<number>(0);

  currentTicketIndexRef.current = currentTicketIndex;

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

  const tickets: Ticket[] = useMemo(() => {
    if (!data) return [];
    const list: Ticket[] = [
      { id: "delivery-note", name: "Customer Delivery Note", type: "delivery-note" },
    ];
    if (data.warehouse.printMultipleTickets) {
      data.issue.lines.forEach((line, i) => {
        list.push({
          id: `kot-${line.id}`,
          name: `KOT ${i + 1} of ${data.issue.lines.length} (${line.itemName})`,
          type: "kot",
          lines: [line],
          ticketLabel: `KOT ${i + 1} OF ${data.issue.lines.length}`,
        });
      });
    } else {
      list.push({
        id: "kot",
        name: "Kitchen Order Ticket (KOT)",
        type: "kot",
      });
    }
    return list;
  }, [data]);

  ticketsCountRef.current = tickets.length;

  const is58mm = data?.warehouse.receiptPaperWidth === "58mm";
  const widthMm = is58mm ? 58 : 80;
  const paperClass = is58mm ? "paper-58mm" : "paper-80mm";

  const printSingleTicket = useCallback(
    (index: number) => {
      if (!data) return;
      setCurrentTicketIndex(index);
      setIsContinuous(false);

      const el = ticketRefs.current.get(index);
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const heightPx = Math.max(el.scrollHeight, el.offsetHeight, rect.height);
      const measuredMm = Math.ceil((heightPx * 25.4) / 96) + 1.5;
      const heightMm = Math.max(widthMm, measuredMm);

      applyThermalPageStyle(widthMm, heightMm);

      requestAnimationFrame(() => {
        setTimeout(() => {
          window.print();
        }, 120);
      });
    },
    [data, widthMm]
  );

  const printContinuous = useCallback(() => {
    if (!data || !containerRef.current) return;
    setIsContinuous(true);

    const el = containerRef.current;
    const rect = el.getBoundingClientRect();
    const heightPx = Math.max(el.scrollHeight, el.offsetHeight, rect.height);
    const measuredMm = Math.ceil((heightPx * 25.4) / 96) + 2;
    const heightMm = Math.max(widthMm, measuredMm);

    applyContinuousPrintStyle(widthMm, heightMm);

    requestAnimationFrame(() => {
      setTimeout(() => {
        window.print();
      }, 120);
    });
  }, [data, widthMm]);

  // Handle afterprint events to advance sequential printing
  useEffect(() => {
    function handleAfterPrint() {
      const idx = currentTicketIndexRef.current;
      const total = ticketsCountRef.current;

      setPrintedIndices((prev) => (prev.includes(idx) ? prev : [...prev, idx]));

      if (isAutoPrintingRef.current && idx < total - 1) {
        // Advance to next ticket
        const nextIdx = idx + 1;
        setCurrentTicketIndex(nextIdx);

        // Allow DOM to update, then measure and print next ticket
        setTimeout(() => {
          const nextEl = ticketRefs.current.get(nextIdx);
          if (nextEl) {
            const rect = nextEl.getBoundingClientRect();
            const heightPx = Math.max(nextEl.scrollHeight, nextEl.offsetHeight, rect.height);
            const measuredMm = Math.ceil((heightPx * 25.4) / 96) + 1.5;
            const heightMm = Math.max(widthMm, measuredMm);
            applyThermalPageStyle(widthMm, heightMm);

            setTimeout(() => {
              window.print();
            }, 120);
          }
        }, 200);
      } else {
        // Finished all tickets
        setIsPrintingDone(true);
        isAutoPrintingRef.current = false;
        if (typeof window !== "undefined" && window.opener) {
          setTimeout(() => {
            window.close();
          }, 600);
        }
      }
    }

    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, [widthMm]);

  // Initial trigger for ticket 0
  useEffect(() => {
    if (!data || printCount === null || tickets.length === 0) return;
    let cancelled = false;

    const startPrinting = () => {
      if (cancelled) return;
      const el = ticketRefs.current.get(0);
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const heightPx = Math.max(el.scrollHeight, el.offsetHeight, rect.height);
      const measuredMm = Math.ceil((heightPx * 25.4) / 96) + 1.5;
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
            setTimeout(startPrinting, 120);
          });
        })
        .catch(() => {
          setTimeout(startPrinting, 200);
        });
    } else {
      setTimeout(startPrinting, 200);
    }

    return () => {
      cancelled = true;
    };
  }, [data, printCount, tickets.length, widthMm]);

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
            <h2 className="text-sm font-semibold text-ink">Thermal Printing Control</h2>
            <p className="text-xs text-ink-muted">
              {isPrintingDone
                ? "✓ All receipts printed and cut!"
                : `Printing ticket ${currentTicketIndex + 1} of ${tickets.length}: ${tickets[currentTicketIndex]?.name}`}
            </p>
          </div>
          <span className="rounded bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
            {is58mm ? "58mm Roll" : "80mm Roll"}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              isAutoPrintingRef.current = true;
              setIsPrintingDone(false);
              printSingleTicket(0);
            }}
            className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
          >
            🖨 Print All Sequentially (Cut Each)
          </button>
          <button
            onClick={() => printContinuous()}
            className="rounded border border-border-strong bg-surface-raised px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface"
          >
            📄 Print Continuous Roll (Single Cut)
          </button>
        </div>

        {/* Individual ticket reprint pills */}
        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-1.5 text-xs font-medium text-ink-muted">Reprint single ticket:</p>
          <div className="flex flex-wrap gap-1.5">
            {tickets.map((t, idx) => (
              <button
                key={t.id}
                onClick={() => {
                  isAutoPrintingRef.current = false;
                  printSingleTicket(idx);
                }}
                className={`rounded px-2 py-1 text-xs transition ${
                  currentTicketIndex === idx && !isPrintingDone
                    ? "bg-accent text-white font-medium"
                    : printedIndices.includes(idx)
                    ? "bg-success/15 text-success hover:bg-success/25"
                    : "border border-border text-ink hover:bg-surface-raised"
                }`}
              >
                {printedIndices.includes(idx) && "✓ "}
                {t.type === "delivery-note" ? "Bill" : `KOT ${idx}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Ticket Rendering Area */}
      <div ref={containerRef} className="thermal-print-container">
        {tickets.map((ticket, index) => {
          const isActive = currentTicketIndex === index;
          return (
            <div key={ticket.id}>
              {/* Cut guide shown between tickets only in continuous mode */}
              {index > 0 && (
                <div
                  className={`thermal-cut-guide ${
                    isContinuous ? "block" : "hidden"
                  } no-print my-4 border-t-2 border-dashed border-ink/40 py-2 text-center text-xs font-bold text-ink`}
                >
                  ✂ - - - - - - CUT HERE - - - - - - ✂
                </div>
              )}

              <div
                ref={(node) => {
                  if (node) ticketRefs.current.set(index, node);
                  else ticketRefs.current.delete(index);
                }}
                className={`thermal-ticket-item ${isActive ? "is-active-print" : ""}`}
              >
                {ticket.type === "delivery-note" ? (
                  <DeliveryNote data={data} printCount={printCount} />
                ) : (
                  <PickingSlip
                    data={data}
                    lines={ticket.lines}
                    ticketLabel={ticket.ticketLabel}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
