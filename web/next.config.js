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
  // Next 15 streams <title>/canonical/description into <body> after the page
  // content for any UA not in its htmlLimitedBots list, and the default list
  // omits plain "Googlebot". Search Console showed "User-declared canonical:
  // None" and Google rewrote the homepage title (2026-11-14). Same regex as
  // Next's default (node_modules/next/dist/shared/lib/router/utils/html-bots.js)
  // plus Googlebot, so these bots get blocking metadata inside <head>.
  htmlLimitedBots: /Googlebot|[\w-]+-Google|Google-[\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight/i,
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