import { type ReactNode } from "react";
import Link from "next/link";

/** "← Deliveries": the way back to the list the record was opened from. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="mb-3 inline-block text-sm font-medium text-ink-muted hover:text-ink">
      ← {children}
    </Link>
  );
}

/** A link that looks like the secondary Button, for actions that open another page or tab. */
export function ActionLink({ href, children, newTab = false }: { href: string; children: ReactNode; newTab?: boolean }) {
  return (
    <a
      href={href}
      {...(newTab ? { target: "_blank", rel: "noreferrer" } : {})}
      className="inline-flex h-11 items-center justify-center rounded-md border border-border-strong bg-paper px-4 text-sm font-medium text-ink transition-colors hover:bg-surface"
    >
      {children}
    </a>
  );
}

/** Title, one line of who/when, status chips on the right of it, and actions. */
export function DetailHeader({
  title,
  subtitle,
  chips,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  chips?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-ink">{title}</h1>
          {chips}
        </div>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** A titled white card. `flush` drops the padding for tables that run edge to edge. */
export function Card({
  title,
  aside,
  children,
  flush = false,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-paper">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</h2>
        {aside}
      </div>
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

/** Label / value pairs: who, when, which customer. */
export function Facts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs font-medium text-ink-muted">{item.label}</dt>
          <dd className="mt-0.5 text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One line of a money summary; `strong` for the total, `tone` to flag what is still owed. */
export function MoneyRow({
  label,
  value,
  strong = false,
  tone,
  note,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "success" | "warning" | "danger";
  note?: string;
}) {
  const toneClass = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "danger" ? "text-danger" : "text-ink";
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 text-sm ${strong ? "border-t border-border pt-2.5 font-semibold" : ""}`}>
      <span className={strong ? "text-ink" : "text-ink-muted"}>
        {label}
        {note && <span className="ml-2 text-xs font-normal text-ink-faint">{note}</span>}
      </span>
      <span className={`font-tabular ${toneClass}`}>{value}</span>
    </div>
  );
}
