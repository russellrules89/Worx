/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Keep the CDP SDK out of the bundler: it lazily imports optional x402
  // packages we don't use, which the bundler would otherwise fail to resolve.
  // As a server-external package it's required at runtime in Node instead.
  serverExternalPackages: ["@coinbase/cdp-sdk"],
}

export default nextConfig
