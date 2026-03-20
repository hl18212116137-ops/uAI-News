import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI News Aggregator",
  description: "AI news from top sources",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
