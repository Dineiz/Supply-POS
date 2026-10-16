"use client";

import { type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * A table row that opens its record anywhere you click it. The row's main cell
 * should also hold a real <Link> to the same place, so keyboard, screen-reader
 * and middle-click users get a proper link; clicks on links or buttons inside
 * the row keep doing their own thing.
 */
export function ClickableRow({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  const router = useRouter();
  return (
    <tr
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a, button, input, select, label")) return;
        router.push(href);
      }}
      className={`cursor-pointer border-b border-border last:border-0 hover:bg-surface ${className}`}
    >
      {children}
    </tr>
  );
}
