/** A last slip with fewer items than this looks like a mistake; items are pulled back onto it. */
const MIN_TAIL_ITEMS = 4;

export interface Slip {
  /** First item on the slip. */
  from: number;
  /** One past the last item on the slip. */
  to: number;
}

export interface SlipPlanInput {
  /** Height of every item row, in any one unit (the other fields use the same unit). */
  itemHeights: number[];
  /** Everything above the first item: store header, customer block, column labels. */
  topHeight: number;
  /** Everything below the last item: totals, account summary, policy, signatures, footer. */
  bottomHeight: number;
  /** The short header repeated at the top of every slip after the first. */
  continuedHeaderHeight: number;
  /** The "continued on the next slip" strip at the bottom of every slip but the last. */
  continuedFooterHeight: number;
  /** The tallest a slip may be: the length of the printer's paper. */
  capacity: number;
}

/**
 * Splits a long bill into slips that each fit the printer's paper at full size.
 *
 * A thermal driver prints on one fixed paper length and Chrome shrinks anything
 * taller to fit, which is what made 30+ item bills unreadable. Splitting at item
 * boundaries ourselves keeps every slip at full size and lets each one say which
 * bill it belongs to. Items are never cut in half, and the last slip always
 * carries the totals, so the amount due is never alone on its own slip.
 *
 * Returns a single slip covering every item when the whole bill fits.
 */
export function planReceiptSlips(input: SlipPlanInput): Slip[] {
  return balanceTail(fillSlips(input), input);
}

function fillSlips(input: SlipPlanInput): Slip[] {
  const { itemHeights, topHeight, bottomHeight, continuedHeaderHeight, continuedFooterHeight, capacity } = input;
  const count = itemHeights.length;

  // suffix[i] = height of items i..end, so "does the rest fit with the totals?" is O(1).
  const suffix = new Array<number>(count + 1).fill(0);
  for (let i = count - 1; i >= 0; i--) suffix[i] = (suffix[i + 1] ?? 0) + (itemHeights[i] ?? 0);

  const slips: Slip[] = [];
  let from = 0;
  for (;;) {
    const head = slips.length === 0 ? topHeight : continuedHeaderHeight;

    if (head + (suffix[from] ?? 0) + bottomHeight <= capacity) {
      slips.push({ from, to: count });
      return slips;
    }
    // Only reachable if the totals block alone is taller than a slip; give it a slip of its own.
    if (from >= count) {
      slips.push({ from: count, to: count });
      return slips;
    }

    const room = capacity - head - continuedFooterHeight;
    let to = from;
    let used = 0;
    while (to < count && used + (itemHeights[to] ?? 0) <= room) {
      used += itemHeights[to] ?? 0;
      to++;
    }
    // Always make progress, even if a single row is taller than the room left.
    if (to === from) to = from + 1;
    // The rows fit but the totals do not: leave the last row for the final slip so the
    // amount due is never printed alone, with nothing above it.
    if (to === count && count - from > 1) to = count - 1;

    slips.push({ from, to });
    from = to;
  }
}

/**
 * Greedy filling leaves whatever is left for the last slip, which for a bill that is only just
 * too long is a single item above the totals. Moves items back from the slip before it, as long
 * as the last slip still fits, so the split is balanced.
 */
function balanceTail(slips: Slip[], input: SlipPlanInput): Slip[] {
  const last = slips[slips.length - 1];
  const prev = slips[slips.length - 2];
  if (!last || !prev) return slips;

  const rows = (s: Slip) => input.itemHeights.slice(s.from, s.to).reduce((a, b) => a + b, 0);
  let lastRows = rows(last);
  while (last.to - last.from < MIN_TAIL_ITEMS && prev.to - prev.from > 1) {
    const moved = input.itemHeights[prev.to - 1] ?? 0;
    if (input.continuedHeaderHeight + lastRows + moved + input.bottomHeight > input.capacity) break;
    prev.to--;
    last.from--;
    lastRows += moved;
  }
  return slips;
}
