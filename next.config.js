/** @type {import('next').NextConfig} */
const distDir = process.env.NEXT_DIST_DIR

const nextConfig = {
  ...(distDir ? { distDir } : {}),
  output: 'standalone',
  compress: true,
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ['drizzle-orm', '@anthropic-ai/sdk'],
    staleTimes: {
      dynamic: 60,
      static: 300,
    },
  },
}

module.exports = nextConfig
