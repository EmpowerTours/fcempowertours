#!/usr/bin/env node

/**
 * Smart worker entrypoint
 * Runs the game randomness resolver bot
 */

const { spawn } = require('child_process');

console.log('🎮 Starting Game Randomness Resolver Worker...');

const bot = spawn('npx', ['ts-node', 'scripts/game-randomness-resolver.ts'], {
  stdio: 'inherit',
  env: process.env
});

bot.on('exit', (code) => {
  console.log(`❌ Worker exited with code ${code}`);
  process.exit(code || 1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📴 Received SIGTERM, shutting down gracefully...');
  bot.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('📴 Received SIGINT, shutting down gracefully...');
  bot.kill('SIGINT');
});
