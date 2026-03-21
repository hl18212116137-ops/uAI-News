import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import TopBar from "@/components/TopBar";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "AI News Aggregator",
  description: "AI news from top sources",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 读取当前用户 session（用于 TopBar 显示登录状态）
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en">
      <body className={inter.variable}>
        <TopBar user={user} />
        {children}
      </body>
    </html>
  );
}
