/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Prevent React Native and Node-only packages from breaking the web build
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@react-native-async-storage/async-storage': false,
      'pino-pretty': false,
    };
    return config;
  },
};

module.exports = nextConfig;
