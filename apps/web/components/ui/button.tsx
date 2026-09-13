import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors " +
  "disabled:pointer-events-none disabled:opacity-40 h-11 px-4 focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 focus-visible:outline-accent";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-foreground hover:bg-accent-hover",
  secondary: "bg-paper text-ink border border-border-strong hover:bg-surface",
  ghost: "bg-transparent text-ink-muted hover:bg-surface hover:text-ink",
  danger: "bg-danger text-white hover:bg-danger/90",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }
>(function Button({ variant = "primary", className = "", ...props }, ref) {
  return <button ref={ref} className={`${base} ${variants[variant]} ${className}`} {...props} />;
});
