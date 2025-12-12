#!/usr/bin/env node

/**
 * Smart start script - detects Railway service type via env var
 *
 * Set RAILWAY_SERVICE_TYPE=worker for game randomness resolver
 * Set RAILWAY_SERVICE_TYPE=web (or leave unset) for Next.js web server
 */

const { spawn } = require('child_process');

const serviceType = process.env.RAILWAY_SERVICE_TYPE || 'web';

console.log(`🚀 Railway Service Type: ${serviceType}`);

let command, args;

if (serviceType === 'worker') {
  console.log('🎮 Starting Game Randomness Resolver Worker...');
  command = 'node';
  args = ['scripts/start-worker.cjs'];
} else {
  console.log('🌐 Starting Next.js Web Server...');
  command = 'node';
  args = ['scripts/start-server.js'];
  process.env.NODE_OPTIONS = '--no-deprecation';
}

const child = spawn(command, args, {
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code) => {
  console.log(`Process exited with code ${code}`);
  process.exit(code || 0);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📴 Received SIGTERM, shutting down gracefully...');
  child.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('📴 Received SIGINT, shutting down gracefully...');
  child.kill('SIGINT');
});
