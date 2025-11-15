#!/usr/bin/env node

import { spawn } from 'child_process';
import net from 'net';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Check if a port is in use
 * @param {number} port - Port number to check
 * @returns {Promise<boolean>} - True if port is in use
 */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        resolve(false);
      }
    });

    server.once('listening', () => {
      server.close();
      resolve(false);
    });

    server.listen(port, '0.0.0.0');
  });
}

/**
 * Find an available port starting from the specified port
 * @param {number} startPort - Port to start searching from
 * @param {number} maxAttempts - Maximum number of ports to try
 * @returns {Promise<number>} - Available port number
 */
async function findAvailablePort(startPort, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    const inUse = await isPortInUse(port);

    if (!inUse) {
      return port;
    }

    console.log(`⚠️  Port ${port} is already in use, trying next port...`);
  }

  throw new Error(`Could not find an available port after ${maxAttempts} attempts starting from ${startPort}`);
}

/**
 * Start the Next.js production server
 */
async function startServer() {
  try {
    // Get the desired port from environment or use default
    const defaultPort = parseInt(process.env.PORT || '8080', 10);
    const autoIncrement = process.env.AUTO_INCREMENT_PORT !== 'false';

    let port = defaultPort;

    // Check if the port is in use
    const portInUse = await isPortInUse(defaultPort);

    if (portInUse) {
      if (autoIncrement) {
        console.log(`⚠️  Port ${defaultPort} is already in use.`);
        port = await findAvailablePort(defaultPort + 1);
        console.log(`✅ Found available port: ${port}`);
      } else {
        console.error(`❌ Error: Port ${defaultPort} is already in use.`);
        console.error(`\nTo resolve this issue, you can:`);
        console.error(`  1. Stop the process using port ${defaultPort}`);
        console.error(`  2. Use a different port: PORT=3000 npm start`);
        console.error(`  3. Enable auto-increment: AUTO_INCREMENT_PORT=true npm start`);
        console.error(`\nTo find what's using the port:`);
        console.error(`  lsof -i :${defaultPort}`);
        console.error(`  netstat -tulpn | grep :${defaultPort}`);
        process.exit(1);
      }
    }

    // Path to the standalone server
    const serverPath = join(__dirname, '..', '.next', 'standalone', 'server.js');

    // Set environment variables for the server
    const env = {
      ...process.env,
      PORT: port.toString(),
      NODE_ENV: 'production',
    };

    console.log(`🚀 Starting server on port ${port}...`);
    console.log(`📍 Server path: ${serverPath}`);

    // Spawn the server process
    const server = spawn('node', [serverPath], {
      env,
      stdio: 'inherit',
    });

    server.on('error', (err) => {
      console.error('❌ Failed to start server:', err);
      process.exit(1);
    });

    server.on('exit', (code) => {
      if (code !== 0) {
        console.error(`❌ Server exited with code ${code}`);
        process.exit(code || 1);
      }
    });

    // Handle termination signals
    const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
    signals.forEach((signal) => {
      process.on(signal, () => {
        console.log(`\n⏹️  Received ${signal}, shutting down gracefully...`);
        server.kill(signal);
      });
    });

  } catch (error) {
    console.error('❌ Error starting server:', error.message);
    process.exit(1);
  }
}

// Run the server
startServer();
