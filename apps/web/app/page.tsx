"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, ApiError } from "@/lib/api";
import { saveSession, type SessionUser } from "@/lib/session";
import { SUPPLY_CATEGORIES, type SupplyCategory } from "@/lib/categories-data";
import { ARTICLES } from "@/lib/articles";

export default function LandingPage() {
  const router = useRouter();

  // Terminal Login State (embedded in modal / drawer)
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [loginMode, setLoginMode] = useState<"password" | "pin">("password");
  const [email, setEmail] = useState("supply@dineiz.com");
  const [password, setPassword] = useState("supply@123");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Category Selector State
  const [activeCategory, setActiveCategory] = useState<SupplyCategory>(SUPPLY_CATEGORIES[0]);

  async function handleLoginSubmit(body: Record<string, string>) {
    setError(null);
    setLoading(true);
    try {
      const result = await apiFetch<{ token: string; user: SessionUser }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
      });
      saveSession(result.token, result.user);
      router.push(result.user.role === "CLERK" || result.user.role === "VIEWER" ? "/counter" : "/items");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in. Check credentials.");
    } finally {
      setLoading(false);
    }
  }

  function handlePinDigit(digit: string) {
    if (loading) return;
    const next = (pin + digit).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      handleLoginSubmit({ pin: next }).finally(() => setPin(""));
    }
  }

  return (
    <div className="min-h-screen bg-paper text-ink selection:bg-accent/20 selection:text-accent font-sans">
      {/* ──────────────────────────────────────────────────────────────────────────
          1. NAVIGATION HEADER
      ────────────────────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border bg-paper/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <Logo variant="wordmark" theme="light" className="h-8 w-auto" />
              <span className="hidden sm:inline-block rounded-md border border-border bg-surface px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                SUPPLY POS
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-ink-muted">
              <a href="#overview" className="hover:text-ink transition-colors">
                Overview
              </a>
              <a href="#categories" className="hover:text-ink transition-colors">
                Categories
              </a>
              <a href="#features" className="hover:text-ink transition-colors">
                Engine &amp; POS
              </a>
              <a href="#articles" className="hover:text-ink transition-colors">
                Insights
              </a>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-ink-muted">
              <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
              <span>Depot Terminal Online</span>
            </div>

            <Button
              onClick={() => setIsLoginOpen(true)}
              className="bg-accent hover:bg-accent-hover text-accent-foreground text-xs font-semibold px-4 py-2 rounded-lg shadow-sm transition-all"
            >
              Sign In to Terminal →
            </Button>
          </div>
        </div>
      </header>

      {/* ──────────────────────────────────────────────────────────────────────────
          2. HERO SECTION
      ────────────────────────────────────────────────────────────────────────── */}
      <section id="overview" className="relative overflow-hidden border-b border-border bg-surface/40 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-center">
            {/* Hero Copy */}
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-3.5 py-1 text-xs font-semibold text-accent mb-6">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Dineiz Warehouse &amp; Wholesale Distribution OS
              </div>

              <h1 className="text-4xl font-extrabold tracking-tight text-ink sm:text-5xl lg:text-6xl leading-[1.15]">
                Wholesale supply &amp; POS terminal for commercial kitchens.
              </h1>

              <p className="mt-5 text-lg text-ink-muted leading-relaxed max-w-2xl">
                Engineered for Pakistani restaurant commissaries and wholesale food depots. Automate daily mandi rate recalculations, enforce moving-average costing, issue dual-sign delivery notes, and eliminate kitchen margin leakage.
              </p>

              {/* Action Buttons */}
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Button
                  onClick={() => setIsLoginOpen(true)}
                  className="h-12 px-6 rounded-lg bg-accent hover:bg-accent-hover text-accent-foreground font-semibold text-sm shadow-md transition-all"
                >
                  Launch Warehouse Terminal
                </Button>
                <a
                  href="#categories"
                  className="inline-flex h-12 items-center justify-center rounded-lg border border-border bg-paper px-6 text-sm font-medium text-ink hover:bg-surface transition-colors"
                >
                  Explore Supply Categories ↓
                </a>
              </div>

              {/* Trust Indicators */}
              <div className="mt-10 grid grid-cols-3 gap-6 border-t border-border pt-6 text-xs text-ink-muted">
                <div>
                  <div className="font-tabular text-lg font-bold text-ink">100% MAC</div>
                  <div>Moving Average Costing</div>
                </div>
                <div>
                  <div className="font-tabular text-lg font-bold text-ink">&lt; 1 Sec</div>
                  <div>80mm Thermal Slip Dispatch</div>
                </div>
                <div>
                  <div className="font-tabular text-lg font-bold text-ink">0% Variance</div>
                  <div>Multi-Unit Decimal Conversion</div>
                </div>
              </div>
            </div>

            {/* Hero Visual: Terminal Dispatch Simulation */}
            <div className="lg:col-span-5">
              <div className="relative rounded-2xl border border-border-strong bg-paper p-5 shadow-xl">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-danger/80" />
                    <span className="h-3 w-3 rounded-full bg-warning/80" />
                    <span className="h-3 w-3 rounded-full bg-success/80" />
                    <span className="ml-2 font-mono text-xs font-semibold text-ink-muted">
                      TERMINAL: DISPATCH #ISS-4092
                    </span>
                  </div>
                  <span className="rounded bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent">
                    LIVE
                  </span>
                </div>

                <div className="mt-4 space-y-3 font-mono text-xs">
                  <div className="rounded-md bg-surface p-2.5">
                    <div className="text-[11px] text-ink-muted">Customer / Branch</div>
                    <div className="font-bold text-ink">Dineiz - MM Alam Branch (BR-MMALAM)</div>
                    <div className="text-[10px] text-success">Credit Available: Rs. 984,200 (Limit: Rs. 1M)</div>
                  </div>

                  {/* Order lines preview */}
                  <div className="divide-y divide-border rounded-md border border-border bg-paper">
                    <div className="flex justify-between p-2 text-ink">
                      <div>
                        <div>Chicken Broiler Cleaned (صافی مرغی)</div>
                        <div className="text-[10px] text-ink-muted">40.00 KG × Rs. 620.00</div>
                      </div>
                      <div className="text-right font-bold">Rs. 24,800.00</div>
                    </div>
                    <div className="flex justify-between p-2 text-ink">
                      <div>
                        <div>Kainat 1121 Steam Rice (کائنات چاول)</div>
                        <div className="text-[10px] text-ink-muted">2.00 BORI (100 KG) × Rs. 380.00/KG</div>
                      </div>
                      <div className="text-right font-bold">Rs. 38,000.00</div>
                    </div>
                    <div className="flex justify-between p-2 text-ink">
                      <div>
                        <div>Fresh Dahi Kunda (کنڈے والا دہی)</div>
                        <div className="text-[10px] text-ink-muted">20.00 KG × Rs. 230.00</div>
                      </div>
                      <div className="text-right font-bold">Rs. 4,600.00</div>
                    </div>
                  </div>

                  {/* Total Bar */}
                  <div className="flex items-center justify-between rounded-lg bg-ink p-3 text-paper">
                    <div>
                      <div className="text-[10px] uppercase text-ink-faint">Dispatch Net Total</div>
                      <div className="text-sm font-bold text-paper">3 Items (160.00 KG)</div>
                    </div>
                    <div className="text-right text-base font-extrabold text-accent">
                      Rs. 67,400.00
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-[11px] text-ink-muted border-t border-border pt-3">
                  <span>Signed: Clerk Ahmed Khan</span>
                  <span className="font-semibold text-ink">Instant 80mm Print Ready</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────────────
          3. CATEGORIES SHOWCASE SECTION (Requested Category Section!)
      ────────────────────────────────────────────────────────────────────────── */}
      <section id="categories" className="py-16 sm:py-24 bg-paper border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="text-xs font-bold uppercase tracking-widest text-accent">
              WAREHOUSE INVENTORY CATALOG
            </span>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              Wholesale Food Categories &amp; Mandi Sourcing
            </h2>
            <p className="mt-3 text-sm text-ink-muted">
              Built for commercial kitchen demand. Every item is mapped with verified mandi sourcing origins, conversion factors (Bori to KG, Maund to Gram), and continuous cost tracking.
            </p>
          </div>

          {/* Category Navigation Pills */}
          <div className="flex flex-wrap justify-center gap-2 mb-10">
            {SUPPLY_CATEGORIES.map((cat) => {
              const isSelected = activeCategory.id === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat)}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all border ${
                    isSelected
                      ? "border-accent bg-accent text-accent-foreground shadow-sm"
                      : "border-border bg-surface text-ink hover:bg-surface-hover hover:border-border-strong"
                  }`}
                >
                  <span>{cat.name}</span>
                  <span className={`text-[11px] ${isSelected ? "opacity-90" : "text-ink-muted"}`} dir="rtl">
                    {cat.nameUrdu}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Category Deep-Dive Card */}
          <div className="rounded-2xl border border-border bg-surface/40 p-6 sm:p-8 lg:p-10 shadow-sm">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: Category Spec & Description */}
              <div className="lg:col-span-5 space-y-4">
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: activeCategory.colorHex }}
                  />
                  <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                    {activeCategory.badge}
                  </span>
                </div>

                <h3 className="text-2xl font-extrabold text-ink sm:text-3xl">
                  {activeCategory.name}
                </h3>
                <p className="text-lg font-medium text-ink-muted" dir="rtl">
                  {activeCategory.nameUrdu}
                </p>

                <p className="text-sm text-ink-muted leading-relaxed">
                  {activeCategory.description}
                </p>

                <div className="rounded-xl border border-border bg-paper p-4 space-y-2.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Mandi Source:</span>
                    <span className="font-semibold text-ink">{activeCategory.mandiSource}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Supported Units:</span>
                    <span className="font-semibold text-ink">{activeCategory.typicalUnits.join(", ")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Standard Shelf Life:</span>
                    <span className="font-semibold text-ink">{activeCategory.shelfLife}</span>
                  </div>
                </div>

                <Button
                  onClick={() => setIsLoginOpen(true)}
                  className="w-full bg-accent hover:bg-accent-hover text-accent-foreground text-xs font-semibold py-2.5"
                >
                  Issue {activeCategory.name} in POS →
                </Button>
              </div>

              {/* Right Column: Key Sourced Items Table */}
              <div className="lg:col-span-7">
                <div className="rounded-xl border border-border bg-paper overflow-hidden shadow-sm">
                  <div className="border-b border-border bg-surface px-4 py-3 text-xs font-semibold text-ink flex justify-between">
                    <span>High-Volume Kitchen Staples</span>
                    <span className="text-ink-muted">Live Warehouse Stocking</span>
                  </div>
                  <div className="divide-y divide-border">
                    {activeCategory.popularItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-2 hover:bg-surface/50 transition-colors"
                      >
                        <div>
                          <div className="font-bold text-sm text-ink">{item.name}</div>
                          <div className="text-xs text-ink-muted font-medium mt-0.5" dir="rtl">
                            {item.nameUrdu}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-xs">
                          <div className="text-right">
                            <div className="font-tabular font-bold text-ink">{item.avgPrice} / {item.unit}</div>
                            <div className="text-[10px] text-ink-muted">Wholesale Rate</div>
                          </div>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold border ${
                              item.stockStatus === "High"
                                ? "bg-success-surface text-success border-success/30"
                                : item.stockStatus === "Medium"
                                ? "bg-warning-surface text-warning border-warning/30"
                                : "bg-danger-surface text-danger border-danger/30"
                            }`}
                          >
                            {item.stockStatus} Stock
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-3 text-right text-[11px] text-ink-faint">
                  * Rates dynamically synchronized with recent Goods Receipts &amp; moving average cost engine.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────────────
          4. CORE SYSTEM CAPABILITIES / ENGINE
      ────────────────────────────────────────────────────────────────────────── */}
      <section id="features" className="py-16 sm:py-24 bg-surface/50 border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-bold uppercase tracking-widest text-accent">
              BUILT FOR HIGH-STAKES RESTAURANT COMMISSARIES
            </span>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              Four Core Invariants That Protect Your Margins
            </h2>
            <p className="mt-3 text-sm text-ink-muted">
              Designed specifically for multi-branch restaurant operations where standard retail POS systems fail.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Feature 1 */}
            <div className="rounded-xl border border-border bg-paper p-6 space-y-3 shadow-sm hover:border-accent/30 transition-colors">
              <div className="h-10 w-10 rounded-lg bg-accent/10 text-accent font-extrabold flex items-center justify-center text-base">
                01
              </div>
              <h3 className="text-base font-bold text-ink">Moving Average Costing</h3>
              <p className="text-xs text-ink-muted leading-relaxed">
                Recalculates actual lot cost on every incoming shipment. Enforces minimum margin floors and warns before selling items below current market replacement value.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="rounded-xl border border-border bg-paper p-6 space-y-3 shadow-sm hover:border-accent/30 transition-colors">
              <div className="h-10 w-10 rounded-lg bg-accent/10 text-accent font-extrabold flex items-center justify-center text-base">
                02
              </div>
              <h3 className="text-base font-bold text-ink">Fast Keyboard Counter POS</h3>
              <p className="text-xs text-ink-muted leading-relaxed">
                Dispatch deliveries in under 5 seconds with barcode scanner integration, client-side idempotency keys, and instant thermal delivery note printing.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="rounded-xl border border-border bg-paper p-6 space-y-3 shadow-sm hover:border-accent/30 transition-colors">
              <div className="h-10 w-10 rounded-lg bg-accent/10 text-accent font-extrabold flex items-center justify-center text-base">
                03
              </div>
              <h3 className="text-base font-bold text-ink">Customer Ledger &amp; Aging</h3>
              <p className="text-xs text-ink-muted leading-relaxed">
                Khata management with automated credit days (15/30 days) and credit limits. Single-click PDF/Excel customer statement exports and payment allocations.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="rounded-xl border border-border bg-paper p-6 space-y-3 shadow-sm hover:border-accent/30 transition-colors">
              <div className="h-10 w-10 rounded-lg bg-accent/10 text-accent font-extrabold flex items-center justify-center text-base">
                04
              </div>
              <h3 className="text-base font-bold text-ink">Wastage &amp; Cold-Chain Audit</h3>
              <p className="text-xs text-ink-muted leading-relaxed">
                Attribute spoilage to warehouse, supplier, or customer return. Loss entries over Rs. 2,000 require manager override authorization with full audit logging.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────────────
          5. ARTICLES / SUPPLY INSIGHTS SECTION (Requested Articles!)
      ────────────────────────────────────────────────────────────────────────── */}
      <section id="articles" className="py-16 sm:py-24 bg-paper border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-accent">
                SUPPLY CHAIN KNOWLEDGE BASE
              </span>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
                Industry Insights &amp; Operational Playbooks
              </h2>
              <p className="mt-2 text-sm text-ink-muted max-w-2xl">
                Practical guides written for restaurant owners, central kitchen managers, and commercial procurement heads in Pakistan.
              </p>
            </div>

            <Link
              href="/articles"
              className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:text-accent-hover transition-colors"
            >
              View All Insights Archive →
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {ARTICLES.map((article) => (
              <article
                key={article.slug}
                className="group flex flex-col justify-between rounded-xl border border-border bg-surface/40 p-6 transition-all duration-200 hover:border-accent/40 hover:bg-paper hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between text-[11px] text-ink-muted mb-3">
                    <span className="font-semibold uppercase tracking-wider text-accent">
                      {article.category}
                    </span>
                    <span>{article.readTime}</span>
                  </div>

                  <Link href={`/articles/${article.slug}`}>
                    <h3 className="text-lg font-bold text-ink transition-colors group-hover:text-accent leading-snug">
                      {article.title}
                    </h3>
                    {article.titleUrdu && (
                      <p className="mt-1 text-xs font-medium text-ink-muted" dir="rtl">
                        {article.titleUrdu}
                      </p>
                    )}
                    <p className="mt-3 text-xs text-ink-muted line-clamp-3 leading-relaxed">
                      {article.excerpt}
                    </p>
                  </Link>
                </div>

                <div className="mt-6 border-t border-border pt-4 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-ink-muted">
                    {article.author.name}
                  </span>
                  <Link
                    href={`/articles/${article.slug}`}
                    className="text-xs font-bold text-accent group-hover:underline"
                  >
                    Read Guide →
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────────────
          6. FOOTER
      ────────────────────────────────────────────────────────────────────────── */}
      <footer className="bg-surface py-12 border-t border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div className="md:col-span-2 space-y-3">
              <Logo variant="wordmark" theme="light" className="h-8" />
              <p className="text-xs text-ink-muted max-w-md leading-relaxed">
                Dineiz Supply is a specialized warehouse inventory &amp; POS system designed for multi-branch restaurant operations, central kitchens, and wholesale food distributors across Pakistan.
              </p>
              <div className="text-xs font-mono text-ink-faint">
                Depot Location: Plot 42, SITE Industrial Area / Badami Bagh Depot, Lahore
              </div>
            </div>

            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-ink mb-3">
                Wholesale Categories
              </div>
              <ul className="space-y-2 text-xs text-ink-muted">
                <li><a href="#categories" className="hover:text-ink">Gosht &amp; Poultry</a></li>
                <li><a href="#categories" className="hover:text-ink">Sabzi Mandi Produce</a></li>
                <li><a href="#categories" className="hover:text-ink">Doodh, Dahi &amp; Khoya</a></li>
                <li><a href="#categories" className="hover:text-ink">Akbari Mandi Ration</a></li>
              </ul>
            </div>

            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-ink mb-3">
                Warehouse Access
              </div>
              <ul className="space-y-2 text-xs text-ink-muted">
                <li>
                  <button onClick={() => setIsLoginOpen(true)} className="hover:text-accent">
                    Terminal Login (Manager)
                  </button>
                </li>
                <li>
                  <button onClick={() => { setIsLoginOpen(true); setLoginMode("pin"); }} className="hover:text-accent">
                    Clerk Quick PIN Login
                  </button>
                </li>
                <li><Link href="/articles" className="hover:text-ink">Supply Articles</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-border pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-ink-faint gap-2">
            <div>© 2026 Dineiz Technologies. All rights reserved.</div>
            <div className="flex gap-4">
              <span>PKR Currency Standard</span>
              <span>•</span>
              <span>Asia/Karachi Timezone</span>
            </div>
          </div>
        </div>
      </footer>

      {/* ──────────────────────────────────────────────────────────────────────────
          7. TERMINAL SIGN-IN MODAL
      ────────────────────────────────────────────────────────────────────────── */}
      {isLoginOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-[24rem] rounded-2xl border border-border bg-paper p-6 shadow-2xl">
            <button
              onClick={() => setIsLoginOpen(false)}
              className="absolute top-4 right-4 text-ink-muted hover:text-ink text-sm font-bold p-1"
            >
              ✕
            </button>

            <div className="mb-6 text-center">
              <Logo variant="wordmark" theme="light" className="h-8 mx-auto" />
              <div className="mt-1 text-xs text-ink-muted">Access Warehouse POS Terminal</div>
            </div>

            <div className="mb-6 flex gap-4 border-b border-border">
              <button
                onClick={() => {
                  setLoginMode("password");
                  setError(null);
                }}
                className={`-mb-px border-b-2 pb-2.5 text-sm font-medium transition-colors ${
                  loginMode === "password"
                    ? "border-accent text-ink"
                    : "border-transparent text-ink-faint hover:text-ink-muted"
                }`}
              >
                Manager Password
              </button>
              <button
                onClick={() => {
                  setLoginMode("pin");
                  setError(null);
                }}
                className={`-mb-px border-b-2 pb-2.5 text-sm font-medium transition-colors ${
                  loginMode === "pin"
                    ? "border-accent text-ink"
                    : "border-transparent text-ink-faint hover:text-ink-muted"
                }`}
              >
                Clerk PIN
              </button>
            </div>

            {loginMode === "password" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleLoginSubmit({ email, password });
                }}
                className="space-y-3"
              >
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-muted">Email Address</label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="supply@dineiz.com"
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-muted">Password</label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="mt-3 w-full bg-accent hover:bg-accent-hover text-accent-foreground font-semibold"
                >
                  {loading ? "Verifying…" : "Sign In to Terminal"}
                </Button>
              </form>
            ) : (
              <div className="flex flex-col items-center">
                <div className="mb-4 flex gap-3">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={`h-3 w-3 rounded-full border transition-colors ${
                        i < pin.length ? "border-accent bg-accent" : "border-border-strong bg-transparent"
                      }`}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                    <button
                      key={d}
                      onClick={() => handlePinDigit(d)}
                      disabled={loading}
                      className="h-12 w-12 rounded-md border border-border text-base font-semibold text-ink hover:bg-surface disabled:opacity-40 transition-colors"
                    >
                      {d}
                    </button>
                  ))}
                  <div />
                  <button
                    onClick={() => handlePinDigit("0")}
                    disabled={loading}
                    className="h-12 w-12 rounded-md border border-border text-base font-semibold text-ink hover:bg-surface disabled:opacity-40 transition-colors"
                  >
                    0
                  </button>
                  <button
                    onClick={() => setPin(pin.slice(0, -1))}
                    disabled={loading || pin.length === 0}
                    className="h-12 w-12 rounded-md text-xs font-semibold text-ink-muted hover:bg-surface disabled:opacity-40 transition-colors"
                  >
                    ⌫
                  </button>
                </div>
              </div>
            )}

            {error && (
              <p className="mt-4 rounded-md bg-danger-surface px-3 py-2 text-xs text-danger text-center">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
