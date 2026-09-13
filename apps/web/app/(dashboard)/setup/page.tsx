import Link from "next/link";

const CARDS = [
  { href: "/setup/units", name: "Units", description: "kg, bags, litres, pieces — and how they convert into each other" },
  { href: "/setup/categories", name: "Categories", description: "Group your items, mark which ones go off quickly, pick counter-screen colors" },
  { href: "/setup/suppliers", name: "Suppliers", description: "Who you buy from — contact details, how you pay them, how good they are" },
];

export default function SetupHubPage() {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Setup</h1>
        <p className="text-sm text-ink-muted">Set these up once — Items and Receiving both use them.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-lg border border-border bg-paper p-4 transition-colors hover:border-accent hover:bg-accent/5"
          >
            <p className="text-sm font-medium text-ink">{c.name}</p>
            <p className="mt-1 text-xs text-ink-muted">{c.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
