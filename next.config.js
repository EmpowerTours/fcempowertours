/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  output: 'standalone',
  reactStrictMode: false, // Disable strict mode to avoid double rendering issues with Three.js
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei'],
  experimental: {
    optimizePackageImports: ['@tanstack/react-query'],
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  serverExternalPackages: [
    'undici',
    '@farcaster/miniapp-sdk',
    'ethers',
  ],
  async rewrites() {
    return [
      {
        source: '/.well-known/farcaster.json',
        destination: '/api/.well-known/farcaster.json',
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'unsafe-none' },
          { key: 'Cache-Control', value: 'max-age=0, must-revalidate' },
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
          { key: 'Permissions-Policy', value: 'geolocation=(self)' },
        ],
      },
      {
        source: '/embed',
        headers: [
          { key: 'Cache-Control', value: 'max-age=0, must-revalidate' },
          { key: 'Content-Type', value: 'text/html' },
        ],
      },
      {
        source: '/images/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
      {
        source: '/.well-known/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600' },
          { key: 'Content-Type', value: 'application/json' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
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
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    return config;
  },
};
export default nextConfig;
