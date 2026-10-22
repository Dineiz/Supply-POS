"use client";

import { useEffect, useState, useRef } from "react";
import { DeliveryNote, type Density } from "./delivery-note";
import { PickingSlip } from "./picking-slip";
import { authFetch, ApiError } from "@/lib/api";
import { getToken } from "@/lib/session";
import { planReceiptSlips, type Slip } from "@/lib/receipt-pagination";
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
// Why the bill is laid out to the paper, not just printed.
//
// A thermal driver prints on one fixed paper length (the POS launcher asks for
// 80 x 297 mm). Chrome shrinks any page taller than that paper to fit it, so a
// 35-item bill came out at ~60% size and unreadable; the alternative, letting
// Chrome cut it wherever the paper ended, split the bill and left the totals
// alone on a second slip. So the bill is fitted to the paper length first:
//
//   1. normal layout, if the whole bill fits one sheet;
//   2. else compact (same two-line bilingual items, tighter header and spacing);
//   3. else dense (one row per item, English names);
//   4. else split into numbered slips, each full size and each carrying enough
//      to tie it to its bill, with the totals always on the last one.
//
// Every height is measured as the bill will print (print padding, no border),
// then the page is sized to the tallest ticket, never taller than the paper.
// -------------------------------------------------------------------
const MM_TO_PX = 96 / 25.4;
const mmToPx = (mm: number) => mm * MM_TO_PX;
const pxToMm = (px: number) => px / MM_TO_PX;

const DEFAULT_SHEET_MM = 297;
// Kept free below the paper length for rounding and font hinting between this measure and the print.
const SAFETY_MM = 2;
// Used to plan the first split, before a continuation header/footer has been rendered; replaced by
// the measured heights on the next pass.
const EST_CONTINUED_HEADER_MM = 20;
const EST_CONTINUED_FOOTER_MM = 6;
// If a split slip still measures too tall, replan with this much less room, up to MAX_REPLANS times.
const REPLAN_STEP_MM = 3;
const MAX_REPLANS = 4;

type Stage = Density | "split" | "ready";

interface Layout {
  stage: Stage;
  density: Density;
  /** Item ranges per slip once the bill had to be split; null while it is one slip. */
  slips: Slip[] | null;
  replans: number;
}

const INITIAL_LAYOUT: Layout = { stage: "normal", density: "normal", slips: null, replans: 0 };

const receiptOf = (ticket: HTMLElement) => ticket.querySelector<HTMLElement>(".receipt") ?? ticket;
const heightOf = (el: HTMLElement) => el.getBoundingClientRect().height;

/** Runs `measure` with the preview styled as it will print (no on-screen border or padding). */
function asPrinted<T>(root: HTMLElement | null, measure: () => T): T {
  root?.classList.add("print-metrics");
  try {
    return measure();
  } finally {
    root?.classList.remove("print-metrics");
  }
}

/** Height of one row including its margins, which the stacked rows need to add up. */
function rowHeight(el: HTMLElement) {
  const cs = getComputedStyle(el);
  return heightOf(el) + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
}

/** Everything the slip planner needs, read from the bill slips currently on screen. */
function readBillMetrics(bill: HTMLElement[]) {
  const receipts = bill.map(receiptOf);
  const rowsOf = (r: HTMLElement) => Array.from(r.querySelectorAll<HTMLElement>(".receipt-line-item"));
  const itemHeights = receipts.flatMap((r) => rowsOf(r).map(rowHeight));

  const above = (r: HTMLElement) => {
    const first = rowsOf(r)[0];
    return first ? first.getBoundingClientRect().top - r.getBoundingClientRect().top : 0;
  };
  const below = (r: HTMLElement) => {
    const rows = rowsOf(r);
    const last = rows[rows.length - 1];
    if (!last) return 0;
    const bottom = last.getBoundingClientRect().bottom + parseFloat(getComputedStyle(last).marginBottom);
    return r.getBoundingClientRect().bottom - bottom;
  };

  const firstSlip = receipts[0]!;
  const lastSlip = receipts[receipts.length - 1]!;
  const isSplit = receipts.length > 1;
  return {
    itemHeights,
    topHeight: above(firstSlip),
    // The totals block sits below the last item on the final slip.
    bottomHeight: below(lastSlip),
    continuedHeaderHeight: isSplit ? above(receipts[1]!) : mmToPx(EST_CONTINUED_HEADER_MM),
    continuedFooterHeight: isSplit ? below(firstSlip) : mmToPx(EST_CONTINUED_FOOTER_MM),
  };
}

/** One step of fitting the bill to the paper: returns the next layout, or the same one marked ready. */
function nextLayout(layout: Layout, tickets: HTMLElement[], sheetMm: number, root: HTMLElement | null): Layout {
  const capacity = mmToPx(sheetMm - SAFETY_MM);
  const bill = tickets.slice(0, layout.slips?.length ?? 1);
  const tallest = asPrinted(root, () => Math.max(...bill.map((t) => heightOf(receiptOf(t)))));

  if (tallest <= capacity) return { ...layout, stage: "ready" };
  if (layout.stage === "normal") return { stage: "compact", density: "compact", slips: null, replans: 0 };
  if (layout.stage === "compact") return { stage: "dense", density: "dense", slips: null, replans: 0 };
  if (layout.replans >= MAX_REPLANS) return { ...layout, stage: "ready" };

  const slips = asPrinted(root, () =>
    planReceiptSlips({
      ...readBillMetrics(bill),
      capacity: capacity - mmToPx(REPLAN_STEP_MM) * layout.replans,
    })
  );
  if (slips.length < 2) return { ...layout, stage: "ready" };
  return { stage: "split", density: "dense", slips, replans: layout.replans + 1 };
}

// Measure every ticket element and generate one shared @page size for the whole job.
// Real printers print a single physical paper size per job, so every ticket gets the
// height of the tallest one (never more than the paper) and exactly one sheet each.
function injectTicketStyles(els: HTMLElement[], widthMm: number, sheetMm: number, root: HTMLElement | null) {
  if (typeof document === "undefined") return;

  const tallestMm = asPrinted(root, () => Math.max(...els.map((el) => pxToMm(heightOf(receiptOf(el))))));
  // CRITICAL: height must always be > width or Chrome rotates the page to landscape.
  // Never taller than the paper: Chrome would shrink the whole page to fit it.
  const heightMm = Math.min(sheetMm, Math.max(widthMm + 10, Math.ceil(tallestMm) + 2));

  let css = `@media print {\n`;
  css += `  html, body { margin:0!important; padding:0!important; background:transparent!important; }\n`;
  css += `  .no-print { display:none!important; }\n`;
  css += `  .receipt-preview { padding:0!important; margin:0!important; background:transparent!important; }\n`;
  css += `  .receipt { box-shadow:none!important; border:none!important; }\n`;
  // A ticket taller than the paper (e.g. a long warehouse slip) flows onto the next sheet at full size.
  css += `  @page ticket { size:${widthMm}mm ${heightMm}mm; margin:0; }\n`;

  els.forEach((el, i) => {
    css += `  .print-ticket-${i} {\n`;
    css += `    page: ticket;\n`;
    if (i > 0) {
      // force a new physical page (= printer cut) before every ticket except the first
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
  const [layout, setLayout]         = useState<Layout>(INITIAL_LAYOUT);

  // One ref-slot per ticket (index → DOM element)
  const ticketRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const rootRef = useRef<HTMLDivElement>(null);

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
    const sheetMm = pd.warehouse.receiptSheetLengthMm ?? DEFAULT_SHEET_MM;
    const els = collectTickets();
    if (els.length === 0) return; // DOM not ready yet

    await waitForImagesAndFonts(els);

    requestAnimationFrame(() => {
      injectTicketStyles(els, widthMm, sheetMm, rootRef.current);
      requestAnimationFrame(() => {
        setTimeout(() => window.print(), 150);
      });
    });
  }

  /* ── fit the bill to the paper, then auto-print once it is settled ──
     Each pass renders a layout, measures it, and either moves to the next layout
     (which re-runs this effect) or, once the bill fits, prints. */
  useEffect(() => {
    if (!data || printCount === null) return;
    const pd = data;
    let cancelled = false;

    const t = setTimeout(async () => {
      const els = collectTickets();
      if (els.length === 0) return;
      await waitForImagesAndFonts(els);
      if (cancelled) return;

      if (layout.stage === "ready") {
        triggerPrint(pd);
      } else {
        const sheetMm = pd.warehouse.receiptSheetLengthMm ?? DEFAULT_SHEET_MM;
        setLayout(nextLayout(layout, els, sheetMm, rootRef.current));
      }
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, printCount, layout]);

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
  // First: the Delivery Note / Bill (one slip, or several for a long bill)
  // Then: Warehouse KOT slip(s)
  const tickets: { id: string; node: React.ReactNode }[] = [];

  if (layout.slips && layout.slips.length > 1) {
    layout.slips.forEach((s, i) => {
      tickets.push({
        id: `bill-${i}`,
        node: (
          <DeliveryNote
            data={data}
            printCount={printCount}
            density={layout.density}
            slip={{ index: i, total: layout.slips!.length, from: s.from, to: s.to }}
          />
        ),
      });
    });
  } else {
    tickets.push({
      id: "bill",
      node: <DeliveryNote data={data} printCount={printCount} density={layout.density} />,
    });
  }

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
    <div ref={rootRef} className={`receipt-preview ${paperClass}`}>

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
