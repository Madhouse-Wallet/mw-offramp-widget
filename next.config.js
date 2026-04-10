/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  webpack(config) {
    // Stub out optional packages that wagmi connectors reference but we don't use.
    // These belong to connectors we haven't included (porto, metaMask SDK, safe, baseAccount).
    // Without stubs webpack emits "Module not found" warnings for every page compile.
    const stubs = [
      'porto',
      'porto/internal',
      '@metamask/connect-evm',
      '@metamask/sdk',
      '@safe-global/safe-apps-sdk',
      '@safe-global/safe-apps-provider',
      '@base-org/account',
      '@react-native-async-storage/async-storage',
    ]
    for (const pkg of stubs) {
      config.resolve.alias[pkg] = false
    }
    return config
  },
}

module.exports = nextConfig
