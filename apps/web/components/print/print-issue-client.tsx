"use client";

import { useEffect, useState } from "react";
import { DeliveryNote } from "./delivery-note";
import { PickingSlip } from "./picking-slip";
import { authFetch, ApiError } from "@/lib/api";
import { getToken } from "@/lib/session";
import type { PrintData } from "@/lib/types";

export function PrintIssueClient({ issueId }: { issueId: string }) {
  const [data, setData] = useState<PrintData | null>(null);
  const [printCount, setPrintCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPickingSlip, setShowPickingSlip] = useState(false);

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

  useEffect(() => {
    if (data && printCount !== null) {
      let cancelled = false;
      const triggerPrint = () => {
        if (!cancelled) {
          window.print();
        }
      };

      if (typeof document !== "undefined" && "fonts" in document) {
        document.fonts.ready
          .then(() => {
            requestAnimationFrame(() => {
              setTimeout(triggerPrint, 150);
            });
          })
          .catch(() => {
            setTimeout(triggerPrint, 250);
          });
      } else {
        const timer = setTimeout(triggerPrint, 250);
        return () => clearTimeout(timer);
      }

      return () => {
        cancelled = true;
      };
    }
  }, [data, printCount]);

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
  const pageCss = `@media print { @page { margin: 0; } html, body { margin: 0; padding: 0; } }`;

  return (
    <div className={`receipt-preview ${paperClass}`}>
      <style dangerouslySetInnerHTML={{ __html: pageCss }} />
      <div className="no-print mb-4 flex items-center justify-center gap-2">
        <button
          onClick={() => window.print()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Print receipt
        </button>
        {!data.warehouse.printMultipleTickets && (
          <button
            type="button"
            onClick={() => setShowPickingSlip((prev) => !prev)}
            className="rounded-md border border-border bg-paper px-3 py-2 text-sm font-medium text-ink hover:bg-surface"
          >
            {showPickingSlip ? "Hide picking slip" : "+ Add warehouse picking slip"}
          </button>
        )}
      </div>
      <DeliveryNote data={data} printCount={printCount} />
      {data.warehouse.printMultipleTickets ? (
        data.issue.lines.map((line, i) => (
          <div key={line.id} className="print-ticket-page">
            <PickingSlip
              data={data}
              lines={[line]}
              ticketLabel={`TICKET ${i + 1} OF ${data.issue.lines.length}`}
            />
          </div>
        ))
      ) : showPickingSlip ? (
        <div className="print-ticket-page">
          <PickingSlip data={data} />
        </div>
      ) : null}
    </div>
  );
}
