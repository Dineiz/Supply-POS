"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, ApiError } from "@/lib/api";
import { saveSession, type SessionUser } from "@/lib/session";

type Mode = "password" | "pin";

export default function StandaloneLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(body: Record<string, string>) {
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
      setError(err instanceof ApiError ? err.message : "Could not sign in. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  function handlePinDigit(digit: string) {
    if (loading) return;
    const next = (pin + digit).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      submit({ pin: next }).finally(() => setPin(""));
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface px-4 py-8">
      <div className="mb-6">
        <Link href="/" className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink">
          ← Back to Homepage
        </Link>
      </div>

      <div className="w-full max-w-[22rem]">
        <div className="mb-8 flex justify-center">
          <Logo variant="wordmark" theme="light" className="h-9" />
        </div>

        <div className="rounded-xl border border-border bg-paper p-7 shadow-sm">
          <div className="mb-6 flex gap-5 border-b border-border">
            <button
              onClick={() => {
                setMode("password");
                setError(null);
              }}
              className={`-mb-px border-b-2 pb-3 text-sm font-medium transition-colors ${
                mode === "password" ? "border-accent text-ink" : "border-transparent text-ink-faint hover:text-ink-muted"
              }`}
            >
              Manager Password
            </button>
            <button
              onClick={() => {
                setMode("pin");
                setError(null);
              }}
              className={`-mb-px border-b-2 pb-3 text-sm font-medium transition-colors ${
                mode === "pin" ? "border-accent text-ink" : "border-transparent text-ink-faint hover:text-ink-muted"
              }`}
            >
              Clerk PIN
            </button>
          </div>

          {mode === "password" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit({ email, password });
              }}
              className="space-y-3"
            >
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">Email</label>
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
              <Button type="submit" disabled={loading} className="mt-3 w-full bg-accent hover:bg-accent-hover text-accent-foreground">
                {loading ? "Signing in…" : "Sign in to Terminal"}
              </Button>
            </form>
          ) : (
            <div className="flex flex-col items-center">
              <div className="mb-5 flex gap-3">
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
                    className="h-14 w-14 rounded-md border border-border text-lg font-medium text-ink hover:bg-surface disabled:opacity-40 transition-colors"
                  >
                    {d}
                  </button>
                ))}
                <div />
                <button
                  onClick={() => handlePinDigit("0")}
                  disabled={loading}
                  className="h-14 w-14 rounded-md border border-border text-lg font-medium text-ink hover:bg-surface disabled:opacity-40 transition-colors"
                >
                  0
                </button>
                <button
                  onClick={() => setPin(pin.slice(0, -1))}
                  disabled={loading || pin.length === 0}
                  className="h-14 w-14 rounded-md text-sm font-medium text-ink-muted hover:bg-surface disabled:opacity-40 transition-colors"
                >
                  ⌫
                </button>
              </div>
            </div>
          )}

          {error && (
            <p className="mt-4 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-ink-faint">Dineiz Supply · Warehouse &amp; Distribution Terminal</p>
      </div>
    </main>
  );
}
