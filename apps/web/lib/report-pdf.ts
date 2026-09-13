import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { WarehouseLetterhead } from "@/components/reports/letterhead";
import { formatDate, formatTime } from "./format";

// jspdf-autotable still sets this on the doc for convenience (v3-v5 all do);
// the public type declarations just don't carry it.
interface DocWithAutoTable extends jsPDF {
  lastAutoTable?: { finalY: number };
}

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 15;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export interface PdfReport {
  doc: DocWithAutoTable;
  cursorY: number;
}

export function startReportPdf(opts: {
  warehouse: WarehouseLetterhead | null;
  title: string;
  subtitle?: string;
  period?: string;
}): PdfReport {
  const doc = new jsPDF({ unit: "mm", format: "a4" }) as DocWithAutoTable;
  const now = new Date();
  let y = MARGIN;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(opts.warehouse?.name ?? "—", MARGIN, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(`Printed: ${formatDate(now)}  ${formatTime(now)}`, PAGE_WIDTH - MARGIN, y, { align: "right" });

  y += 5;
  const contact = [opts.warehouse?.address, opts.warehouse?.phone].filter(Boolean).join(" · ");
  if (contact) {
    doc.text(contact, MARGIN, y);
    y += 4;
  }
  if (opts.warehouse?.ntn) {
    doc.text(`NTN: ${opts.warehouse.ntn}`, MARGIN, y);
    y += 4;
  }

  y += 1;
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(opts.title, MARGIN, y);
  y += 5;

  if (opts.subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text(opts.subtitle, MARGIN, y);
    y += 4.5;
  }
  if (opts.period) {
    doc.setFontSize(8.5);
    doc.setTextColor(90);
    doc.text(opts.period, MARGIN, y);
    doc.setTextColor(0);
    y += 4.5;
  }

  y += 1;
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 5;

  return { doc, cursorY: y };
}

export function addPdfTable(
  report: PdfReport,
  opts: {
    head: string[][];
    body: (string | number)[][];
    foot?: (string | number)[][];
    columnStyles?: Record<number, { halign?: "left" | "right" | "center"; cellWidth?: number | "auto" }>;
  }
): void {
  autoTable(report.doc, {
    startY: report.cursorY,
    head: opts.head,
    body: opts.body,
    foot: opts.foot,
    margin: { left: MARGIN, right: MARGIN },
    styles: { font: "courier", fontSize: 8, cellPadding: 1.4, lineColor: 60, lineWidth: 0.1 },
    headStyles: { fillColor: [245, 245, 244], textColor: 20, fontStyle: "bold" },
    footStyles: { fillColor: [245, 245, 244], textColor: 20, fontStyle: "bold" },
    columnStyles: opts.columnStyles,
    theme: "grid",
  });
  report.cursorY = (report.doc.lastAutoTable?.finalY ?? report.cursorY) + 6;
}

export function addPdfText(
  report: PdfReport,
  text: string,
  opts?: { bold?: boolean; size?: number; gap?: number; color?: number }
): void {
  if (report.cursorY > PAGE_HEIGHT - MARGIN - 10) {
    report.doc.addPage();
    report.cursorY = MARGIN;
  }
  report.doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
  report.doc.setFontSize(opts?.size ?? 9.5);
  report.doc.setTextColor(opts?.color ?? 0);
  report.doc.text(text, MARGIN, report.cursorY);
  report.doc.setTextColor(0);
  report.cursorY += opts?.gap ?? 5;
}

export function addPdfSpace(report: PdfReport, mm: number): void {
  report.cursorY += mm;
}

export function finalizeReportPdf(report: PdfReport, filename: string): void {
  const pageCount = report.doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    report.doc.setPage(i);
    report.doc.setFont("helvetica", "normal");
    report.doc.setFontSize(8);
    report.doc.setTextColor(130);
    report.doc.text(`Page ${i} of ${pageCount}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 8, { align: "right" });
    report.doc.setTextColor(0);
  }
  report.doc.save(filename);
}

export { CONTENT_WIDTH };
