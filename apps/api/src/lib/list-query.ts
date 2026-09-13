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

export function parseListQuery(query: ListQuerystring): ParsedListQuery {
  const page = Math.max(1, Math.trunc(Number(query.page)) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(Number(query.pageSize)) || DEFAULT_PAGE_SIZE));

  let dateWhere: { gte?: Date; lte?: Date } | undefined;
  if (query.from || query.to) {
    dateWhere = {};
    // Deliberately no "Z" suffix: this parses as the server's local calendar
    // day, matching the local "today" the frontend computed the range from.
    if (query.from) dateWhere.gte = new Date(`${query.from}T00:00:00.000`);
    if (query.to) dateWhere.lte = new Date(`${query.to}T23:59:59.999`);
  }

  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize, dateWhere };
}
