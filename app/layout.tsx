import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import WebVitalsReporter from "@/components/WebVitalsReporter";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

function metadataBaseUrl(): URL {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    try {
      return new URL(process.env.NEXT_PUBLIC_SITE_URL);
    } catch {
      /* fall through */
    }
  }
  if (process.env.VERCEL_URL) {
    return new URL(`https://${process.env.VERCEL_URL}`);
  }
  return new URL("http://localhost:3000");
}

const siteTitle = "uAI News | AI 资讯聚合";
const siteDescription =
  "订阅 AI 领域信息源，中文摘要与 INSIGHT 解读，个性化信息流与书签。";

export const metadata: Metadata = {
  metadataBase: metadataBaseUrl(),
  title: {
    default: siteTitle,
    template: "%s | uAI News",
  },
  description: siteDescription,
  keywords: [
    "AI 资讯",
    "人工智能",
    "科技新闻",
    "信息流",
    "AI news",
    "machine learning",
  ],
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    locale: "zh_CN",
    type: "website",
    siteName: "uAI News",
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        {/* X 源默认头像走 unavatar；提前建连，减轻侧栏/卡片头像晚到 */}
        <link rel="dns-prefetch" href="https://unavatar.io" />
        <link rel="preconnect" href="https://unavatar.io" crossOrigin="anonymous" />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <WebVitalsReporter />
        {children}
        {modal}
      </body>
    </html>
  );
}
