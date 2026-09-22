export interface Category {
  id: string;
  name: string;
  colorHex: string | null;
  isPerishable?: boolean;
  defaultReturnWindowHours?: number | null;
  sortOrder?: number;
}

export interface Unit {
  id: string;
  code: string;
  name: string;
  type: "WEIGHT" | "VOLUME" | "COUNT";
}

export interface UnitRef {
  id: string;
  code: string;
  name: string;
  type: "WEIGHT" | "VOLUME" | "COUNT";
}

export interface Item {
  id: string;
  name: string;
  nameUrdu: string | null;
  sku: string | null;
  barcode: string | null;
  category: Category | null;
  purchaseUnit: UnitRef;
  sellUnit: UnitRef;
  unitCode: string;
  purchaseToSellFactor: string;
  stockQty: string;
  avgCost: string;
  price: string;
  marginFloorPercent: string | null;
  minStockQty: string | null;
  maxStockQty: string | null;
  reorderDays: number | null;
  isPerishable: boolean;
  shelfLifeDays: number | null;
  returnWindowHours: number | null;
  isActive: boolean;
  isDeleted: boolean;
  imageUrl: string | null;
  location: string | null;
  preferredSupplierId: string | null;
}

export interface Customer {
  id: string;
  name: string;
  nameUrdu: string | null;
  code: string | null;
  type: "OWN_BRANCH" | "EXTERNAL_RESTAURANT" | "WALK_IN";
  contactName?: string | null;
  phone: string | null;
  whatsapp?: string | null;
  address?: string | null;
  currentBalance: string;
  creditDays: number;
  discountPercent: string;
  isActive?: boolean;
  notes?: string | null;
}

export interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  whatsapp?: string | null;
  address?: string | null;
  paymentTerms?: string | null;
  deliveryDays?: number | null;
  rating?: number | null;
  notes?: string | null;
  isActive?: boolean;
}

export interface GoodsReceiptListItem {
  id: string;
  receiptNumber: string;
  receivedAt: string;
  totalAmount: string;
  receivedByName: string;
  supplierInvoiceNumber: string | null;
  supplier: { id: string; name: string };
  lineCount: number;
  hadVariance: boolean;
}

export interface FlaggedLine {
  itemId: string;
  name: string;
  currentAvgCost: string;
  newCost: string;
  variancePercent: string;
}

export type ReturnCondition = "GOOD" | "DAMAGED" | "EXPIRED" | "WRONG_ITEM";
export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "JAZZCASH" | "EASYPAISA" | "CHEQUE";

export interface OutstandingIssue {
  id: string;
  issueNumber: string;
  issuedAt: string;
  totalAmount: string;
  paidAmount: string;
  balance: string;
}

export interface IssueSummary {
  id: string;
  issueNumber: string;
  issuedAt: string;
  totalAmount: string;
  customer: { id: string; name: string };
  lines: { id: string; itemName: string; qty: string; returnedQty: string }[];
}

export interface IssueDetailLine {
  id: string;
  itemId: string;
  itemName: string;
  unitCode: string;
  qty: string;
  unitPrice: string;
  unitCost: string;
  returnedQty: string;
  item: { id: string; isPerishable: boolean; returnWindowHours: number | null };
}

export interface IssueDetail {
  id: string;
  issueNumber: string;
  issuedAt: string;
  lines: IssueDetailLine[];
}

export interface ReturnListItem {
  id: string;
  returnNumber: string;
  createdAt: string;
  totalCreditAmount: string;
  totalCostWrittenOff: string;
  returnedByName: string | null;
  customer: { id: string; name: string };
  lines: { id: string }[];
}

export interface PaymentListItem {
  id: string;
  paymentNumber: string;
  amount: string;
  method: PaymentMethod;
  paymentDate: string;
  receivedByName: string;
  isReversed: boolean;
  reverseReason: string | null;
  customer: { id: string; name: string };
}

export interface PrintLine {
  id: string;
  itemId: string;
  itemName: string;
  itemNameUrdu: string | null;
  unitCode: string;
  qty: string;
  unitPrice: string;
  lineTotal: string;
  notes: string | null;
  isPerishable: boolean;
  location: string | null;
}

export interface PrintData {
  issue: {
    id: string;
    issueNumber: string;
    issuedAt: string;
    subtotal: string;
    discountAmount: string;
    totalAmount: string;
    paidAmount: string;
    paymentMethod: PaymentMethod | null;
    balanceBefore: string;
    balanceAfter: string;
    printCount: number;
    issuedByName: string;
    receivedByName: string | null;
    notes: string | null;
    lines: PrintLine[];
  };
  customer: {
    id: string;
    name: string;
    nameUrdu: string | null;
    code: string | null;
    phone: string | null;
    creditDays: number;
  };
  warehouse: {
    name: string;
    address: string | null;
    phone: string | null;
    ntn: string | null;
    currency: string;
    defaultReturnWindowHours: number;
    printMultipleTickets: boolean;
    receiptPaperWidth?: "80mm" | "58mm";
  };
  oldestUnpaid: { issueNumber: string; issuedAt: string } | null;
  perishableGuidance: Record<string, { receivedAt: string; batchNumber: string | null }>;
}

export type WastageReason =
  | "SPOILED"
  | "EXPIRED"
  | "DAMAGED"
  | "PEST"
  | "THEFT"
  | "POWER_OUTAGE"
  | "SPILLAGE"
  | "QUALITY_REJECT"
  | "OTHER";

export interface WastageListItem {
  id: string;
  wastageNumber: string;
  createdAt: string;
  qty: string;
  unitCode: string;
  costImpact: string;
  reason: WastageReason;
  attributedTo: string;
  reportedByName: string | null;
  approvedByName: string | null;
  item: { id: string; name: string };
}

export type StockCountType = "FULL" | "PARTIAL" | "SPOT";
export type StockCountStatus = "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface StockCountSessionListItem {
  id: string;
  countNumber: string;
  status: StockCountStatus;
  type: StockCountType;
  itemsCounted: number | null;
  itemsWithVariance: number | null;
  totalVarianceValue: string | null;
  startedByName: string | null;
  startedAt: string;
  completedAt: string | null;
  lines: { id: string }[];
}

export interface StockCountLine {
  id: string;
  itemId: string;
  systemQty: string;
  countedQty: string;
  variance: string;
  varianceValue: string;
  notes: string | null;
  countedByName: string | null;
  countedAt: string | null;
  item: { id: string; name: string; avgCostPerUnit: string; sellUnit: { code: string } };
}

export interface StockCountSessionDetail {
  id: string;
  countNumber: string;
  status: StockCountStatus;
  type: StockCountType;
  notes: string | null;
  startedByName: string | null;
  startedAt: string;
  completedAt: string | null;
  itemsCounted: number | null;
  itemsWithVariance: number | null;
  totalVarianceValue: string | null;
  lines: StockCountLine[];
}

export interface ProfitLossReport {
  from: string;
  to: string;
  issueCount: number;
  returnCount: number;
  grossRevenue: string;
  returnsCredit: string;
  discountsGiven: string;
  netRevenue: string;
  grossCogs: string;
  returnsCostReversed: string;
  cogs: string;
  grossProfit: string;
  grossMarginPercent: string;
  losses: { spoiled: string; damagedReturns: string; countShortages: string; total: string };
  expenses: { total: string; tracked: boolean };
  netProfit: string;
  netMarginPercent: string;
  per100: { cogs: string; losses: string; expenses: string; profit: string };
}

export interface MarginByItemRow {
  itemId: string;
  name: string;
  unitCode: string;
  qty: string;
  revenue: string;
  cost: string;
  margin: string;
  marginPercent: string;
}

export interface MarginWarning {
  itemId: string;
  name: string;
  unitCode: string;
  price: string;
  avgCost: string;
  marginPercent: string;
  floorPercent: string;
  costChange: { from: string; to: string; date: string } | null;
  suggestedPrice: string | null;
}

export interface SlowMovingItem {
  itemId: string;
  name: string;
  unitCode: string;
  stockQty: string;
  value: string;
}

export interface ItemProfitabilityReport {
  from: string;
  to: string;
  items: MarginByItemRow[];
  totals: { revenue: string; cost: string; margin: string; marginPercent: string };
  marginWarnings: MarginWarning[];
  slowMoving: { items: SlowMovingItem[]; capitalTiedUp: string };
}

export interface AgingBuckets {
  current: string;
  d8_15: string;
  d16_30: string;
  d30_plus: string;
}

export interface AgingRow extends AgingBuckets {
  customerId: string;
  name: string;
  phone: string | null;
  total: string;
}

export interface NeedsAttentionRow {
  customerId: string;
  name: string;
  phone: string | null;
  amount: string;
  oldestDays: number;
}

export interface AgingReport {
  rows: AgingRow[];
  totals: AgingBuckets & { grandTotal: string };
  percentOfTotal: AgingBuckets;
  needsAttention: NeedsAttentionRow[];
}

export interface StockReportRow {
  itemId: string;
  name: string;
  category: string;
  unitCode: string;
  stockQty: string;
  avgCost: string;
  value: string;
  status: "OK" | "LOW" | "OUT";
}

export interface StockReportCategory {
  name: string;
  items: StockReportRow[];
  subtotal: string;
}

export interface StockReport {
  categories: StockReportCategory[];
  grandTotal: string;
  outOfStock: string[];
  lowStock: { name: string; stockQty: string; unitCode: string }[];
  expiringSoon: { name: string; stockQty: string; unitCode: string; expiryDate: string; receivedAt: string }[];
}

export interface ReorderSuggestionRow {
  itemId: string;
  name: string;
  stockQty: string;
  sellUnitCode: string;
  avgDailyUsage: string;
  daysOfCover: string | null;
  reorderDays: number | null;
  shouldReorder: boolean;
  urgency: "urgent" | "soon" | "later" | null;
  suggestedQtySellUnits: string;
  suggestedQtyPurchaseUnits: string;
  purchaseUnitCode: string;
  estimatedCost: string;
  supplier: { id: string; name: string } | null;
}

export interface ShoppingListGroup {
  supplierId: string | null;
  supplierName: string;
  lines: ReorderSuggestionRow[];
  estimatedCost: string;
}

export interface ReorderList {
  items: ReorderSuggestionRow[];
  urgent: ReorderSuggestionRow[];
  soon: ReorderSuggestionRow[];
  shoppingList: ShoppingListGroup[];
  grandTotal: string;
  windowDays: number;
}

export interface SalesByCustomerRow {
  customerId: string;
  name: string;
  orders: number;
  sales: string;
  returns: string;
  net: string;
  owes: string;
  returnRatePercent: string;
}

export interface SalesByCustomerReport {
  from: string;
  to: string;
  customers: SalesByCustomerRow[];
  totals: { orders: number; sales: string; returns: string; net: string; owes: string };
  returnRate: {
    rows: { customerId: string; name: string; ratePercent: string }[];
    averagePercent: string;
    highestCustomerId: string | null;
  };
}

export interface WarehouseSettings {
  id: string;
  name: string;
  wastageApprovalThreshold: string;
  countVarianceApprovalThreshold: string;
  periodLockedBefore: string | null;
  printMultipleTickets: boolean;
  receiptPaperWidth?: "80mm" | "58mm";
}

export interface ReconciliationMismatch {
  delta: string;
  stored: string;
  expected: string;
  name: string;
  customerId?: string;
  itemId?: string;
}

export interface ReconciliationReport {
  checkedAt: string;
  customerMismatches: ReconciliationMismatch[];
  itemMismatches: ReconciliationMismatch[];
}

export interface ExpiryRow {
  itemId: string;
  name: string;
  stockQty: string;
  unitCode: string;
  oldestExpiredBatch: string | null;
  expiredOn: string;
  daysExpired: number;
}

export interface DailySummary {
  date: string;
  sales: { orderCount: number; grossSales: string; returnCount: number; returnsTotal: string; netSales: string };
  collections: { byMethod: { method: string; amount: string }[]; total: string };
  purchases: { receiptCount: number; total: string };
  wastage: { lines: { itemName: string; qty: string; unitCode: string; reason: string; costImpact: string }[]; total: string };
  orders: { issueNumber: string; customerName: string; totalAmount: string; status: "Paid" | "Partial" | "Unpaid" }[];
}

export interface PurchaseRegisterRow {
  id: string;
  receiptNumber: string;
  receivedAt: string;
  supplierName: string;
  invoiceNumber: string | null;
  lineCount: number;
  totalAmount: string;
}

export interface PurchaseRegister {
  from: string;
  to: string;
  rows: PurchaseRegisterRow[];
  grandTotal: string;
  bySupplier: { supplierId: string; name: string; total: string }[];
  priceChanges: { itemName: string; from: string; to: string; changePercent: string; date: string }[];
}

export interface WastageReportByReason {
  reason: string;
  count: number;
  total: string;
  percentOfTotal: string;
}

export interface WastageReportByItem {
  itemId: string;
  name: string;
  unitCode: string;
  qty: string;
  total: string;
  percentOfTotal: string;
  percentOfPurchases: string | null;
}

export interface WastageAnalyticsReport {
  from: string;
  to: string;
  total: string;
  byReason: WastageReportByReason[];
  byItem: WastageReportByItem[];
  dailyTrend: { date: string; total: string }[];
  observation: string | null;
}

export interface CustomerLedgerEntry {
  id: string;
  entryType: string;
  refNumber: string | null;
  debit: string;
  credit: string;
  balanceAfter: string;
  entryDate: string;
  description: string | null;
}

export interface CustomerStatement {
  openingBalance: string;
  closingBalance: string;
  entries: CustomerLedgerEntry[];
  aging: AgingBuckets;
}

export interface CartLine {
  itemId: string;
  name: string;
  unitCode: string;
  qty: number;
  /** How much +/- moves qty by: 1 for count items, 0.5 for weight/volume. */
  step: number;
  /** Whether an exact quantity (like 1.5) can be typed in, not just stepped. */
  fractional: boolean;
  unitPrice: number;
  avgCost: number;
  stockQty: number;
}
