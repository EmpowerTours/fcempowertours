# Port Configuration and Conflict Handling

This document explains how to configure and troubleshoot port-related issues when running the FCEmpowerTours application.

## Overview

The application now includes intelligent port conflict handling to prevent startup failures when the default port is already in use.

## Configuration

### Default Port

The application uses port **8080** by default in production mode.

### Custom Port

To specify a custom port, set the `PORT` environment variable:

```bash
PORT=3000 npm start
```

### Auto-Increment Port

If the specified port is already in use, the application can automatically find the next available port:

```bash
# Enable auto-increment (enabled by default)
AUTO_INCREMENT_PORT=true npm start

# Disable auto-increment (fail if port is in use)
AUTO_INCREMENT_PORT=false npm start
```

## Troubleshooting Port Conflicts

### Error: "address already in use"

If you encounter this error, it means another process is using the specified port.

#### Solution 1: Use a Different Port

```bash
PORT=3001 npm start
```

#### Solution 2: Find and Stop the Conflicting Process

**On Linux/macOS:**
```bash
# Find the process using the port
lsof -i :8080
# or
netstat -tulpn | grep :8080

# Kill the process
kill -9 <PID>
```

**On Windows:**
```bash
# Find the process
netstat -ano | findstr :8080

# Kill the process
taskkill /PID <PID> /F
```

#### Solution 3: Enable Auto-Increment

```bash
AUTO_INCREMENT_PORT=true npm start
```

## Scripts

### start

The main production start script with intelligent port handling:

```bash
npm start
```

This script will:
1. Check if the configured port is available
2. If not and `AUTO_INCREMENT_PORT=true`, find the next available port
3. If not and `AUTO_INCREMENT_PORT=false`, display an error with troubleshooting tips
4. Start the server on the selected port

### start:legacy

The legacy start command without port conflict handling:

```bash
npm run start:legacy
```

⚠️ **Warning:** This command will fail with "EADDRINUSE" error if the port is already in use.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | The port number to bind the server to |
| `AUTO_INCREMENT_PORT` | `true` | Whether to automatically find an available port if the specified port is in use |
| `NODE_ENV` | `production` | The Node.js environment mode |

## Examples

### Development with Custom Port

```bash
# Development server (uses Next.js dev server)
PORT=3000 npm run dev
```

### Production with Auto Port Selection

```bash
# Build the application
npm run build

# Start with automatic port selection
npm start
```

### Production with Strict Port Requirement

```bash
# Fail if port 8080 is not available
PORT=8080 AUTO_INCREMENT_PORT=false npm start
```

### Using Environment Files

Create a `.env.local` file:

```env
PORT=3000
AUTO_INCREMENT_PORT=true
```

Then simply run:

```bash
npm start
```

## Implementation Details

The port conflict handling is implemented in `scripts/start-server.js`, which:

1. Checks if the desired port is in use using a TCP connection test
2. If in use and auto-increment is enabled, tries up to 10 consecutive ports
3. Provides clear error messages with troubleshooting steps
4. Gracefully handles termination signals (SIGINT, SIGTERM, SIGQUIT)

## See Also

- [Next.js Deployment Documentation](https://nextjs.org/docs/deployment)
- [Node.js Server Deployment Best Practices](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)
