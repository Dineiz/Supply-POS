"use client";

import { Button } from "@/components/ui/button";

export function ReportToolbar({
  onPrint,
  onPdf,
  onExcel,
  disabled,
}: {
  onPrint: () => void;
  onPdf: () => void;
  onExcel: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <Button variant="secondary" onClick={onPrint} disabled={disabled}>
        Print
      </Button>
      <Button variant="secondary" onClick={onPdf} disabled={disabled}>
        Download PDF
      </Button>
      <Button variant="secondary" onClick={onExcel} disabled={disabled}>
        Download Excel
      </Button>
    </div>
  );
}
