module.exports = {
  experimental: {
    cpus: 2,
  },
  webpack: (config) => {
    config.externals.push('pino-pretty', 'encoding');
    config.resolve.alias['@react-native-async-storage/async-storage'] = 'localforage';
    return config;
  },
  output: 'standalone',  // Keeps serverless compatibility
  // Removed generateStaticParams (invalid here; use per-page dynamic instead)
};
