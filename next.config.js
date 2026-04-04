/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 14.2 `.next/types/**` validators use bare `Function` and fail `next build` typecheck (TS cannot resolve in that graph).
  // Application source: run `npm run typecheck` (`tsconfig.src.json`, excludes `.next`). See docs/ARCHITECTURE.md.
  typescript: {
    ignoreBuildErrors: true,
  },
  compress: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'pbs.twimg.com' },
      { protocol: 'https', hostname: '**.twimg.com' },
    ],
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    optimizePackageImports: ['@supabase/supabase-js', '@anthropic-ai/sdk'],
  },
}

module.exports = nextConfig
