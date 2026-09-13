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
      const timer = setTimeout(() => window.print(), 150);
      return () => clearTimeout(timer);
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

  return (
    <div className="receipt-preview">
      <div className="no-print mb-4 flex justify-center">
        <button
          onClick={() => window.print()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Print again
        </button>
      </div>
      <DeliveryNote data={data} printCount={printCount} />
      {data.warehouse.printMultipleTickets ? (
        data.issue.lines.map((line, i) => (
          <div key={line.id}>
            <div style={{ height: "8mm" }} />
            <PickingSlip
              data={data}
              lines={[line]}
              ticketLabel={`TICKET ${i + 1} OF ${data.issue.lines.length}`}
            />
          </div>
        ))
      ) : (
        <>
          <div style={{ height: "8mm" }} />
          <PickingSlip data={data} />
        </>
      )}
    </div>
  );
}
