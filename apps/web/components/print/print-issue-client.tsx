"use client";

import { useEffect, useState, useRef } from "react";
import { DeliveryNote } from "./delivery-note";
import { PickingSlip } from "./picking-slip";
import { authFetch, ApiError } from "@/lib/api";
import { getToken } from "@/lib/session";
import type { PrintData } from "@/lib/types";

// -------------------------------------------------------------------
// Measure every ticket element and generate a named @page rule for each
// so each page is exactly as tall as its content — no trailing blank paper.
// -------------------------------------------------------------------
function injectTicketStyles(els: HTMLElement[], widthMm: number) {
  if (typeof document === "undefined") return;

  let css = `@media print {\n`;
  css += `  html, body { margin:0!important; padding:0!important; background:transparent!important; }\n`;
  css += `  .no-print { display:none!important; }\n`;
  css += `  .receipt-preview { padding:0!important; margin:0!important; background:transparent!important; }\n`;
  css += `  .receipt { box-shadow:none!important; border:none!important; }\n`;

  els.forEach((el, i) => {
    const heightPx = Math.max(el.scrollHeight, el.offsetHeight);
    // add 4 mm safety so content never clips at the edge
    const heightMm = Math.ceil((heightPx * 25.4) / 96) + 4;
    const name = `tkt${i}`;

    css += `  @page ${name} { size:${widthMm}mm ${heightMm}mm; margin:0; }\n`;
    css += `  .print-ticket-${i} {\n`;
    css += `    page: ${name};\n`;
    if (i > 0) {
      // force a new physical page (= printer cut) before every ticket except the first
      css += `    break-before: page;\n`;
      css += `    page-break-before: always;\n`;
    }
    css += `    break-inside: avoid;\n`;
    css += `    page-break-inside: avoid;\n`;
    css += `  }\n`;
  });

  css += `}\n`;

  let el = document.getElementById("thermal-css") as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = "thermal-css";
    document.head.appendChild(el);
  }
  el.innerHTML = css;
}

// -------------------------------------------------------------------

export function PrintIssueClient({ issueId }: { issueId: string }) {
  const [data, setData]             = useState<PrintData | null>(null);
  const [printCount, setPrintCount] = useState<number | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [done, setDone]             = useState(false);

  // One ref-slot per ticket (index → DOM element)
  const ticketRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  /* ── close tab after printing ── */
  useEffect(() => {
    function onAfter() {
      setDone(true);
      if (window.opener) setTimeout(() => window.close(), 600);
    }
    window.addEventListener("afterprint", onAfter);
    return () => window.removeEventListener("afterprint", onAfter);
  }, []);

  /* ── load data ── */
  useEffect(() => {
    if (!getToken()) {
      setError("Sign in first, then reopen this print link.");
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const pd = await authFetch<PrintData>(`/issues/${issueId}/print-data`);
        const cr = await authFetch<{ printCount: number }>(
          `/issues/${issueId}/print`,
          { method: "POST" }
        );
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

  /* ── collect refs, measure, inject styles, print ── */
  function triggerPrint(pd: PrintData) {
    const widthMm = pd.warehouse.receiptPaperWidth === "58mm" ? 58 : 80;
    const els: HTMLElement[] = [];
    let i = 0;
    while (ticketRefs.current.has(i)) {
      els.push(ticketRefs.current.get(i)!);
      i++;
    }
    if (els.length === 0) return; // DOM not ready yet
    injectTicketStyles(els, widthMm);
    requestAnimationFrame(() => setTimeout(() => window.print(), 120));
  }

  /* ── auto-print when data arrives ── */
  useEffect(() => {
    if (!data || printCount === null) return;
    const pd = data;

    const go = () => triggerPrint(pd);

    const t = setTimeout(() => {
      if (typeof document !== "undefined" && "fonts" in document) {
        document.fonts.ready.then(go).catch(go);
      } else {
        go();
      }
    }, 250); // wait for React to paint all ticket divs

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, printCount]);

  /* ── render ── */
  if (error)
    return (
      <div className="p-6 text-center text-sm text-danger">
        <p>{error}</p>
      </div>
    );

  if (!data || printCount === null)
    return <p className="p-6 text-center text-sm text-ink-muted">Preparing receipt…</p>;

  const is58mm    = data.warehouse.receiptPaperWidth === "58mm";
  const paperClass = is58mm ? "paper-58mm" : "paper-80mm";

  // ── Build the ordered list of ticket nodes ──────────────────────
  // Index 0 = Delivery Note / Bill
  // Index 1..N = Warehouse KOT slip(s)
  const tickets: { id: string; node: React.ReactNode }[] = [];

  tickets.push({
    id: "bill",
    node: <DeliveryNote data={data} printCount={printCount} />,
  });

  if (data.warehouse.printMultipleTickets) {
    data.issue.lines.forEach((line, i) => {
      tickets.push({
        id: `kot-${line.id}`,
        node: (
          <PickingSlip
            data={data}
            lines={[line]}
            ticketLabel={`KOT ${i + 1} / ${data.issue.lines.length}`}
          />
        ),
      });
    });
  } else {
    tickets.push({
      id: "kot",
      node: <PickingSlip data={data} />,
    });
  }

  return (
    <div className={`receipt-preview ${paperClass}`}>

      {/* ── on-screen panel — hidden when printing ── */}
      <div className="no-print mx-auto mb-4 max-w-xs rounded-lg border border-border bg-surface p-3 shadow-sm text-center">
        <p className="mb-2 text-xs text-ink-muted">
          {done
            ? `✓ Printed ${tickets.length} slip${tickets.length > 1 ? "s" : ""}.`
            : "Opening print dialog…"}
        </p>
        <button
          onClick={() => triggerPrint(data)}
          className="rounded bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
        >
          🖨 Print Again
        </button>
      </div>

      {/* ── ticket pages ── */}
      {tickets.map(({ id, node }, i) => (
        <div
          key={id}
          className={`print-ticket-${i}`}
          ref={(el) => {
            if (el) ticketRefs.current.set(i, el);
            else ticketRefs.current.delete(i);
          }}
        >
          {node}
        </div>
      ))}
    </div>
  );
}
