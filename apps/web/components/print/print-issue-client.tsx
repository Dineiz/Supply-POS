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

// -------------------------------------------------------------------
// Measure every ticket element and generate one shared @page size for the
// whole job. Real printers (as opposed to "Save as PDF") print a single
// physical paper size per job — Windows has no concept of a different page
// length mid-job, so a distinct @page size per ticket is silently ignored
// once a real printer is selected, and the job falls back to whatever
// length happens to be selected in the driver's paper-size list. If that
// length is shorter than a ticket's content, that ticket's tail spills
// onto an extra physical sheet instead of being cut cleanly — e.g. picking
// an 80x210mm media size for a ~227mm bill produces a wasted 3rd sheet,
// while 80x297mm fits it on one. Sizing every ticket's page to the same
// height (the tallest ticket in this job) keeps every ticket on exactly
// one sheet regardless of which of the driver's fixed lengths gets picked,
// as long as it's tall enough — see the on-screen fallback note below.
// -------------------------------------------------------------------
function injectTicketStyles(els: HTMLElement[], widthMm: number) {
  if (typeof document === "undefined") return;

  const heightsMm = els.map((el) => {
    const heightPx = Math.max(el.scrollHeight, el.offsetHeight, el.getBoundingClientRect().height);
    // heightPx is measured while the ticket still has on-screen padding (@media screen:
    // 4mm top + 4mm bottom for 80mm paper, 3mm+3mm for 58mm), which is taller than the
    // @media print padding actually used when this prints (2mm+1mm / 2mm+1mm). That gap
    // alone already over-estimates by ~5mm, so an 8mm buffer is enough slack for print
    // rendering/font-hinting variance without padding every ticket with dead paper.
    const rawMm = Math.ceil((heightPx * 25.4) / 96) + 8;
    // CRITICAL: height must always be > width or Chrome rotates the page to landscape.
    // Enforce a portrait minimum of widthMm + 10mm.
    return Math.max(widthMm + 10, rawMm);
  });
  const heightMm = Math.max(...heightsMm);

  let css = `@media print {\n`;
  css += `  html, body { margin:0!important; padding:0!important; background:transparent!important; }\n`;
  css += `  .no-print { display:none!important; }\n`;
  css += `  .receipt-preview { padding:0!important; margin:0!important; background:transparent!important; }\n`;
  css += `  .receipt { box-shadow:none!important; border:none!important; break-inside:avoid!important; page-break-inside:avoid!important; }\n`;

  // size: <width> <height> — width first, height second.
  // Because heightMm > widthMm, Chrome treats this as portrait.
  css += `  @page ticket { size:${widthMm}mm ${heightMm}mm; margin:0; }\n`;

  els.forEach((el, i) => {
    css += `  .print-ticket-${i} {\n`;
    css += `    page: ticket;\n`;
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
  async function triggerPrint(pd: PrintData) {
    const widthMm = pd.warehouse.receiptPaperWidth === "58mm" ? 58 : 80;
    const els: HTMLElement[] = [];
    let i = 0;
    while (ticketRefs.current.has(i)) {
      els.push(ticketRefs.current.get(i)!);
      i++;
    }
    if (els.length === 0) return; // DOM not ready yet

    await waitForImagesAndFonts(els);

    requestAnimationFrame(() => {
      injectTicketStyles(els, widthMm);
      requestAnimationFrame(() => {
        setTimeout(() => window.print(), 150);
      });
    });
  }

  /* ── auto-print when data arrives ── */
  useEffect(() => {
    if (!data || printCount === null) return;
    const pd = data;

    const t = setTimeout(() => {
      triggerPrint(pd);
    }, 150);

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
  // Index 0 = Delivery Note / Bill (with Dineiz footer)
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
