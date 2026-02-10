/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: process.env.NODE_ENV === 'production',
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
    '@anthropic-ai/sdk',
  ],
  // Build optimization for Railway (reduce memory usage)
  swcMinify: true,
  compress: true,
  optimizeFonts: true,
  async rewrites() {
    return [
      {
        source: '/.well-known/farcaster.json',
        destination: '/api/.well-known/farcaster.json',
      },
    ];
  },
  async headers() {
    // SECURITY: Whitelist allowed origins instead of using '*'
    const allowedOrigins = [
      process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app',
      'https://warpcast.com',
      'https://www.warpcast.com',
      'https://farcaster.xyz',
      'https://www.farcaster.xyz',
      // Add your specific domains here
    ].filter(Boolean).join(', ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'unsafe-none' },
          { key: 'Cache-Control', value: 'max-age=0, must-revalidate' },
          // SECURITY: Changed from ALLOWALL to SAMEORIGIN (frames only on same origin)
          // Farcaster mini-apps need to be embedded, so we use specific frame-ancestors
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          // SECURITY: Content Security Policy for frame embedding
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self' https://warpcast.com https://www.warpcast.com https://farcaster.xyz https://www.farcaster.xyz;" },
          { key: 'Permissions-Policy', value: 'geolocation=(self)' },
          // SECURITY: Additional security headers
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        // Allow Farcaster frames to embed the app
        source: '/embed',
        headers: [
          { key: 'Cache-Control', value: 'max-age=0, must-revalidate' },
          { key: 'Content-Type', value: 'text/html' },
          // Allow embedding in Farcaster clients
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self' https://warpcast.com https://www.warpcast.com https://farcaster.xyz https://www.farcaster.xyz https://*.farcaster.xyz;" },
        ],
      },
      {
        source: '/images/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          // SECURITY: Images can have wildcard CORS (they're public assets)
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
      {
        source: '/.well-known/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600' },
          { key: 'Content-Type', value: 'application/json' },
          // SECURITY: Well-known files need to be accessible
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
      {
        // API routes should have restricted CORS
        source: '/api/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // SECURITY: Don't cache API responses by default
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
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
