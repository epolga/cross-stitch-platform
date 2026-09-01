/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // piscina: without this, Next's build tries to trace/bundle piscina's
  // own internal worker.js runner, which breaks worker-thread spawning at
  // runtime ("Cannot find module .../.next/server/chunks/worker.js") -
  // same class of issue as pino hits for the same reason. See
  // docs/web/photo-converter-cpu-saturation-2026-09.md.
  serverExternalPackages: ['@napi-rs/canvas', 'piscina'],
  outputFileTracingRoot: __dirname,
  /*output: "standalone",*/
  productionBrowserSourceMaps: false,
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'd2o1uvvg91z7o4.cloudfront.net',
        pathname: '/photos/**',
      },
    ],
  },
};

module.exports = nextConfig;