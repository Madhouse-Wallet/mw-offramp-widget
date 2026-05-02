/** @type {import('next').NextConfig} */
const path = require('path')

const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // Pin the file-tracing root to this project so Next.js doesn't walk up to
  // a stray package-lock.json in a parent directory and misidentify the root.
  outputFileTracingRoot: path.join(__dirname),
  // WalletConnect packages ship as ESM and need transpiling for Next.js webpack
  transpilePackages: [
    '@walletconnect/ethereum-provider',
    '@walletconnect/modal',
    '@walletconnect/core',
    '@walletconnect/utils',
    '@walletconnect/types',
    '@walletconnect/sign-client',
    '@walletconnect/logger',
  ],
}

module.exports = nextConfig
