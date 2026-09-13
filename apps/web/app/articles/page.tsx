import Link from "next/link";
import { Logo } from "@/components/logo";
import { ARTICLES } from "@/lib/articles";

export const metadata = {
  title: "Supply Insights & Operations Articles | Dineiz Supply POS",
  description:
    "Practical guides and financial engineering strategies for restaurant commissary warehouses, central kitchens, and food distributors in Pakistan.",
};

export default function ArticlesIndexPage() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <Logo variant="wordmark" theme="light" className="h-8" />
            <span className="rounded bg-surface px-2 py-0.5 text-xs font-semibold tracking-wide text-ink-muted border border-border">
              SUPPLY INSIGHTS
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-xs font-medium text-ink-muted hover:text-ink transition-colors"
            >
              ← Back to Main
            </Link>
            <Link
              href="/#terminal"
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent-hover transition-colors shadow-sm"
            >
              Launch Terminal
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="mb-10 text-center sm:text-left">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-ink-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            Warehouse &amp; Logistics Research
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            Food Sourcing, Costing &amp; Inventory Strategies
          </h1>
          <p className="mt-3 text-base text-ink-muted">
            Field-tested insights on running profitable multi-branch commissary warehouses, managing volatile mandi inflation, and eliminating waste in Pakistan.
          </p>
        </div>

        {/* Article Cards Grid */}
        <div className="space-y-6">
          {ARTICLES.map((article) => (
            <article
              key={article.slug}
              className="group rounded-xl border border-border bg-surface/50 p-6 transition-all duration-200 hover:border-accent/40 hover:bg-paper hover:shadow-md"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
                <span className="font-semibold uppercase tracking-wider text-accent">
                  {article.category}
                </span>
                <div className="flex items-center gap-2">
                  <span>{article.readTime}</span>
                  <span>•</span>
                  <span>{article.publishedAt}</span>
                </div>
              </div>

              <Link href={`/articles/${article.slug}`} className="mt-3 block">
                <h2 className="text-xl font-bold text-ink transition-colors group-hover:text-accent sm:text-2xl">
                  {article.title}
                </h2>
                {article.titleUrdu && (
                  <p className="mt-1 text-sm font-medium text-ink-muted" dir="rtl">
                    {article.titleUrdu}
                  </p>
                )}
                <p className="mt-3 text-sm text-ink-muted leading-relaxed">
                  {article.excerpt}
                </p>
              </Link>

              <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
                <div className="flex items-center gap-2 text-xs text-ink-muted">
                  <span className="h-6 w-6 rounded-full bg-accent/10 text-accent font-bold flex items-center justify-center text-[10px]">
                    {article.author.name.charAt(0)}
                  </span>
                  <span>{article.author.name}</span>
                </div>
                <Link
                  href={`/articles/${article.slug}`}
                  className="text-xs font-semibold text-accent hover:text-accent-hover inline-flex items-center gap-1"
                >
                  Read Full Article →
                </Link>
              </div>
            </article>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-surface py-8 text-center text-xs text-ink-muted">
        <p>© 2026 Dineiz Technologies. Food Service Supply Chain &amp; POS Systems.</p>
      </footer>
    </div>
  );
}
