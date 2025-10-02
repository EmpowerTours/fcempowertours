/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    serverComponentsExternalPackages: ['undici'],  // Keep for any IPFS remnants
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Client-side: Stub Node modules to prevent bundling errors
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@react-native-async-storage/async-storage': false,
      'pino-pretty': false,
    };
    return config;
  },
};

module.exports = nextConfig;
