"use client";

import { useEffect, useState } from "react";
import { DeliveryNote } from "./delivery-note";
import { PickingSlip } from "./picking-slip";
import { authFetch, ApiError } from "@/lib/api";
import { getToken } from "@/lib/session";
import type { PrintData } from "@/lib/types";

function injectPrintStyle(widthMm: number) {
  if (typeof document === "undefined") return;
  let el = document.getElementById("thermal-css") as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = "thermal-css";
    document.head.appendChild(el);
  }
  // size: Xmm auto — tells Chrome the roll is exactly as tall as the content
  el.innerHTML = `
@media print {
  @page {
    size: ${widthMm}mm auto;
    margin: 0;
  }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: transparent !important;
    width: ${widthMm}mm !important;
  }
  .no-print { display: none !important; }
  .receipt-preview {
    padding: 0 !important;
    margin: 0 !important;
    background: transparent !important;
  }
  /* never force a page break inside a receipt or between receipts */
  .receipt {
    box-shadow: none !important;
    border: none !important;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  /* remove the screen-only border/shadow from the preview wrapper */
  .receipt-preview > * { background: transparent !important; }
}`;
}

export function PrintIssueClient({ issueId }: { issueId: string }) {
  const [data, setData]           = useState<PrintData | null>(null);
  const [printCount, setPrintCount] = useState<number | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [done, setDone]           = useState(false);

  /* ── close tab after printing ── */
  useEffect(() => {
    function onAfter() {
      setDone(true);
      if (window.opener) setTimeout(() => window.close(), 600);
    }
    window.addEventListener("afterprint", onAfter);
    return () => window.removeEventListener("afterprint", onAfter);
  }, []);

  /* ── load data then auto-print ── */
  useEffect(() => {
    if (!getToken()) {
      setError("Sign in first, then reopen this print link.");
      return;
    }
    let cancelled = false;

    async function load() {
      try {
        const pd = await authFetch<PrintData>(`/issues/${issueId}/print-data`);
        const cr = await authFetch<{ printCount: number }>(`/issues/${issueId}/print`, {
          method: "POST",
        });
        if (cancelled) return;
        setData(pd);
        setPrintCount(cr.printCount);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof ApiError ? e.message : "Could not load this receipt.");
      }
    }
    load();
    return () => { cancelled = true; };
  }, [issueId]);

  /* ── trigger print once data is ready ── */
  useEffect(() => {
    if (!data || printCount === null) return;
    const widthMm = data.warehouse.receiptPaperWidth === "58mm" ? 58 : 80;
    injectPrintStyle(widthMm);

    // Wait for fonts + layout before opening the dialog
    const go = () => requestAnimationFrame(() => setTimeout(() => window.print(), 150));

    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(go).catch(go);
    } else {
      setTimeout(go, 300);
    }
  }, [data, printCount]);

  /* ── render ── */
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

  const is58mm    = data.warehouse.receiptPaperWidth === "58mm";
  const paperClass = is58mm ? "paper-58mm" : "paper-80mm";
  const widthMm   = is58mm ? 58 : 80;

  function reprint() {
    injectPrintStyle(widthMm);
    requestAnimationFrame(() => setTimeout(() => window.print(), 80));
  }

  return (
    <div className={`receipt-preview ${paperClass}`}>

      {/* ── on-screen only — hidden when printing ── */}
      <div className="no-print mx-auto mb-4 max-w-xs rounded-lg border border-border bg-surface p-3 shadow-sm text-center">
        <p className="mb-2 text-xs text-ink-muted">
          {done ? "✓ Printed. Reprint below if needed." : "Print dialog opened…"}
        </p>
        <button
          onClick={reprint}
          className="rounded bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
        >
          🖨 Print Again
        </button>
      </div>

      {/* ══ RECEIPT 1 — Customer Delivery Note ══ */}
      <DeliveryNote data={data} printCount={printCount} />

      {/* ── tear / cut line between the two receipts ── */}
      <div className="cut-separator">
        <hr className="rule-cut" />
        <p className="bold center" style={{ fontSize: "9px", margin: "0.5mm 0", letterSpacing: "1px" }}>
          ✂ ─ ─ ─ CUT HERE (WAREHOUSE) ─ ─ ─ ✂
        </p>
        <hr className="rule-cut" />
      </div>

      {/* ══ RECEIPT 2 — Warehouse Slip / KOT ══ */}
      {data.warehouse.printMultipleTickets ? (
        data.issue.lines.map((line, i) => (
          <div key={line.id}>
            {i > 0 && (
              <div className="cut-separator">
                <hr className="rule-cut" />
                <p className="bold center" style={{ fontSize: "9px", margin: "0.5mm 0", letterSpacing: "1px" }}>
                  ✂ ─ ─ ─ NEXT TICKET ─ ─ ─ ✂
                </p>
                <hr className="rule-cut" />
              </div>
            )}
            <PickingSlip
              data={data}
              lines={[line]}
              ticketLabel={`KOT ${i + 1} / ${data.issue.lines.length}`}
            />
          </div>
        ))
      ) : (
        <PickingSlip data={data} />
      )}
    </div>
  );
}
