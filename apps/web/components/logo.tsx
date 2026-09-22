interface LogoProps {
  variant?: "wordmark" | "symbol";
  theme?: "light" | "dark";
  className?: string;
}

const SOURCES = {
  wordmark: {
    light: "/brand/dineiz-logo-light-bg.svg",
    dark: "/brand/dineiz-logo-dark-bg.svg",
  },
  symbol: {
    light: "/brand/dineiz-symbol-light-bg.svg",
    dark: "/brand/dineiz-symbol-dark-bg.svg",
  },
} as const;

export function Logo({ variant = "wordmark", theme = "light", className }: LogoProps) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={SOURCES[variant][theme]} alt="Dineiz" className={`w-auto ${className || ""}`.trim()} />;
}
