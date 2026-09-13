import type { FastifyInstance } from "fastify";
import { prisma } from "@dineiz-supply/db";
import {
  Decimal,
  calculateMarginPercent,
  calculateAverageDailyUsage,
  calculateDaysOfCover,
  suggestReorderQty,
  ageLedgerDebits,
  type DailyUsage,
} from "@dineiz-supply/logic";

interface RangeQuery {
  from?: string;
  to?: string;
}

/** Defaults to the current calendar month when no range is given. */
function parseDateRange({ from, to }: RangeQuery): { from: Date; to: Date } {
  const now = new Date();
  const start = from ? new Date(`${from}T00:00:00.000Z`) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = to ? new Date(`${to}T23:59:59.999Z`) : now;
  return { from: start, to: end };
}

const REORDER_WINDOW_DAYS = 21;

/**
 * Per-day usage for the trailing window, oldest day first. A day is a
 * "stockout day" when stock was already at or below zero at the start of it
 * -- demand that day was constrained by having nothing to sell, not by lack
 * of interest, so it must not be averaged in as a real zero (see
 * calculateAverageDailyUsage).
 */
async function buildDailyUsage(
  warehouseId: string,
  itemId: string,
  currentStockQty: Decimal.Value,
  days: number
): Promise<DailyUsage[]> {
  const now = new Date();
  const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)));

  const movements = await prisma.stockMovement.findMany({
    where: { warehouseId, itemId, createdAt: { lte: now } },
    select: { type: true, qty: true, qtyBefore: true, qtyAfter: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const before = movements.filter((m) => m.createdAt < windowStart);
  const inWindow = movements.filter((m) => m.createdAt >= windowStart);

  let runningStock =
    before.length > 0
      ? new Decimal(before.at(-1)!.qtyAfter)
      : inWindow.length > 0
        ? new Decimal(inWindow.at(0)!.qtyBefore)
        : new Decimal(currentStockQty);

  const result: DailyUsage[] = [];
  for (let i = 0; i < days; i++) {
    const dayStart = new Date(windowStart);
    dayStart.setUTCDate(dayStart.getUTCDate() + i);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const todaysMovements = inWindow.filter((m) => m.createdAt >= dayStart && m.createdAt < dayEnd);
    const usageQty = todaysMovements
      .filter((m) => m.type === "ISSUE")
      .reduce((sum, m) => sum.plus(new Decimal(m.qty).abs()), new Decimal(0));

    // Only a *zero-usage* day with no stock to sell is the "not zero demand"
    // case the spec means to exclude. A day that opened at zero but still
    // saw real sales (stock arrived, or this is the item's first day) has
    // genuine usage data -- discarding it would throw away a real reading,
    // not a misleading one.
    const isStockoutDay = usageQty.lte(0) && runningStock.lte(0);

    result.push({ qty: usageQty, isStockoutDay });

    if (todaysMovements.length > 0) {
      runningStock = new Decimal(todaysMovements.at(-1)!.qtyAfter);
    }
  }
  return result;
}

export default async function reportRoutes(app: FastifyInstance) {
  const guard = { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] };

  // Trading P&L: what selling and buying actually did to the till, for a
  // period. Expenses (rent, salaries, transport, ...) are shown as a real
  // section per the brief, but honestly zeroed -- nothing in this system
  // records a petty-cash expense yet, so pretending otherwise would be
  // worse than an explicit gap note. Losses ARE real, broken out by source.
  app.get<{ Querystring: RangeQuery }>("/reports/profit-loss", guard, async (request) => {
    const warehouseId = request.user.warehouseId;
    const { from, to } = parseDateRange(request.query);
    const dateFilter = { gte: from, lte: to };

    const [issueTotals, returnTotals, wastageByAttribution, shortages] = await Promise.all([
      prisma.issue.aggregate({
        where: { warehouseId, status: "ISSUED", issuedAt: dateFilter },
        _sum: { totalAmount: true, totalCostAmount: true },
        _count: true,
      }),
      prisma.returnNote.aggregate({
        where: { warehouseId, createdAt: dateFilter },
        _sum: { totalCreditAmount: true, totalCostReversed: true },
        _count: true,
      }),
      prisma.wastage.groupBy({
        by: ["attributedTo"],
        where: { warehouseId, createdAt: dateFilter },
        _sum: { costImpact: true },
      }),
      prisma.stockAdjustment.findMany({
        where: { warehouseId, createdAt: dateFilter, variance: { lt: 0 } },
        select: { varianceValue: true },
      }),
    ]);

    const grossRevenue = new Decimal(issueTotals._sum.totalAmount ?? 0);
    const grossCogs = new Decimal(issueTotals._sum.totalCostAmount ?? 0);
    const returnsCredit = new Decimal(returnTotals._sum.totalCreditAmount ?? 0);
    // GOOD/WRONG_ITEM returns hand cost back to inventory, so they reduce COGS.
    // DAMAGED/EXPIRED returns show up below as warehouse-attributed wastage
    // via a real Wastage row -- counting them in COGS too would double it.
    const returnsCostReversed = new Decimal(returnTotals._sum.totalCostReversed ?? 0);

    const wastageSpoiled = new Decimal(wastageByAttribution.find((w) => w.attributedTo === "WAREHOUSE")?._sum.costImpact ?? 0);
    const wastageFromReturns = new Decimal(wastageByAttribution.find((w) => w.attributedTo === "CUSTOMER_RETURN")?._sum.costImpact ?? 0);
    const countShortages = shortages.reduce((sum, s) => sum.plus(new Decimal(s.varianceValue).abs()), new Decimal(0));
    const totalLosses = wastageSpoiled.plus(wastageFromReturns).plus(countShortages);
    const totalExpenses = new Decimal(0);

    const netRevenue = grossRevenue.minus(returnsCredit);
    const cogs = grossCogs.minus(returnsCostReversed);
    const grossProfit = netRevenue.minus(cogs);
    const grossMarginPercent = calculateMarginPercent(netRevenue, cogs);
    const netProfit = grossProfit.minus(totalLosses).minus(totalExpenses);
    const netMarginPercent = netRevenue.gt(0) ? netProfit.dividedBy(netRevenue).times(100) : new Decimal(0);

    const per100 = (value: Decimal) => (netRevenue.gt(0) ? value.dividedBy(netRevenue).times(100).toFixed(2) : "0.00");

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      issueCount: issueTotals._count,
      returnCount: returnTotals._count,
      grossRevenue: grossRevenue.toFixed(2),
      returnsCredit: returnsCredit.toFixed(2),
      discountsGiven: "0.00",
      netRevenue: netRevenue.toFixed(2),
      grossCogs: grossCogs.toFixed(2),
      returnsCostReversed: returnsCostReversed.toFixed(2),
      cogs: cogs.toFixed(2),
      grossProfit: grossProfit.toFixed(2),
      grossMarginPercent: grossMarginPercent.toFixed(1),
      losses: { spoiled: wastageSpoiled.toFixed(2), damagedReturns: wastageFromReturns.toFixed(2), countShortages: countShortages.toFixed(2), total: totalLosses.toFixed(2) },
      expenses: { total: totalExpenses.toFixed(2), tracked: false },
      netProfit: netProfit.toFixed(2),
      netMarginPercent: netMarginPercent.toFixed(1),
      per100: { cogs: per100(cogs), losses: per100(totalLosses), expenses: per100(totalExpenses), profit: per100(netProfit) },
    };
  });

  // Per item, for a period: what sold, at what margin -- sorted by PROFIT
  // CONTRIBUTION (not margin %), since the item making the most money is
  // often not the item selling the most, per the brief's own framing. Folds
  // in what was Margin Erosion (items below their configured floor, with a
  // suggested price) and a Slow Moving section (no sales in 30 days).
  app.get<{ Querystring: RangeQuery }>("/reports/item-profitability", guard, async (request) => {
    const warehouseId = request.user.warehouseId;
    const { from, to } = parseDateRange(request.query);

    const rows = await prisma.issueLine.groupBy({
      by: ["itemId"],
      where: { issue: { warehouseId, status: "ISSUED", issuedAt: { gte: from, lte: to } } },
      _sum: { qty: true, lineTotal: true, lineCost: true },
    });
    const soldItemIds = new Set(rows.map((r) => r.itemId));

    const allItems = await prisma.item.findMany({
      where: { warehouseId, isActive: true, isDeleted: false },
      select: {
        id: true,
        name: true,
        sellUnit: { select: { code: true } },
        baseSellPrice: true,
        avgCostPerUnit: true,
        marginFloorPercent: true,
        currentStockQty: true,
      },
    });
    const itemById = new Map(allItems.map((i) => [i.id, i]));

    const result = rows.map((r) => {
      const item = itemById.get(r.itemId);
      const revenue = new Decimal(r._sum.lineTotal ?? 0);
      const cost = new Decimal(r._sum.lineCost ?? 0);
      const margin = revenue.minus(cost);
      return {
        itemId: r.itemId,
        name: item?.name ?? "(deleted item)",
        unitCode: item?.sellUnit.code ?? "",
        qty: new Decimal(r._sum.qty ?? 0).toFixed(4),
        revenue: revenue.toFixed(2),
        cost: cost.toFixed(2),
        margin: margin.toFixed(2),
        marginPercent: calculateMarginPercent(revenue, cost).toFixed(2),
      };
    });
    result.sort((a, b) => Number(b.margin) - Number(a.margin));
    const totals = result.reduce(
      (acc, r) => ({ revenue: acc.revenue.plus(r.revenue), cost: acc.cost.plus(r.cost), margin: acc.margin.plus(r.margin) }),
      { revenue: new Decimal(0), cost: new Decimal(0), margin: new Decimal(0) }
    );

    // Margin warnings: live state (today's price/cost), not scoped to the
    // period -- an item can be below floor even with no sales in range.
    const floored = allItems.filter((i) => i.marginFloorPercent != null);
    const warnings = await Promise.all(
      floored.map(async (i) => {
        const marginPercent = calculateMarginPercent(i.baseSellPrice, i.avgCostPerUnit);
        const floorPercent = new Decimal(i.marginFloorPercent!);
        if (!marginPercent.lt(floorPercent)) return null;

        const recentReceipt = await prisma.stockMovement.findFirst({
          where: { warehouseId, itemId: i.id, type: "PURCHASE_RECEIVED", createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
          select: { avgCostBefore: true, avgCostAfter: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        });
        // Price that would exactly hit the floor: floor% = (price - cost) / price -> price = cost / (1 - floor%)
        const floorFraction = floorPercent.dividedBy(100);
        const suggestedPrice = floorFraction.gte(1) ? null : new Decimal(i.avgCostPerUnit).dividedBy(new Decimal(1).minus(floorFraction));

        return {
          itemId: i.id,
          name: i.name,
          unitCode: i.sellUnit.code,
          price: new Decimal(i.baseSellPrice).toFixed(2),
          avgCost: new Decimal(i.avgCostPerUnit).toFixed(2),
          marginPercent: marginPercent.toFixed(1),
          floorPercent: floorPercent.toFixed(1),
          costChange:
            recentReceipt && !new Decimal(recentReceipt.avgCostBefore).eq(recentReceipt.avgCostAfter)
              ? { from: new Decimal(recentReceipt.avgCostBefore).toFixed(2), to: new Decimal(recentReceipt.avgCostAfter).toFixed(2), date: recentReceipt.createdAt.toISOString() }
              : null,
          suggestedPrice: suggestedPrice ? suggestedPrice.toFixed(2) : null,
        };
      })
    );
    const marginWarnings = warnings.filter((w): w is NonNullable<typeof w> => w !== null).sort((a, b) => Number(a.marginPercent) - Number(b.marginPercent));

    // Slow moving: stock on hand, nothing sold in the last 30 days.
    const slowMovingCandidates = allItems.filter((i) => !soldItemIds.has(i.id) && new Decimal(i.currentStockQty).gt(0));
    const last30Start = new Date(Date.now() - 30 * 86_400_000);
    const recentSales = await prisma.issueLine.findMany({
      where: { itemId: { in: slowMovingCandidates.map((i) => i.id) }, issue: { warehouseId, status: "ISSUED", issuedAt: { gte: last30Start } } },
      select: { itemId: true },
      distinct: ["itemId"],
    });
    const soldRecently = new Set(recentSales.map((r) => r.itemId));
    const slowMoving = slowMovingCandidates
      .filter((i) => !soldRecently.has(i.id))
      .map((i) => ({
        itemId: i.id,
        name: i.name,
        unitCode: i.sellUnit.code,
        stockQty: new Decimal(i.currentStockQty).toFixed(4),
        value: new Decimal(i.currentStockQty).times(i.avgCostPerUnit).toFixed(2),
      }))
      .sort((a, b) => Number(b.value) - Number(a.value));
    const capitalTiedUp = slowMoving.reduce((sum, i) => sum.plus(i.value), new Decimal(0));

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      items: result,
      totals: { revenue: totals.revenue.toFixed(2), cost: totals.cost.toFixed(2), margin: totals.margin.toFixed(2), marginPercent: calculateMarginPercent(totals.revenue, totals.cost).toFixed(1) },
      marginWarnings,
      slowMoving: { items: slowMoving, capitalTiedUp: capitalTiedUp.toFixed(2) },
    };
  });

  // The brief's own framing: "the single most useful report for the owner."
  // Ages the customer's WHOLE running ledger (see ageLedgerDebits) -- not
  // just their issues, so an opening balance or a payment-reversal ages
  // correctly too, not just invoices. Buckets by days PAST DUE (debit's own
  // date + customer.creditDays): Current (0-7d) / 8-15d / 16-30d / 30d+,
  // matching the exact labels in both this report's and Customer Statement's
  // mockups -- the two reports share one bucketing rule so they never disagree.
  app.get("/reports/receivables-aging", guard, async (request) => {
    const warehouseId = request.user.warehouseId;
    const now = Date.now();

    const customers = await prisma.customer.findMany({
      where: { warehouseId, isActive: true },
      select: {
        id: true,
        name: true,
        phone: true,
        creditLimit: true,
        creditDays: true,
        customerLedgers: {
          select: { id: true, entryDate: true, debit: true, credit: true },
          orderBy: [{ entryDate: "asc" }, { id: "asc" }],
        },
      },
    });

    type Bucket = "current" | "d8_15" | "d16_30" | "d30_plus";
    const buckets: Bucket[] = ["current", "d8_15", "d16_30", "d30_plus"];
    const oldestDaysByCustomer = new Map<string, number>();

    const rows = customers
      .map((customer) => {
        const debits = customer.customerLedgers
          .filter((l) => new Decimal(l.debit).gt(0))
          .map((l) => ({ id: l.id, date: l.entryDate, amount: l.debit }));
        const credits = customer.customerLedgers
          .filter((l) => new Decimal(l.credit).gt(0))
          .map((l) => ({ amount: l.credit }));

        const totalsByBucket: Record<Bucket, Decimal> = {
          current: new Decimal(0),
          d8_15: new Decimal(0),
          d16_30: new Decimal(0),
          d30_plus: new Decimal(0),
        };
        let oldestDaysPastDue = -Infinity;

        for (const aged of ageLedgerDebits(debits, credits)) {
          if (aged.remaining.lte(0)) continue;
          const dueAt = aged.date.getTime() + customer.creditDays * 86_400_000;
          const daysPastDue = Math.floor((now - dueAt) / 86_400_000);
          oldestDaysPastDue = Math.max(oldestDaysPastDue, daysPastDue);
          const bucket: Bucket =
            daysPastDue <= 7 ? "current" : daysPastDue <= 15 ? "d8_15" : daysPastDue <= 30 ? "d16_30" : "d30_plus";
          totalsByBucket[bucket] = totalsByBucket[bucket].plus(aged.remaining);
        }

        if (oldestDaysPastDue > -Infinity) oldestDaysByCustomer.set(customer.id, oldestDaysPastDue);

        const total = buckets.reduce((sum, b) => sum.plus(totalsByBucket[b]), new Decimal(0));
        return {
          customerId: customer.id,
          name: customer.name,
          phone: customer.phone,
          current: totalsByBucket.current.toFixed(2),
          d8_15: totalsByBucket.d8_15.toFixed(2),
          d16_30: totalsByBucket.d16_30.toFixed(2),
          d30_plus: totalsByBucket.d30_plus.toFixed(2),
          total: total.toFixed(2),
          overCreditLimit: new Decimal(customer.creditLimit).gt(0) && total.gt(customer.creditLimit),
        };
      })
      .filter((r) => Number(r.total) > 0)
      .sort((a, b) => Number(b.total) - Number(a.total));

    const totals = buckets.reduce(
      (acc, b) => ({ ...acc, [b]: rows.reduce((sum, r) => sum.plus(r[b]), new Decimal(0)).toFixed(2) }),
      {} as Record<Bucket, string>
    );
    const grandTotal = buckets.reduce((sum, b) => sum.plus(totals[b]), new Decimal(0));
    const percentOfTotal = buckets.reduce(
      (acc, b) => ({ ...acc, [b]: grandTotal.gt(0) ? new Decimal(totals[b]).dividedBy(grandTotal).times(100).toFixed(1) : "0.0" }),
      {} as Record<Bucket, string>
    );

    const needsAttention = rows
      .filter((r) => Number(r.d30_plus) > 0)
      .map((r) => ({ customerId: r.customerId, name: r.name, phone: r.phone, amount: r.d30_plus, oldestDays: oldestDaysByCustomer.get(r.customerId) ?? 0 }))
      .sort((a, b) => Number(b.amount) - Number(a.amount));

    return {
      rows,
      totals: { ...totals, grandTotal: grandTotal.toFixed(2) },
      percentOfTotal,
      needsAttention,
      overCreditLimit: rows.filter((r) => r.overCreditLimit),
    };
  });

  // What the clerk hands the owner at close of day, alongside the cash.
  // Cash-drawer reconciliation (opening float, expenses, counted cash) isn't
  // in this report: nothing in this system tracks a float or petty-cash
  // expenses yet, so that section is honestly omitted rather than shown with
  // fabricated zeros -- see 07-progress.md for the gap.
  app.get<{ Querystring: { date?: string } }>("/reports/daily-summary", guard, async (request) => {
    const warehouseId = request.user.warehouseId;
    const dateStr = request.query.date ?? new Date().toISOString().slice(0, 10);
    const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
    const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);

    const [issues, returns, payments, receipts, wastages] = await Promise.all([
      prisma.issue.findMany({
        where: { warehouseId, status: "ISSUED", issuedAt: { gte: dayStart, lte: dayEnd } },
        select: {
          id: true,
          issueNumber: true,
          totalAmount: true,
          customer: { select: { name: true } },
          paymentAllocations: { where: { payment: { isReversed: false } }, select: { amountApplied: true } },
        },
        orderBy: { issuedAt: "asc" },
      }),
      prisma.returnNote.aggregate({
        where: { warehouseId, createdAt: { gte: dayStart, lte: dayEnd } },
        _sum: { totalCreditAmount: true },
        _count: true,
      }),
      prisma.payment.groupBy({
        by: ["method"],
        where: { warehouseId, isReversed: false, paymentDate: { gte: dayStart, lte: dayEnd } },
        _sum: { amount: true },
      }),
      prisma.goodsReceipt.aggregate({
        where: { warehouseId, receivedAt: { gte: dayStart, lte: dayEnd } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      prisma.wastage.findMany({
        where: { warehouseId, createdAt: { gte: dayStart, lte: dayEnd } },
        select: { qty: true, reason: true, costImpact: true, item: { select: { name: true, sellUnit: { select: { code: true } } } } },
      }),
    ]);

    const grossSales = issues.reduce((sum, i) => sum.plus(i.totalAmount), new Decimal(0));
    const returnsTotal = new Decimal(returns._sum.totalCreditAmount ?? 0);
    const netSales = grossSales.minus(returnsTotal);
    const collections = payments.map((p) => ({ method: p.method, amount: new Decimal(p._sum.amount ?? 0).toFixed(2) }));
    const totalCollected = payments.reduce((sum, p) => sum.plus(p._sum.amount ?? 0), new Decimal(0));
    const wastageTotal = wastages.reduce((sum, w) => sum.plus(w.costImpact), new Decimal(0));

    const orderRows = issues.map((i) => {
      const paid = i.paymentAllocations.reduce((sum, a) => sum.plus(a.amountApplied), new Decimal(0));
      const total = new Decimal(i.totalAmount);
      const status = paid.gte(total) ? "Paid" : paid.gt(0) ? "Partial" : "Unpaid";
      return { issueNumber: i.issueNumber, customerName: i.customer.name, totalAmount: total.toFixed(2), status };
    });

    return {
      date: dateStr,
      sales: {
        orderCount: issues.length,
        grossSales: grossSales.toFixed(2),
        returnCount: returns._count,
        returnsTotal: returnsTotal.toFixed(2),
        netSales: netSales.toFixed(2),
      },
      collections: { byMethod: collections, total: totalCollected.toFixed(2) },
      purchases: { receiptCount: receipts._count, total: new Decimal(receipts._sum.totalAmount ?? 0).toFixed(2) },
      wastage: {
        lines: wastages.map((w) => ({
          itemName: w.item.name,
          qty: new Decimal(w.qty).toFixed(4),
          unitCode: w.item.sellUnit.code,
          reason: w.reason,
          costImpact: new Decimal(w.costImpact).toFixed(2),
        })),
        total: wastageTotal.toFixed(2),
      },
      orders: orderRows,
    };
  });

  // What's sitting in the warehouse right now, valued at moving-average cost,
  // grouped by category the way a physical stock take is actually organized.
  app.get("/reports/stock-report", guard, async (request) => {
    const warehouseId = request.user.warehouseId;
    const now = new Date();
    const soon = new Date(now.getTime() + 3 * 86_400_000);

    const items = await prisma.item.findMany({
      where: { warehouseId, isActive: true, isDeleted: false },
      select: {
        id: true,
        name: true,
        currentStockQty: true,
        avgCostPerUnit: true,
        minStockQty: true,
        isPerishable: true,
        category: { select: { id: true, name: true, sortOrder: true } },
        sellUnit: { select: { code: true } },
        purchaseLots: {
          where: { expiryDate: { gte: now, lte: soon }, remainingQty: { gt: 0 } },
          select: { expiryDate: true, receivedAt: true },
          orderBy: { expiryDate: "asc" },
          take: 1,
        },
      },
      orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
    });

    type Status = "OK" | "LOW" | "OUT";
    const rows = items.map((i) => {
      const qty = new Decimal(i.currentStockQty);
      const value = qty.times(i.avgCostPerUnit);
      const status: Status = qty.lte(0) ? "OUT" : i.minStockQty != null && qty.lte(i.minStockQty) ? "LOW" : "OK";
      const soonLot = i.purchaseLots[0];
      return {
        itemId: i.id,
        name: i.name,
        category: i.category?.name ?? "Uncategorized",
        categorySort: i.category?.sortOrder ?? 999,
        unitCode: i.sellUnit.code,
        stockQty: qty.toFixed(4),
        avgCost: new Decimal(i.avgCostPerUnit).toFixed(4),
        value: value.toFixed(2),
        status,
        expiringSoon: soonLot ? { expiryDate: soonLot.expiryDate!.toISOString(), receivedAt: soonLot.receivedAt.toISOString() } : null,
      };
    });

    const categoryOrder = Array.from(new Map(rows.map((r) => [r.category, r.categorySort])).entries()).sort((a, b) => a[1] - b[1]);
    const categories = categoryOrder.map(([name]) => {
      const categoryRows = rows.filter((r) => r.category === name);
      const subtotal = categoryRows.reduce((sum, r) => sum.plus(r.value), new Decimal(0));
      return { name, items: categoryRows, subtotal: subtotal.toFixed(2) };
    });

    const grandTotal = rows.reduce((sum, r) => sum.plus(r.value), new Decimal(0));
    return {
      categories,
      grandTotal: grandTotal.toFixed(2),
      outOfStock: rows.filter((r) => r.status === "OUT").map((r) => r.name),
      lowStock: rows.filter((r) => r.status === "LOW").map((r) => ({ name: r.name, stockQty: r.stockQty, unitCode: r.unitCode })),
      expiringSoon: rows
        .filter((r) => r.expiringSoon)
        .map((r) => ({ name: r.name, stockQty: r.stockQty, unitCode: r.unitCode, expiryDate: r.expiringSoon!.expiryDate, receivedAt: r.expiringSoon!.receivedAt })),
    };
  });

  // The spec's exact formula: trailing 21-day average daily usage excluding
  // stockout days, days of cover, suggest reordering below item.reorderDays.
  // Grouped into Urgent (out within 2 days) / Soon (within a week) tiers,
  // then a shopping list by supplier -- the part that actually gets used,
  // per the brief's own framing ("the owner tears off this section").
  app.get("/reports/reorder-list", guard, async (request) => {
    const warehouseId = request.user.warehouseId;

    const items = await prisma.item.findMany({
      where: { warehouseId, isActive: true, isDeleted: false },
      select: {
        id: true,
        name: true,
        currentStockQty: true,
        avgCostPerUnit: true,
        reorderDays: true,
        purchaseToSellFactor: true,
        purchaseUnit: { select: { code: true } },
        sellUnit: { select: { code: true } },
        preferredSupplier: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    });

    const rows = await Promise.all(
      items.map(async (item) => {
        const dailyUsage = await buildDailyUsage(warehouseId, item.id, item.currentStockQty, REORDER_WINDOW_DAYS);
        const avgDailyUsage = calculateAverageDailyUsage(dailyUsage);
        const daysOfCover = calculateDaysOfCover(item.currentStockQty, avgDailyUsage);
        const shouldReorder = item.reorderDays != null && daysOfCover.lt(item.reorderDays);
        const suggestedQty = item.reorderDays != null
          ? suggestReorderQty(item.currentStockQty, avgDailyUsage, item.reorderDays, item.purchaseToSellFactor)
          : new Decimal(0);
        const suggestedQtyPurchaseUnits = suggestedQty.dividedBy(item.purchaseToSellFactor);
        const estimatedCost = suggestedQty.times(item.avgCostPerUnit);
        const coverNum = daysOfCover.isFinite() ? daysOfCover.toNumber() : Infinity;

        return {
          itemId: item.id,
          name: item.name,
          stockQty: new Decimal(item.currentStockQty).toFixed(4),
          sellUnitCode: item.sellUnit.code,
          avgDailyUsage: avgDailyUsage.toFixed(4),
          daysOfCover: daysOfCover.isFinite() ? daysOfCover.toFixed(1) : null,
          reorderDays: item.reorderDays,
          shouldReorder,
          urgency: !shouldReorder ? null : coverNum < 2 ? ("urgent" as const) : coverNum < 7 ? ("soon" as const) : ("later" as const),
          suggestedQtySellUnits: suggestedQty.toFixed(4),
          suggestedQtyPurchaseUnits: suggestedQtyPurchaseUnits.toFixed(2),
          purchaseUnitCode: item.purchaseUnit.code,
          estimatedCost: estimatedCost.toFixed(2),
          supplier: item.preferredSupplier,
        };
      })
    );

    rows.sort((a, b) => Number(a.daysOfCover ?? Infinity) - Number(b.daysOfCover ?? Infinity));

    const toReorder = rows.filter((r) => r.shouldReorder);
    const urgent = toReorder.filter((r) => r.urgency === "urgent");
    const soon = toReorder.filter((r) => r.urgency === "soon");

    const bySupplierMap = new Map<string, { supplierId: string | null; supplierName: string; lines: typeof toReorder; total: Decimal }>();
    for (const r of toReorder) {
      const key = r.supplier?.id ?? "__none__";
      const bucket = bySupplierMap.get(key) ?? { supplierId: r.supplier?.id ?? null, supplierName: r.supplier?.name ?? "No preferred supplier set", lines: [], total: new Decimal(0) };
      bucket.lines.push(r);
      bucket.total = bucket.total.plus(r.estimatedCost);
      bySupplierMap.set(key, bucket);
    }
    const shoppingList = Array.from(bySupplierMap.values())
      .map((b) => ({ supplierId: b.supplierId, supplierName: b.supplierName, lines: b.lines, estimatedCost: b.total.toFixed(2) }))
      .sort((a, b) => Number(b.estimatedCost) - Number(a.estimatedCost));
    const grandTotal = toReorder.reduce((sum, r) => sum.plus(r.estimatedCost), new Decimal(0));

    return { items: rows, urgent, soon, shoppingList, grandTotal: grandTotal.toFixed(2), windowDays: REORDER_WINDOW_DAYS };
  });

  // REPORT 10 -- ranked by sales, per the brief. SALES is the gross issued
  // amount so it reads the same as the customer's own invoices; NET = SALES
  // - RETURNS. OWES is the customer's live currentBalance (a snapshot, not
  // scoped to the period) -- the same figure Customer Statement and
  // Receivables Aging show, so the three reports never disagree on what a
  // customer owes right now. overCreditLimit mirrors Receivables Aging's own
  // flag exactly (same comparison, same fields) rather than inventing a
  // second definition of "over limit."
  app.get<{ Querystring: RangeQuery }>("/reports/sales-by-customer", guard, async (request) => {
    const warehouseId = request.user.warehouseId;
    const { from, to } = parseDateRange(request.query);
    const dateFilter = { gte: from, lte: to };

    const [issueRows, returnRows] = await Promise.all([
      prisma.issue.groupBy({
        by: ["customerId"],
        where: { warehouseId, status: "ISSUED", issuedAt: dateFilter },
        _sum: { totalAmount: true },
        _count: true,
      }),
      prisma.returnNote.groupBy({
        by: ["customerId"],
        where: { warehouseId, createdAt: dateFilter },
        _sum: { totalCreditAmount: true },
      }),
    ]);

    const customers = await prisma.customer.findMany({
      where: { id: { in: issueRows.map((r) => r.customerId) } },
      select: { id: true, name: true, currentBalance: true, creditLimit: true },
    });
    const customerById = new Map(customers.map((c) => [c.id, c]));
    const returnsByCustomer = new Map(returnRows.map((r) => [r.customerId, new Decimal(r._sum.totalCreditAmount ?? 0)]));

    const rows = issueRows.map((r) => {
      const customer = customerById.get(r.customerId);
      const sales = new Decimal(r._sum.totalAmount ?? 0);
      const returns = returnsByCustomer.get(r.customerId) ?? new Decimal(0);
      const owes = new Decimal(customer?.currentBalance ?? 0);
      return {
        customerId: r.customerId,
        name: customer?.name ?? "(deleted customer)",
        orders: r._count,
        sales: sales.toFixed(2),
        returns: returns.toFixed(2),
        net: sales.minus(returns).toFixed(2),
        owes: owes.toFixed(2),
        overCreditLimit: customer ? new Decimal(customer.creditLimit).gt(0) && owes.gt(customer.creditLimit) : false,
        returnRatePercent: sales.gt(0) ? returns.dividedBy(sales).times(100).toFixed(1) : "0.0",
      };
    });
    rows.sort((a, b) => Number(b.sales) - Number(a.sales));

    const totals = rows.reduce(
      (acc, r) => ({
        orders: acc.orders + r.orders,
        sales: acc.sales.plus(r.sales),
        returns: acc.returns.plus(r.returns),
        net: acc.net.plus(r.net),
        owes: acc.owes.plus(r.owes),
      }),
      { orders: 0, sales: new Decimal(0), returns: new Decimal(0), net: new Decimal(0), owes: new Decimal(0) }
    );

    const returnRate = [...rows]
      .filter((r) => Number(r.sales) > 0)
      .sort((a, b) => Number(b.returnRatePercent) - Number(a.returnRatePercent))
      .map((r) => ({ customerId: r.customerId, name: r.name, ratePercent: r.returnRatePercent }));
    const highestReturnRateRow = returnRate[0];
    const highestReturnRateCustomerId = highestReturnRateRow && Number(highestReturnRateRow.ratePercent) > 0 ? highestReturnRateRow.customerId : null;

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      customers: rows,
      totals: {
        orders: totals.orders,
        sales: totals.sales.toFixed(2),
        returns: totals.returns.toFixed(2),
        net: totals.net.toFixed(2),
        owes: totals.owes.toFixed(2),
      },
      returnRate: {
        rows: returnRate,
        averagePercent: totals.sales.gt(0) ? totals.returns.dividedBy(totals.sales).times(100).toFixed(1) : "0.0",
        highestCustomerId: highestReturnRateCustomerId,
      },
    };
  });

  // SPEC.md Part 6: currentBalance/currentStockQty are denormalized for
  // speed, "verified against the ledger/movement sum by a nightly job --
  // never computed by aggregating on read." There's no job queue in this
  // stack (see docs/06-decisions.md) -- this endpoint IS that job: safe to
  // call on a schedule from outside the app (cron / a hosting provider's
  // scheduled task) as well as on demand from this screen. Deliberately not
  // scoped to active/non-deleted rows -- a stale number on a deleted item is
  // still a stale number.
  app.get("/reports/reconciliation", guard, async (request) => {
    const warehouseId = request.user.warehouseId;

    const customers = await prisma.customer.findMany({
      where: { warehouseId },
      select: { id: true, name: true, currentBalance: true, customerLedgers: { select: { debit: true, credit: true } } },
    });

    const customerMismatches = customers
      .map((c) => {
        const expected = c.customerLedgers.reduce((sum, l) => sum.plus(l.debit).minus(l.credit), new Decimal(0));
        const stored = new Decimal(c.currentBalance);
        const delta = stored.minus(expected);
        return { delta, customerId: c.id, name: c.name, stored: stored.toFixed(2), expected: expected.toFixed(2) };
      })
      .filter((r) => !r.delta.isZero())
      .map((r) => ({ ...r, delta: r.delta.toFixed(2) }));

    const items = await prisma.item.findMany({
      where: { warehouseId },
      select: { id: true, name: true, currentStockQty: true, stockMovements: { select: { qty: true } } },
    });

    const itemMismatches = items
      .map((i) => {
        const expected = i.stockMovements.reduce((sum, m) => sum.plus(m.qty), new Decimal(0));
        const stored = new Decimal(i.currentStockQty);
        const delta = stored.minus(expected);
        return { delta, itemId: i.id, name: i.name, stored: stored.toFixed(4), expected: expected.toFixed(4) };
      })
      .filter((r) => !r.delta.isZero())
      .map((r) => ({ ...r, delta: r.delta.toFixed(4) }));

    return { checkedAt: new Date().toISOString(), customerMismatches, itemMismatches };
  });

  // "Daily job flags past-expiry items ... wastage entry suggested"
  // (docs/05-edge-cases.md). PurchaseLot.remainingQty isn't precisely
  // decremented as stock is issued (issues cost on a weighted average, not
  // FIFO lot consumption -- see the Phase 5 picking-slip note in
  // 07-progress.md), so this flags an ITEM as having expired stock
  // *somewhere* in it, from its oldest still-open expired lot -- not a
  // precise leftover quantity. The owner still checks physically before
  // logging the wastage; this is a prompt to look, not an automatic write.
  app.get("/reports/expiry", guard, async (request) => {
    const warehouseId = request.user.warehouseId;
    const now = new Date();

    const items = await prisma.item.findMany({
      where: { warehouseId, isActive: true, isDeleted: false, isPerishable: true, currentStockQty: { gt: 0 } },
      select: {
        id: true,
        name: true,
        currentStockQty: true,
        sellUnit: { select: { code: true } },
        purchaseLots: {
          where: { expiryDate: { lt: now }, remainingQty: { gt: 0 } },
          select: { expiryDate: true, batchNumber: true },
          orderBy: { expiryDate: "asc" },
          take: 1,
        },
      },
    });

    const flagged = items
      .filter((i) => i.purchaseLots.length > 0)
      .map((i) => {
        const lot = i.purchaseLots[0]!;
        const expiredOn = lot.expiryDate!;
        return {
          itemId: i.id,
          name: i.name,
          stockQty: new Decimal(i.currentStockQty).toFixed(4),
          unitCode: i.sellUnit.code,
          oldestExpiredBatch: lot.batchNumber,
          expiredOn: expiredOn.toISOString(),
          daysExpired: Math.floor((now.getTime() - expiredOn.getTime()) / 86_400_000),
        };
      })
      .sort((a, b) => b.daysExpired - a.daysExpired);

    return { items: flagged };
  });

  // What was bought, for a period. "Paid"/"Outstanding" columns aren't shown
  // -- GoodsReceipt.paidAmount has no write path anywhere in this system
  // (a real gap, not a rounding choice), so every receipt would misleadingly
  // read as 100% outstanding. Shown honestly as total purchased instead.
  app.get<{ Querystring: RangeQuery }>("/reports/purchase-register", guard, async (request) => {
    const warehouseId = request.user.warehouseId;
    const { from, to } = parseDateRange(request.query);

    const receipts = await prisma.goodsReceipt.findMany({
      where: { warehouseId, receivedAt: { gte: from, lte: to } },
      select: {
        id: true,
        receiptNumber: true,
        receivedAt: true,
        totalAmount: true,
        supplierInvoiceNumber: true,
        supplier: { select: { id: true, name: true } },
        lines: { select: { id: true } },
      },
      orderBy: { receivedAt: "asc" },
    });

    const rows = receipts.map((r) => ({
      id: r.id,
      receiptNumber: r.receiptNumber,
      receivedAt: r.receivedAt.toISOString(),
      supplierName: r.supplier.name,
      invoiceNumber: r.supplierInvoiceNumber,
      lineCount: r.lines.length,
      totalAmount: new Decimal(r.totalAmount).toFixed(2),
    }));
    const grandTotal = rows.reduce((sum, r) => sum.plus(r.totalAmount), new Decimal(0));

    const bySupplierMap = new Map<string, { supplierId: string; name: string; total: Decimal }>();
    for (const r of receipts) {
      const bucket = bySupplierMap.get(r.supplier.id) ?? { supplierId: r.supplier.id, name: r.supplier.name, total: new Decimal(0) };
      bucket.total = bucket.total.plus(r.totalAmount);
      bySupplierMap.set(r.supplier.id, bucket);
    }
    const bySupplier = Array.from(bySupplierMap.values())
      .map((b) => ({ supplierId: b.supplierId, name: b.name, total: b.total.toFixed(2) }))
      .sort((a, b) => Number(b.total) - Number(a.total));

    // Price changes: consecutive receipts of the same item within the
    // period, where the sell-unit cost actually moved.
    const lines = await prisma.goodsReceiptLine.findMany({
      where: { goodsReceipt: { warehouseId, receivedAt: { gte: from, lte: to } } },
      select: { itemId: true, unitCostSellUnit: true, goodsReceipt: { select: { receivedAt: true } }, item: { select: { name: true } } },
      orderBy: [{ itemId: "asc" }, { goodsReceipt: { receivedAt: "asc" } }],
    });
    const priceChanges: { itemName: string; from: string; to: string; changePercent: string; date: string }[] = [];
    let prevItemId: string | null = null;
    let prevCost: Decimal | null = null;
    for (const line of lines) {
      if (line.itemId !== prevItemId) {
        prevItemId = line.itemId;
        prevCost = new Decimal(line.unitCostSellUnit);
        continue;
      }
      const cost = new Decimal(line.unitCostSellUnit);
      if (prevCost && !cost.eq(prevCost)) {
        priceChanges.push({
          itemName: line.item.name,
          from: prevCost.toFixed(2),
          to: cost.toFixed(2),
          changePercent: prevCost.gt(0) ? cost.minus(prevCost).dividedBy(prevCost).times(100).toFixed(1) : "0.0",
          date: line.goodsReceipt.receivedAt.toISOString(),
        });
      }
      prevCost = cost;
    }

    return { from: from.toISOString(), to: to.toISOString(), rows, grandTotal: grandTotal.toFixed(2), bySupplier, priceChanges };
  });

  // What was lost, for a period, and why.
  app.get<{ Querystring: RangeQuery }>("/reports/wastage-report", guard, async (request) => {
    const warehouseId = request.user.warehouseId;
    const { from, to } = parseDateRange(request.query);

    const wastages = await prisma.wastage.findMany({
      where: { warehouseId, createdAt: { gte: from, lte: to } },
      select: { itemId: true, qty: true, reason: true, costImpact: true, createdAt: true, item: { select: { name: true, sellUnit: { select: { code: true } } } } },
    });

    const total = wastages.reduce((sum, w) => sum.plus(w.costImpact), new Decimal(0));

    const byReasonMap = new Map<string, { count: number; total: Decimal }>();
    for (const w of wastages) {
      const bucket = byReasonMap.get(w.reason) ?? { count: 0, total: new Decimal(0) };
      bucket.count += 1;
      bucket.total = bucket.total.plus(w.costImpact);
      byReasonMap.set(w.reason, bucket);
    }
    const byReason = Array.from(byReasonMap.entries())
      .map(([reason, b]) => ({ reason, count: b.count, total: b.total.toFixed(2), percentOfTotal: total.gt(0) ? b.total.dividedBy(total).times(100).toFixed(1) : "0.0" }))
      .sort((a, b) => Number(b.total) - Number(a.total));

    const byItemMap = new Map<string, { name: string; unitCode: string; qty: Decimal; total: Decimal }>();
    for (const w of wastages) {
      const bucket = byItemMap.get(w.itemId) ?? { name: w.item.name, unitCode: w.item.sellUnit.code, qty: new Decimal(0), total: new Decimal(0) };
      bucket.qty = bucket.qty.plus(w.qty);
      bucket.total = bucket.total.plus(w.costImpact);
      byItemMap.set(w.itemId, bucket);
    }
    const itemIds = Array.from(byItemMap.keys());
    const purchasesByItem = await prisma.goodsReceiptLine.groupBy({
      by: ["itemId"],
      where: { itemId: { in: itemIds }, goodsReceipt: { warehouseId, receivedAt: { gte: from, lte: to } } },
      _sum: { lineTotal: true },
    });
    const purchaseTotalByItem = new Map(purchasesByItem.map((p) => [p.itemId, new Decimal(p._sum.lineTotal ?? 0)]));

    const byItem = Array.from(byItemMap.entries())
      .map(([itemId, b]) => {
        const purchaseTotal = purchaseTotalByItem.get(itemId);
        return {
          itemId,
          name: b.name,
          unitCode: b.unitCode,
          qty: b.qty.toFixed(4),
          total: b.total.toFixed(2),
          percentOfTotal: total.gt(0) ? b.total.dividedBy(total).times(100).toFixed(1) : "0.0",
          percentOfPurchases: purchaseTotal && purchaseTotal.gt(0) ? b.total.dividedBy(purchaseTotal).times(100).toFixed(1) : null,
        };
      })
      .sort((a, b) => Number(b.total) - Number(a.total));

    const dayCount = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
    const dailyTotals = new Map<string, Decimal>();
    for (const w of wastages) {
      const key = w.createdAt.toISOString().slice(0, 10);
      dailyTotals.set(key, (dailyTotals.get(key) ?? new Decimal(0)).plus(w.costImpact));
    }
    const dailyTrend: { date: string; total: string }[] = [];
    for (let i = 0; i < dayCount && i < 62; i++) {
      const d = new Date(from.getTime() + i * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      dailyTrend.push({ date: key, total: (dailyTotals.get(key) ?? new Decimal(0)).toFixed(2) });
    }

    let observation: string | null = null;
    if (byItem.length > 0) {
      const top = byItem[0]!;
      const parts = [`${top.name} accounts for ${top.percentOfTotal}% of all wastage.`];
      if (top.percentOfPurchases) parts.push(`${top.percentOfPurchases}% of purchased ${top.name.toLowerCase()} is being wasted.`);
      observation = parts.join(" ");
    }

    return { from: from.toISOString(), to: to.toISOString(), total: total.toFixed(2), byReason, byItem, dailyTrend, observation };
  });
}
