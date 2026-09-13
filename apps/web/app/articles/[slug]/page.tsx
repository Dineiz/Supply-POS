import { notFound } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ARTICLES } from "@/lib/articles";

export async function generateStaticParams() {
  return ARTICLES.map((article) => ({
    slug: article.slug,
  }));
}

interface ArticlePageProps {
  params: Promise<{ slug: string }>;
}

export default async function ArticleDetailPage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const article = ARTICLES.find((a) => a.slug === slug);

  if (!article) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <Logo variant="wordmark" theme="light" className="h-8" />
            <span className="rounded bg-surface px-2 py-0.5 text-xs font-semibold tracking-wide text-ink-muted border border-border">
              SUPPLY INSIGHTS
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/articles"
              className="text-xs font-medium text-ink-muted hover:text-ink transition-colors"
            >
              ← All Articles
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

      {/* Article Content */}
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        {/* Meta Header */}
        <div className="border-b border-border pb-8">
          <div className="flex items-center gap-3 text-xs text-ink-muted">
            <span className="font-semibold uppercase tracking-wider text-accent">
              {article.category}
            </span>
            <span>•</span>
            <span>{article.readTime}</span>
            <span>•</span>
            <span>{article.publishedAt}</span>
          </div>

          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl leading-tight">
            {article.title}
          </h1>

          {article.titleUrdu && (
            <p className="mt-2 text-lg font-medium text-ink-muted" dir="rtl">
              {article.titleUrdu}
            </p>
          )}

          <div className="mt-6 flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-accent/10 text-accent font-bold flex items-center justify-center text-sm">
              {article.author.name.charAt(0)}
            </div>
            <div>
              <div className="text-sm font-semibold text-ink">{article.author.name}</div>
              <div className="text-xs text-ink-muted">{article.author.role}</div>
            </div>
          </div>
        </div>

        {/* Intro */}
        <div className="py-8">
          <p className="text-lg leading-relaxed text-ink font-normal border-l-4 border-accent pl-4 italic bg-surface/40 py-2 rounded-r">
            {article.content.intro}
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-10">
          {article.content.sections.map((section, idx) => (
            <section key={idx} className="space-y-4">
              <h2 className="text-2xl font-bold tracking-tight text-ink">
                {section.heading}
              </h2>
              <p className="text-base leading-relaxed text-ink-muted">
                {section.body}
              </p>

              {section.highlight && (
                <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 text-sm font-medium text-ink">
                  {section.highlight}
                </div>
              )}

              {section.bulletPoints && section.bulletPoints.length > 0 && (
                <ul className="space-y-2 pl-5 list-disc text-sm text-ink-muted">
                  {section.bulletPoints.map((point, pIdx) => (
                    <li key={pIdx} className="leading-relaxed">
                      {point}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        {/* Conclusion */}
        <div className="mt-12 rounded-xl border border-border bg-surface p-6">
          <h3 className="text-base font-bold text-ink mb-2">Key Takeaway</h3>
          <p className="text-sm text-ink-muted leading-relaxed">
            {article.content.conclusion}
          </p>
        </div>

        {/* Bottom CTA */}
        <div className="mt-12 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-border bg-gradient-to-r from-surface to-paper p-6">
          <div>
            <h4 className="font-bold text-ink">Ready to automate your restaurant warehouse?</h4>
            <p className="text-xs text-ink-muted mt-0.5">
              Sign in to your Dineiz Supply POS terminal to experience real-time moving average costing.
            </p>
          </div>
          <Link
            href="/#terminal"
            className="rounded-md bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:bg-accent-hover transition-colors whitespace-nowrap shadow-sm"
          >
            Launch POS Terminal
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-surface py-8 text-center text-xs text-ink-muted">
        <p>© 2026 Dineiz Technologies. Food Service Supply Chain &amp; POS Systems.</p>
      </footer>
    </div>
  );
}
