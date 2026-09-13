import type { DateRange } from "@/components/filters/date-preset-filter";

export const DEFAULT_PAGE_SIZE = 25;

export interface ListResponse<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function buildListQuery(params: { range?: DateRange | null; page: number; pageSize?: number }): string {
  const sp = new URLSearchParams();
  if (params.range) {
    sp.set("from", params.range.from);
    sp.set("to", params.range.to);
  }
  sp.set("page", String(params.page));
  sp.set("pageSize", String(params.pageSize ?? DEFAULT_PAGE_SIZE));
  return sp.toString();
}
