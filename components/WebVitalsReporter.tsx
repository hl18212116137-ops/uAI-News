"use client";

import { useReportWebVitals } from "next/web-vitals";

/**
 * 设 NEXT_PUBLIC_WEB_VITALS_LOG=1 时在控制台输出 TTFB / FCP / LCP / CLS / INP，便于与 Network 对照。
 */
export default function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (process.env.NEXT_PUBLIC_WEB_VITALS_LOG !== "1") return;
    console.info("[web-vitals]", metric.name, Math.round(metric.value * 10) / 10, {
      id: metric.id,
      rating: "rating" in metric ? (metric as { rating?: string }).rating : undefined,
    });
  });
  return null;
}
