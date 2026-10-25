"use client";

import { useEffect, useState, useRef } from "react";
import { DeliveryNote } from "./delivery-note";
import { PickingSlip } from "./picking-slip";
import { authFetch, ApiError } from "@/lib/api";
import { getToken } from "@/lib/session";
import type { PrintData } from "@/lib/types";

async function waitForImagesAndFonts(els: HTMLElement[]): Promise<void> {
  const imgs: HTMLImageElement[] = [];
  els.forEach((el) => {
    imgs.push(...Array.from(el.querySelectorAll("img")));
  });

  const imgPromises = imgs.map(
    (img) =>
      new Promise<void>((resolve) => {
        if (img.complete && img.naturalHeight !== 0) {
          resolve();
        } else {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        }
      })
  );

  const fontPromise =
    typeof document !== "undefined" && "fonts" in document
      ? document.fonts.ready
      : Promise.resolve();

  await Promise.all([...imgPromises, fontPromise]);
}

/**
 * Measures every ticket element and injects uniform dynamic @page size rules.
 * This guarantees the sales receipt is printed cleanly on a single continuous page
 * without breaking mid-receipt, while giving each ticket its own clean page.
 */
function injectTicketStyles(els: HTMLElement[], widthMm: number) {
  if (typeof document === "undefined") return;

  const heightsMm = els.map((el) => {
    const receipt = el.querySelector<HTMLElement>(".receipt") ?? el;
    const heightPx = Math.max(receipt.scrollHeight, receipt.offsetHeight, receipt.getBoundingClientRect().height);
    // Add 12mm buffer for Urdu Nastaliq line-height expansion, font-hinting, sub-pixel rounding, and bottom margins
    const rawMm = Math.ceil((heightPx * 25.4) / 96) + 12;
    // CRITICAL: height must always be > width or Chrome rotates the page to landscape.
    return Math.max(widthMm + 10, rawMm);
  });
  const heightMm = Math.max(...heightsMm);

  let css = `@media print {\n`;
  css += `  html, body { margin:0!important; padding:0!important; background:transparent!important; }\n`;
  css += `  .no-print { display:none!important; }\n`;
  css += `  .receipt-preview { padding:0!important; margin:0!important; background:transparent!important; overflow:visible!important; }\n`;
  css += `  .receipt { box-shadow:none!important; border:none!important; overflow:visible!important; break-inside:avoid!important; page-break-inside:avoid!important; }\n`;
  css += `  @page { size:${widthMm}mm ${heightMm}mm; margin:0; }\n`;
  css += `  @page ticket { size:${widthMm}mm ${heightMm}mm; margin:0; }\n`;

  els.forEach((el, i) => {
    css += `  .print-ticket-${i} {\n`;
    css += `    page: ticket;\n`;
    css += `    break-inside: avoid;\n`;
    css += `    page-break-inside: avoid;\n`;
    if (i > 0) {
      // Force a new physical page (= printer cut) before every ticket except the first
      css += `    break-before: page;\n`;
      css += `    page-break-before: always;\n`;
    }
    css += `  }\n`;
  });

  css += `}\n`;

  let style = document.getElementById("thermal-css") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "thermal-css";
    document.head.appendChild(style);
  }
  style.innerHTML = css;
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

  function collectTickets(): HTMLElement[] {
    const els: HTMLElement[] = [];
    let i = 0;
    while (ticketRefs.current.has(i)) {
      els.push(ticketRefs.current.get(i)!);
      i++;
    }
    return els;
  }

  /* ── collect refs, size the page, print ── */
  async function triggerPrint(pd: PrintData) {
    const widthMm = pd.warehouse.receiptPaperWidth === "58mm" ? 58 : 80;
    const els = collectTickets();
    if (els.length === 0) return; // DOM not ready yet

    await waitForImagesAndFonts(els);

    requestAnimationFrame(() => {
      injectTicketStyles(els, widthMm);
      requestAnimationFrame(() => {
        setTimeout(() => window.print(), 200);
      });
    });
  }

  /* ── auto-print once data and elements are ready ── */
  useEffect(() => {
    if (!data || printCount === null) return;
    const pd = data;

    const t = setTimeout(() => {
      triggerPrint(pd);
    }, 200);

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
  // Ticket 0: The Delivery Note / Sales Receipt (always a single, complete slip)
  // Ticket 1..N: Warehouse KOT slip(s)
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
