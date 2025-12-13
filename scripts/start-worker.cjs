#!/usr/bin/env node

/**
 * Smart worker entrypoint
 * Runs both game and lottery randomness resolver bots
 */

const { spawn } = require('child_process');

console.log('🎮 Starting Randomness Resolver Workers...');

// Start game randomness resolver
const gameBot = spawn('npx', ['tsx', 'scripts/game-randomness-resolver.ts'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  env: process.env
});

gameBot.stdout.on('data', (data) => {
  process.stdout.write(`[GAME] ${data}`);
});

gameBot.stderr.on('data', (data) => {
  process.stderr.write(`[GAME] ${data}`);
});

gameBot.on('exit', (code) => {
  console.log(`❌ Game resolver exited with code ${code}`);
  lotteryBot.kill('SIGTERM');
  process.exit(code || 1);
});

// Start lottery randomness resolver
const lotteryBot = spawn('npx', ['tsx', 'scripts/lottery-randomness-resolver.ts'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  env: process.env
});

lotteryBot.stdout.on('data', (data) => {
  process.stdout.write(`[LOTTERY] ${data}`);
});

lotteryBot.stderr.on('data', (data) => {
  process.stderr.write(`[LOTTERY] ${data}`);
});

lotteryBot.on('exit', (code) => {
  console.log(`❌ Lottery resolver exited with code ${code}`);
  gameBot.kill('SIGTERM');
  process.exit(code || 1);
});

console.log('✅ Both resolvers started');

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📴 Received SIGTERM, shutting down gracefully...');
  gameBot.kill('SIGTERM');
  lotteryBot.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('📴 Received SIGINT, shutting down gracefully...');
  gameBot.kill('SIGINT');
  lotteryBot.kill('SIGINT');
});
