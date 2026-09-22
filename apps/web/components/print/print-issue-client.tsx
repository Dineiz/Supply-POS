"use client";

import { useEffect, useState, useRef } from "react";
import { DeliveryNote } from "./delivery-note";
import { PickingSlip } from "./picking-slip";
import { authFetch, ApiError } from "@/lib/api";
import { getToken } from "@/lib/session";
import type { PrintData } from "@/lib/types";

// ---------- helpers ----------

function setPageStyle(widthMm: number, heightMm: number, activeJob: "bill" | "kot") {
  if (typeof document === "undefined") return;
  let el = document.getElementById("dynamic-print-css") as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = "dynamic-print-css";
    document.head.appendChild(el);
  }
  el.innerHTML = `
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
  .no-print { display: none !important; }
  .receipt-preview { padding: 0 !important; margin: 0 !important; background: transparent !important; }
  /* Hide whichever job is NOT printing */
  ${activeJob === "bill" ? ".kot-job" : ".bill-job"} { display: none !important; }
}`;
}

function measureEl(el: HTMLElement): number {
  // Force layout, then read scrollHeight which is the true content height
  return Math.max(el.scrollHeight, el.offsetHeight);
}

// ---------- component ----------

export function PrintIssueClient({ issueId }: { issueId: string }) {
  const [data, setData] = useState<PrintData | null>(null);
  const [printCount, setPrintCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which job is currently active: 0 = bill, 1 = kot, 2 = done
  const [job, setJob] = useState(0);
  const [status, setStatus] = useState("Loading…");

  const billRef = useRef<HTMLDivElement>(null);
  const kotRef = useRef<HTMLDivElement>(null);
  const widthMmRef = useRef(80);
  const jobRef = useRef(0); // shadow ref so afterprint handler always reads fresh value
  const dataRef = useRef<PrintData | null>(null);

  // ---------- data load ----------
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
        dataRef.current = printData;
        setData(printData);
        setPrintCount(countResult.printCount);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof ApiError ? err.message : "Could not load this receipt.");
      }
    }
    load();
    return () => { cancelled = true; };
  }, [issueId]);

  // ---------- auto-print trigger once data is ready ----------
  useEffect(() => {
    if (!data || printCount === null) return;
    const d = data;
    widthMmRef.current = d.warehouse.receiptPaperWidth === "58mm" ? 58 : 80;
    // give React one frame to paint both job divs, then start job 0
    const t = setTimeout(() => startJob(0), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, printCount]);

  // ---------- afterprint: advance to next job ----------
  useEffect(() => {
    function onAfterPrint() {
      const currentJob = jobRef.current;
      if (currentJob === 0) {
        // Bill done → print KOT
        startJob(1);
      } else {
        // All done
        setJob(2);
        setStatus("✓ All receipts printed.");
        if (typeof window !== "undefined" && window.opener) {
          setTimeout(() => window.close(), 800);
        }
      }
    }
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- print one job ----------
  function startJob(jobIndex: 0 | 1) {
    jobRef.current = jobIndex;
    setJob(jobIndex);
    setStatus(jobIndex === 0 ? "Printing bill…" : "Printing warehouse slip / KOT…");

    const activeJob = jobIndex === 0 ? "bill" : "kot";
    const ref = jobIndex === 0 ? billRef : kotRef;
    const widthMm = widthMmRef.current;

    // Give DOM time to show the correct job, then measure
    setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const heightPx = measureEl(el);
      const heightMm = Math.max(widthMm, Math.ceil((heightPx * 25.4) / 96) + 4);
      setPageStyle(widthMm, heightMm, activeJob);
      requestAnimationFrame(() => {
        setTimeout(() => window.print(), 100);
      });
    }, 80);
  }

  // ---------- manual reprint buttons ----------
  function reprintBill() { startJob(0); }
  function reprintKot() { startJob(1); }

  // ---------- render ----------
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

  const is58mm = data.warehouse.receiptPaperWidth === "58mm";
  const paperClass = is58mm ? "paper-58mm" : "paper-80mm";

  return (
    <div className={`receipt-preview ${paperClass}`}>

      {/* ── On-screen panel (hidden when printing) ── */}
      <div className="no-print mx-auto mb-6 max-w-sm rounded-lg border border-border bg-surface p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink">Thermal Print</h2>
            <p className="mt-0.5 text-xs text-ink-muted">{status}</p>
          </div>
          <span className="rounded bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
            {is58mm ? "58mm" : "80mm"} Roll
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={reprintBill}
            className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
          >
            🖨 Reprint Bill
          </button>
          <button
            onClick={reprintKot}
            className="rounded border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface"
          >
            📦 Reprint Warehouse Slip
          </button>
        </div>
      </div>

      {/* ── Job 0: Delivery Note / Bill ── */}
      <div ref={billRef} className="bill-job">
        <DeliveryNote data={data} printCount={printCount} />
      </div>

      {/* ── Job 1: Warehouse Slip / KOT ── */}
      <div ref={kotRef} className="kot-job">
        {data.warehouse.printMultipleTickets ? (
          data.issue.lines.map((line, i) => (
            <PickingSlip
              key={line.id}
              data={data}
              lines={[line]}
              ticketLabel={`KOT ${i + 1} OF ${data.issue.lines.length}`}
            />
          ))
        ) : (
          <PickingSlip data={data} />
        )}
      </div>

    </div>
  );
}
