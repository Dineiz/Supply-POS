import Link from "next/link";

const SECTIONS: { title: string; reports: { href: string; name: string; description: string }[] }[] = [
  {
    title: "Daily",
    reports: [
      { href: "/reports/daily-summary", name: "Daily Summary", description: "Today's close" },
    ],
  },
  {
    title: "Money",
    reports: [
      { href: "/reports/customer-statement", name: "Customer Statement", description: "Who owes what" },
      { href: "/reports/receivables-aging", name: "Overdue Payments", description: "Overdue amounts" },
      { href: "/reports/profit-loss", name: "Profit & Loss", description: "Revenue, cost, and margin" },
      { href: "/reports/item-profitability", name: "Profit by Item", description: "Where the profit comes from" },
    ],
  },
  {
    title: "Stock",
    reports: [
      { href: "/reports/stock-report", name: "Stock Report", description: "What you have" },
      { href: "/reports/reorder-list", name: "Reorder List", description: "What to buy" },
      { href: "/reports/wastage-report", name: "Wastage Report", description: "What you lost" },
    ],
  },
  {
    title: "Purchases",
    reports: [
      { href: "/reports/purchase-register", name: "Purchase History", description: "What you bought" },
    ],
  },
  {
    title: "Customers",
    reports: [
      { href: "/reports/sales-by-customer", name: "Sales by Customer", description: "Who buys most" },
    ],
  },
  {
    title: "Data integrity",
    reports: [
      { href: "/reports/reconciliation", name: "Data Check", description: "Double-checks that balances and stock all add up correctly" },
      { href: "/reports/expiry", name: "Expired Stock", description: "Perishable items with a batch past its expiry date" },
    ],
  },
];

export default function ReportsHubPage() {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Reports</h1>
        <p className="text-sm text-ink-muted">Pick a report. Each one opens with a date range and a Print / PDF / Excel option.</p>
      </div>

      <div className="space-y-8">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">{section.title}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {section.reports.map((r) => (
                <Link
                  key={r.href}
                  href={r.href}
                  className="rounded-lg border border-border bg-paper p-4 transition-colors hover:border-accent hover:bg-accent/5"
                >
                  <p className="text-sm font-medium text-ink">{r.name}</p>
                  <p className="mt-1 text-xs text-ink-muted">{r.description}</p>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
