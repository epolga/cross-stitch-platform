/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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