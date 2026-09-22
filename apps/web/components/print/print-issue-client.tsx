"use client";

import { useEffect, useState, useRef } from "react";
import { DeliveryNote } from "./delivery-note";
import { PickingSlip } from "./picking-slip";
import { authFetch, ApiError } from "@/lib/api";
import { getToken } from "@/lib/session";
import type { PrintData } from "@/lib/types";

export function PrintIssueClient({ issueId }: { issueId: string }) {
  const [data, setData] = useState<PrintData | null>(null);
  const [printCount, setPrintCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dynamicPrintCss, setDynamicPrintCss] = useState<string>("");
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

  useEffect(() => {
    if (!data || printCount === null) return;
    let cancelled = false;

    const is58mm = data.warehouse.receiptPaperWidth === "58mm";
    const widthMm = is58mm ? 58 : 80;

    const measureAndPrint = () => {
      if (cancelled) return;
      if (!containerRef.current) return;

      const ticketEls = containerRef.current.querySelectorAll<HTMLElement>(".print-ticket-page");
      if (ticketEls.length === 0) return;

      let css = `@media print {\n`;
      css += `  @page { margin: 0; }\n`;
      css += `  html, body { margin: 0; padding: 0; background: transparent; }\n`;
      css += `  .no-print { display: none !important; }\n`;
      css += `  .receipt-preview { padding: 0; margin: 0; background: transparent; }\n`;

      ticketEls.forEach((el, index) => {
        const rect = el.getBoundingClientRect();
        const heightPx = Math.max(el.scrollHeight, el.offsetHeight, rect.height);
        // Convert px to mm: px * 25.4 / 96 + 1.5mm subpixel buffer
        const rawHeightMm = Math.ceil((heightPx * 25.4) / 96) + 1.5;
        // CRITICAL: Height must be at least widthMm (80mm for 80mm roll, 58mm for 58mm roll)
        // If width > height, Chrome and Windows GDI automatically classify the page as LANDSCAPE
        // and rotate the print 90 degrees sideways! Keeping height >= width guarantees PORTRAIT!
        const heightMm = Math.max(widthMm, rawHeightMm);
        const pageName = `ticketPage${index}`;

        css += `  @page ${pageName} {\n`;
        css += `    size: ${widthMm}mm ${heightMm}mm;\n`;
        css += `    margin: 0;\n`;
        css += `  }\n`;
        css += `  .ticket-page-${index} {\n`;
        css += `    page: ${pageName};\n`;
        if (index > 0) {
          css += `    break-before: page;\n`;
          css += `    page-break-before: always;\n`;
        }
        css += `    break-inside: avoid;\n`;
        css += `    page-break-inside: avoid;\n`;
        css += `  }\n`;
      });

      css += `}\n`;
      setDynamicPrintCss(css);

      requestAnimationFrame(() => {
        setTimeout(() => {
          if (!cancelled) {
            window.print();
          }
        }, 150);
      });
    };

    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready
        .then(() => {
          requestAnimationFrame(() => {
            setTimeout(measureAndPrint, 120);
          });
        })
        .catch(() => {
          setTimeout(measureAndPrint, 250);
        });
    } else {
      setTimeout(measureAndPrint, 250);
    }

    return () => {
      cancelled = true;
    };
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

  return (
    <div ref={containerRef} className={`receipt-preview ${paperClass}`}>
      {dynamicPrintCss ? (
        <style dangerouslySetInnerHTML={{ __html: dynamicPrintCss }} />
      ) : (
        <style
          dangerouslySetInnerHTML={{
            __html: `@media print { @page { margin: 0; } html, body { margin: 0; padding: 0; } }`,
          }}
        />
      )}
      <div className="no-print mb-4 flex items-center justify-center gap-2">
        <button
          onClick={() => window.print()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Print again
        </button>
      </div>

      <div className="print-ticket-page ticket-page-0">
        <DeliveryNote data={data} printCount={printCount} />
      </div>

      {data.warehouse.printMultipleTickets ? (
        data.issue.lines.map((line, i) => (
          <div key={line.id} className={`print-ticket-page ticket-page-${i + 1}`}>
            <PickingSlip
              data={data}
              lines={[line]}
              ticketLabel={`KOT ${i + 1} OF ${data.issue.lines.length}`}
            />
          </div>
        ))
      ) : (
        <div className="print-ticket-page ticket-page-1">
          <PickingSlip data={data} />
        </div>
      )}
    </div>
  );
}
