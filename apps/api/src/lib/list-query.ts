import { resolveOpenRange } from "@dineiz-supply/logic";

export interface ListQuerystring {
  from?: string;
  to?: string;
  page?: string;
  pageSize?: string;
}

export interface ParsedListQuery {
  skip: number;
  take: number;
  page: number;
  pageSize: number;
  dateWhere?: { gte?: Date; lte?: Date };
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

/**
 * `from` / `to` are plain YYYY-MM-DD calendar days on the warehouse's own
 * wall clock (see ADR-009), turned into exact instants here so a 01:00 sale
 * lands on the day the shop saw it, whatever zone the server or browser is in.
 */
export function parseListQuery(query: ListQuerystring, timeZone: string): ParsedListQuery {
  const page = Math.max(1, Math.trunc(Number(query.page)) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(Number(query.pageSize)) || DEFAULT_PAGE_SIZE));

  return {
    skip: (page - 1) * pageSize,
    take: pageSize,
    page,
    pageSize,
    dateWhere: resolveOpenRange(query.from, query.to, timeZone),
  };
}
