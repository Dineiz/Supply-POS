import { Decimal } from "decimal.js";

export interface ReturnableLine {
  /** IssueLine id. */
  id: string;
  issueId: string;
  /** Quantity still returnable on that line: delivered qty minus what was already returned. */
  remainingQty: Decimal.Value;
}

export interface ReturnAllocation {
  issueLineId: string;
  issueId: string;
  qty: Decimal;
}

/**
 * Spreads a returned quantity over delivery lines, in the order given, never
 * taking more from a line than it still has. Callers pass the lines most
 * relevant first (the customer's most recent delivery of that item), so a
 * return counts against the delivery the customer most likely means.
 *
 * Whatever the lines cannot absorb comes back as `unallocated`: the customer is
 * returning more than the delivery records show, and that part stays an
 * ad-hoc return tied to no delivery.
 */
export function allocateReturnQty(
  qty: Decimal.Value,
  candidates: ReturnableLine[]
): { allocations: ReturnAllocation[]; unallocated: Decimal } {
  let left = new Decimal(qty);
  const allocations: ReturnAllocation[] = [];

  for (const c of candidates) {
    if (left.lte(0)) break;
    const remaining = new Decimal(c.remainingQty);
    if (remaining.lte(0)) continue;
    const take = Decimal.min(left, remaining);
    allocations.push({ issueLineId: c.id, issueId: c.issueId, qty: take });
    left = left.minus(take);
  }

  return { allocations, unallocated: Decimal.max(left, 0) };
}
