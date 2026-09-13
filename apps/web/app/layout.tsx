import "./globals.css";

export const metadata = {
  title: "Dineiz Supply",
  description: "Warehouse and distribution management for Dineiz Supply",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
