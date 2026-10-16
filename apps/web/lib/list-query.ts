import type { DateRange } from "@/lib/period";

export const DEFAULT_PAGE_SIZE = 25;

export interface ListResponse<T, S = undefined> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  /** Totals across the whole filtered set, not just this page. */
  summary: S;
}

export function buildListQuery(params: {
  range?: DateRange | null;
  page: number;
  pageSize?: number;
  q?: string;
}): string {
  const sp = new URLSearchParams();
  if (params.range) {
    sp.set("from", params.range.from);
    sp.set("to", params.range.to);
  }
  if (params.q?.trim()) sp.set("q", params.q.trim());
  sp.set("page", String(params.page));
  sp.set("pageSize", String(params.pageSize ?? DEFAULT_PAGE_SIZE));
  return sp.toString();
}
