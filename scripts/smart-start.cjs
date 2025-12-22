#!/usr/bin/env node

/**
 * Smart Start Script for Railway Deployment
 * Auto-detects Next.js build mode and starts the appropriate server
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const NODE_ENV = process.env.NODE_ENV || 'production';

console.log('🚀 EmpowerTours Smart Start');
console.log(`   Environment: ${NODE_ENV}`);
console.log(`   Port: ${PORT}`);
console.log(`   Node Version: ${process.version}`);

// Check if standalone build exists
const standalonePath = path.join(process.cwd(), '.next', 'standalone', 'server.js');
const hasStandalone = fs.existsSync(standalonePath);

console.log(`   Standalone build: ${hasStandalone ? 'Found' : 'Not found'}`);

if (hasStandalone) {
  // Use standalone server (optimized for production)
  console.log('✅ Starting Next.js standalone server...\n');

  const server = spawn('node', [standalonePath], {
    env: {
      ...process.env,
      PORT,
      NODE_ENV,
      HOSTNAME: '0.0.0.0',
      NODE_OPTIONS: '--no-deprecation'
    },
    stdio: 'inherit'
  });

  server.on('error', (err) => {
    console.error('❌ Server error:', err);
    process.exit(1);
  });

  server.on('exit', (code) => {
    console.log(`Server exited with code ${code}`);
    process.exit(code || 0);
  });
} else {
  // Fallback to next start (requires full node_modules)
  console.log('⚠️  Standalone build not found, using next start...\n');

  const server = spawn('npx', ['next', 'start', '-p', PORT, '-H', '0.0.0.0'], {
    env: {
      ...process.env,
      NODE_ENV,
      NODE_OPTIONS: '--no-deprecation'
    },
    stdio: 'inherit'
  });

  server.on('error', (err) => {
    console.error('❌ Server error:', err);
    process.exit(1);
  });

  server.on('exit', (code) => {
    console.log(`Server exited with code ${code}`);
    process.exit(code || 0);
  });
}

// Handle shutdown signals
process.on('SIGTERM', () => {
  console.log('\n📛 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n📛 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});
