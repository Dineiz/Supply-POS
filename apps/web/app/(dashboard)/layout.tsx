"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/logo";
import { clearSession, getSessionUser, getToken, type SessionUser } from "@/lib/session";

const NAV = [
  { href: "/counter", label: "Counter" },
  { href: "/items", label: "Items" },
  { href: "/setup", label: "Setup" },
  { href: "/customers", label: "Customers" },
  { href: "/receiving", label: "Receiving" },
  { href: "/issues", label: "Deliveries" },
  { href: "/returns", label: "Returns" },
  { href: "/payments", label: "Payments" },
  { href: "/wastage", label: "Wastage" },
  { href: "/stock-counts", label: "Stock Counts" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings", ownerOnly: true },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const sessionUser = getSessionUser();
    if (!getToken() || !sessionUser) {
      router.push("/");
      return;
    }
    if (sessionUser.role === "CLERK" || sessionUser.role === "VIEWER") {
      router.push("/counter");
      return;
    }
    setUser(sessionUser);
  }, [router]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleLogout() {
    clearSession();
    router.push("/");
  }

  if (!user) return null;

  const navLinks = (
    <nav className="flex-1 space-y-1 p-3">
      {NAV.filter((item) => !item.ownerOnly || user.role === "OWNER").map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              active ? "bg-ink text-white" : "text-ink-muted hover:bg-surface hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const userFooter = (
    <div className="border-t border-border p-4">
      <p className="truncate text-xs font-semibold text-ink">{user.name}</p>
      <p className="text-xs text-ink-faint">{user.role === "OWNER" ? "Owner" : "Manager"}</p>
      <button
        onClick={handleLogout}
        className="mt-2 text-xs text-ink-muted hover:text-ink font-medium transition-colors"
      >
        Sign out
      </button>
    </div>
  );

  return (
    <div className="flex h-screen flex-col bg-surface md:flex-row">
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-paper px-4 py-3 md:hidden">
        <button
          onClick={() => setMenuOpen(true)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xl text-ink-muted hover:bg-surface hover:text-ink"
          aria-label="Open menu"
        >
          ☰
        </button>
        <Logo variant="wordmark" theme="light" className="h-7 w-auto" />
      </header>

      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-paper md:flex">
        <div className="flex items-center border-b border-border px-5 py-4">
          <Logo variant="wordmark" theme="light" className="h-7 w-auto" />
        </div>
        {navLinks}
        {userFooter}
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden" onClick={() => setMenuOpen(false)}>
          <div className="flex h-full w-64 flex-col bg-paper shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
              <span className="text-sm font-medium text-ink-muted">Menu</span>
              <button
                onClick={() => setMenuOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface hover:text-ink"
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>
            {navLinks}
            {userFooter}
          </div>
          <div className="flex-1 bg-black/40" />
        </div>
      )}

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
