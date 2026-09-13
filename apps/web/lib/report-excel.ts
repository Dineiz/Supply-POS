import * as XLSX from "xlsx";

export interface ExcelSheet {
  name: string;
  rows: (string | number)[][];
}

/** Built in memory and handed straight to the browser -- never uploaded anywhere. */
export function exportReportExcel(filename: string, sheets: ExcelSheet[]): void {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}
