"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { CustomerPicker } from "@/components/counter/customer-picker";
import { QtyStepper } from "@/components/counter/qty-stepper";
import { OverrideModal } from "@/components/shared/override-modal";
import { PaymentModal } from "@/components/counter/payment-modal";
import { ReturnModal } from "@/components/counter/return-modal";
import { authFetch, ApiError } from "@/lib/api";
import { getSessionUser, getToken, clearSession, type SessionUser } from "@/lib/session";
import { useCounterStore } from "@/lib/store";
import { formatMoney, formatUnitCode } from "@/lib/format";
import type { Item } from "@/lib/types";

interface IssueResult {
  id: string;
  issueNumber: string;
  totalAmount: string;
  balanceAfter: string;
}

function openPrintTab(issueId: string) {
  const win = window.open(`/print/issue/${issueId}`, "_blank");
  return win !== null;
}

interface BlockInfo {
  message: string;
  shortItems: { itemId: string; name: string }[];
}

export default function CounterPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | "ALL">("ALL");
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [block, setBlock] = useState<BlockInfo | null>(null);
  const [showOverride, setShowOverride] = useState(false);
  const [override, setOverride] = useState<{ authorizedById: string; authorizedByName: string; reason: string } | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);
  const [lastIssue, setLastIssue] = useState<IssueResult | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [showPayment, setShowPayment] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [printBlocked, setPrintBlocked] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [printMultipleTickets, setPrintMultipleTickets] = useState(false);

  const { items, customers, catalogueLoaded, setCatalogue, customerId, setCustomerId, lines, addItem, incrementLine, decrementLine, setLineQty, removeLine, clearCart } =
    useCounterStore();

  useEffect(() => {
    const sessionUser = getSessionUser();
    if (!getToken() || !sessionUser) {
      router.push("/");
      return;
    }
    setUser(sessionUser);

    Promise.all([
      authFetch<Item[]>("/items"),
      authFetch<import("@/lib/types").Customer[]>("/customers"),
      authFetch<{ printMultipleTickets: boolean }>("/warehouse/letterhead"),
    ])
      .then(([itemsRes, customersRes, warehouseRes]) => {
        setCatalogue(itemsRes, customersRes);
        setPrintMultipleTickets(warehouseRes.printMultipleTickets);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Could not reach the server."));
  }, [router, setCatalogue]);

  const categories = useMemo(() => {
    const map = new Map<string, { id: string; name: string; colorHex: string | null }>();
    for (const item of items) {
      if (item.category) map.set(item.category.id, item.category);
    }
    return Array.from(map.values());
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (activeCategory !== "ALL" && item.category?.id !== activeCategory) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.nameUrdu?.toLowerCase().includes(q) ||
        item.barcode?.toLowerCase().includes(q)
      );
    });
  }, [items, search, activeCategory]);

  const customer = customers.find((c) => c.id === customerId) ?? null;

  const subtotal = lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
  const customerDiscount = customer ? (subtotal * Number(customer.discountPercent)) / 100 : 0;
  const total = subtotal - customerDiscount;
  const previousBalance = customer ? Number(customer.currentBalance) : 0;
  const newBalance = previousBalance + total;

  function handleLogout() {
    clearSession();
    router.push("/");
  }

  async function refreshCatalogue() {
    const [itemsRes, customersRes] = await Promise.all([
      authFetch<Item[]>("/items"),
      authFetch<import("@/lib/types").Customer[]>("/customers"),
    ]);
    setCatalogue(itemsRes, customersRes);
  }

  async function handleIssue() {
    if (!customer || lines.length === 0) return;
    setSubmitting(true);
    setBlock(null);

    // Pre-open print window synchronously within the user gesture so mobile and desktop browsers don't block it as a popup.
    const printWin = typeof window !== "undefined" ? window.open("", "_blank") : null;
    if (printWin) {
      try {
        printWin.document.title = "Preparing receipt…";
      } catch {
        // Ignore cross-origin access restriction if any
      }
    }

    try {
      const result = await authFetch<IssueResult>("/issues", {
        method: "POST",
        headers: { "x-idempotency-key": idempotencyKey },
        body: JSON.stringify({
          customerId: customer.id,
          lines: lines.map((l) => ({ itemId: l.itemId, qty: l.qty, unitPrice: l.unitPrice })),
          override: override ?? undefined,
        }),
      });
      setLastIssue(result);

      if (printWin && !printWin.closed) {
        printWin.location.href = `/print/issue/${result.id}`;
        setPrintBlocked(false);
      } else {
        const opened = openPrintTab(result.id);
        setPrintBlocked(!opened);
      }

      clearCart();
      setOverride(null);
      setIdempotencyKey(crypto.randomUUID());
      await refreshCatalogue();
    } catch (err) {
      if (printWin && !printWin.closed) {
        printWin.close();
      }
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { message: string; shortItems: BlockInfo["shortItems"] };
        setBlock(body);
      } else {
        setBlock({ message: "Could not save this order. Try again.", shortItems: [] });
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) return null;

  const initials = user.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  const cartLines = (
    <div className="flex-1 overflow-y-auto px-4 py-2">
      {lines.length === 0 && <p className="py-8 text-center text-sm text-ink-faint">No items yet</p>}
      {lines.map((line) => (
        <div key={line.itemId} className="flex items-center justify-between gap-3 border-b border-border py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{line.name}</p>
            {line.nameUrdu && (
              <p className="font-urdu text-sm font-bold text-accent" dir="rtl">
                {line.nameUrdu}
              </p>
            )}
            <p className="font-tabular mt-0.5 text-xs text-ink-muted">
              {formatMoney(line.unitPrice)}/{formatUnitCode(line.unitCode)} = {formatMoney(line.qty * line.unitPrice)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <QtyStepper
              qty={line.qty}
              unitCode={line.unitCode}
              fractional={line.fractional}
              size="spacious"
              onIncrement={() => incrementLine(line.itemId)}
              onDecrement={() => decrementLine(line.itemId)}
              onSetQty={(qty) => setLineQty(line.itemId, qty)}
            />
            <button
              onClick={() => removeLine(line.itemId)}
              className="text-ink-faint hover:text-danger"
              aria-label="Remove"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );

  const cartSummary = (
    <div className="border-t border-border px-4 py-3">
      <div className="space-y-1 text-sm">
        <div className="flex justify-between text-ink-muted">
          <span>Subtotal</span>
          <span className="font-tabular">{formatMoney(subtotal)}</span>
        </div>
        {customerDiscount > 0 && (
          <div className="flex justify-between text-ink-muted">
            <span>Discount</span>
            <span className="font-tabular">−{formatMoney(customerDiscount)}</span>
          </div>
        )}
        <div className="flex justify-between text-base font-semibold text-ink">
          <span>Total</span>
          <span className="font-tabular">{formatMoney(total)}</span>
        </div>
      </div>

      {customer && lines.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-border pt-2 text-xs text-ink-muted">
          <div className="flex justify-between">
            <span>Previous balance</span>
            <span className="font-tabular">{formatMoney(previousBalance)}</span>
          </div>
          <div className="flex justify-between font-medium text-ink">
            <span>New balance</span>
            <span className="font-tabular">{formatMoney(newBalance)}</span>
          </div>
        </div>
      )}

      {block && (
        <div className="mt-3 rounded-md bg-danger-surface px-3 py-2 text-xs text-danger">
          <p>{block.message}</p>
          {block.shortItems.length > 0 && (
            <ul className="mt-1 list-disc pl-4">
              {block.shortItems.map((s) => (
                <li key={s.itemId}>{s.name}</li>
              ))}
            </ul>
          )}
          <button
            onClick={() => setShowOverride(true)}
            className="mt-2 font-medium underline underline-offset-2"
          >
            Get manager override
          </button>
        </div>
      )}

      {override && (
        <p className="mt-2 rounded-md bg-success-surface px-3 py-2 text-xs text-success">
          Override approved by {override.authorizedByName}
        </p>
      )}

      {lastIssue && (
        <div className="mt-3 rounded-md bg-success-surface px-3 py-2 text-xs text-success">
          <p className="font-medium">Delivered {lastIssue.issueNumber}</p>
          <p className="font-tabular">New balance: {formatMoney(lastIssue.balanceAfter)}</p>
          {printBlocked ? (
            <button
              onClick={() => setPrintBlocked(!openPrintTab(lastIssue.id))}
              className="mt-1 font-medium underline underline-offset-2"
            >
              Pop-up blocked — tap to print
            </button>
          ) : (
            <button
              onClick={() => openPrintTab(lastIssue.id)}
              className="mt-1 font-medium underline underline-offset-2"
            >
              Print again
            </button>
          )}
        </div>
      )}

      {successMessage && (
        <p className="mt-3 rounded-md bg-success-surface px-3 py-2 text-xs text-success">{successMessage}</p>
      )}

      <Button
        onClick={handleIssue}
        disabled={!customer || lines.length === 0 || submitting}
        className="mt-3 w-full"
      >
        {submitting ? "Sending…" : printMultipleTickets ? "Deliver & Print Multiple" : "Deliver & Print"}
      </Button>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={!customer}
          onClick={() => setShowPayment(true)}
        >
          Payment
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!customer}
          onClick={() => setShowReturn(true)}
        >
          Return
        </Button>
        <Button type="button" variant="ghost" disabled={lines.length === 0} onClick={clearCart}>
          Clear
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-border bg-paper px-4 py-3">
        <Logo variant="wordmark" theme="light" className="h-8" />
        <div className="flex items-center gap-3">
          {(user.role === "OWNER" || user.role === "MANAGER") && (
            <a href="/items" className="text-sm font-medium text-ink-muted hover:text-ink">
              Manage
            </a>
          )}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground"
              aria-label="Account menu"
            >
              {initials}
            </button>
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 top-11 z-50 w-48 overflow-hidden rounded-lg border border-border bg-paper shadow-lg">
                  <div className="border-b border-border px-3 py-2.5">
                    <p className="truncate text-sm font-medium text-ink">{user.name}</p>
                    <p className="text-xs text-ink-faint">{user.role === "OWNER" ? "Owner" : user.role === "MANAGER" ? "Manager" : "Clerk"}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="block w-full px-3 py-2 text-left text-sm text-ink-muted hover:bg-surface hover:text-ink"
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="border-b border-border bg-paper px-4 py-3">
        {customer ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">{customer.name}</p>
              <p className="font-tabular text-xs text-ink-muted">Owes: {formatMoney(customer.currentBalance)}</p>
            </div>
            <Button variant="secondary" onClick={() => setShowCustomerPicker(true)}>
              Change
            </Button>
          </div>
        ) : (
          <Button variant="primary" onClick={() => setShowCustomerPicker(true)}>
            Select customer
          </Button>
        )}
      </div>

      {loadError && <p className="bg-danger-surface px-4 py-2 text-sm text-danger">{loadError}</p>}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-full flex-1 flex-col overflow-hidden md:border-r md:border-border">
          <div className="border-b border-border bg-paper p-3">
            <Input
              placeholder="Search items…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setActiveCategory("ALL")}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                  activeCategory === "ALL" ? "bg-ink text-white" : "bg-surface text-ink-muted hover:text-ink"
                }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                    activeCategory === cat.id ? "bg-ink text-white" : "bg-surface text-ink-muted hover:text-ink"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto p-3 pb-24 sm:grid-cols-3 md:pb-3 lg:grid-cols-4">
            {!catalogueLoaded && (
              <p className="col-span-full py-12 text-center text-sm text-ink-muted">Loading catalogue…</p>
            )}
            {catalogueLoaded && filteredItems.length === 0 && (
              <p className="col-span-full py-12 text-center text-sm text-ink-muted">No items match.</p>
            )}
            {filteredItems.map((item) => {
              const stock = Number(item.stockQty);
              const minStock = item.minStockQty ? Number(item.minStockQty) : null;
              const isOut = stock <= 0;
              const isLow = !isOut && minStock !== null && stock <= minStock;
              const cartLine = lines.find((l) => l.itemId === item.id);
              const inCart = !!cartLine;
              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={isOut ? -1 : 0}
                  aria-disabled={isOut}
                  onClick={() => !isOut && addItem(item)}
                  onKeyDown={(e) => {
                    if (!isOut && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      addItem(item);
                    }
                  }}
                  className={`flex flex-col items-start rounded-lg border-2 p-3.5 text-left transition-all duration-100 active:scale-[0.96] ${
                    isOut
                      ? "cursor-not-allowed border-border bg-surface opacity-60"
                      : inCart
                        ? "cursor-pointer border-accent bg-accent/5 active:bg-accent/10"
                        : isLow
                          ? "cursor-pointer border-warning-surface bg-warning-surface hover:border-warning active:border-warning"
                          : "cursor-pointer border-border bg-paper hover:border-accent active:border-accent active:bg-surface-hover"
                  }`}
                >
                  <div className="w-full">
                    <p className="text-base font-bold leading-snug text-ink">{item.name}</p>
                    {item.nameUrdu && (
                      <p className="font-urdu mt-0.5 text-lg font-bold text-accent leading-normal" dir="rtl">
                        {item.nameUrdu}
                      </p>
                    )}
                  </div>
                  <p className="font-tabular mt-1.5 text-sm font-medium text-ink-muted">
                    {formatMoney(item.price)}/{formatUnitCode(item.unitCode)}
                  </p>
                  <p
                    className={`font-tabular mt-2 text-sm font-medium ${
                      isOut ? "text-danger" : isLow ? "text-warning" : "text-ink-faint"
                    }`}
                  >
                    {isOut ? "Out of stock" : `${isLow ? "⚠ " : ""}${stock} ${formatUnitCode(item.unitCode)}`}
                  </p>
                  {cartLine && (
                    <div className="mt-3">
                      <QtyStepper
                        qty={cartLine.qty}
                        unitCode={cartLine.unitCode}
                        fractional={cartLine.fractional}
                        onIncrement={() => incrementLine(item.id)}
                        onDecrement={() => decrementLine(item.id)}
                        onSetQty={(qty) => setLineQty(item.id, qty)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="hidden md:flex md:w-full md:max-w-sm md:flex-col md:bg-paper">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Order</h2>
          </div>
          {cartLines}
          {cartSummary}
        </div>
      </div>

      <button
        onClick={() => setCartOpen(true)}
        className="fixed inset-x-3 z-20 flex items-center justify-between rounded-2xl bg-ink px-5 py-3.5 text-white shadow-lg transition-transform active:scale-[0.98] md:hidden"
        style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <span className="text-sm font-medium">
          {lines.length === 0 ? "Order" : `${lines.length} item${lines.length > 1 ? "s" : ""}`}
        </span>
        <span className="font-tabular flex items-center gap-1.5 text-sm font-semibold">
          {formatMoney(total)}
          <span className="text-white/70">▲</span>
        </span>
      </button>

      {cartOpen && (
        <Modal title="Order" position="bottom" onClose={() => setCartOpen(false)}>
          {cartLines}
          {cartSummary}
        </Modal>
      )}

      {showCustomerPicker && (
        <CustomerPicker
          customers={customers}
          onSelect={(id) => {
            setCustomerId(id);
            setShowCustomerPicker(false);
          }}
          onClose={() => setShowCustomerPicker(false)}
        />
      )}

      {showOverride && (
        <OverrideModal
          title="Manager override"
          onClose={() => setShowOverride(false)}
          onAuthorized={(info) => {
            setOverride(info);
            setBlock(null);
            setShowOverride(false);
          }}
        />
      )}

      {showPayment && customer && (
        <PaymentModal
          customer={customer}
          onClose={() => setShowPayment(false)}
          onSuccess={async () => {
            setShowPayment(false);
            setSuccessMessage(`Payment recorded for ${customer.name}.`);
            setLastIssue(null);
            await refreshCatalogue();
          }}
        />
      )}

      {showReturn && customer && (
        <ReturnModal
          customer={customer}
          items={items}
          onClose={() => setShowReturn(false)}
          onSuccess={async () => {
            setShowReturn(false);
            setSuccessMessage(`Return recorded for ${customer.name}.`);
            setLastIssue(null);
            await refreshCatalogue();
          }}
        />
      )}
    </div>
  );
}
