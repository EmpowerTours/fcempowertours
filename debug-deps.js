// Run this in your terminal to check for dependency issues
// Save as debug-deps.js and run: node debug-deps.js

const fs = require('fs');
const path = require('path');

console.log('🔍 Checking for React dependency issues...\n');

// Check package.json
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

console.log('📦 React versions in package.json:');
console.log('  react:', packageJson.dependencies?.react || 'NOT FOUND');
console.log('  react-dom:', packageJson.dependencies?.['react-dom'] || 'NOT FOUND');
console.log('  @privy-io/react-auth:', packageJson.dependencies?.['@privy-io/react-auth'] || 'NOT FOUND');
console.log('  wagmi:', packageJson.dependencies?.wagmi || 'NOT FOUND');
console.log('  viem:', packageJson.dependencies?.viem || 'NOT FOUND');

// Check for multiple React installations
console.log('\n🔍 Checking for duplicate React installations...');
console.log('Run this command to check:');
console.log('  npm ls react react-dom\n');

// Check node_modules
const nodeModulesPath = path.join(process.cwd(), 'node_modules');
const privyPath = path.join(nodeModulesPath, '@privy-io', 'react-auth', 'node_modules');

if (fs.existsSync(privyPath)) {
  console.log('⚠️  WARNING: @privy-io/react-auth has its own node_modules!');
  console.log('   This likely means duplicate React versions.');
  console.log('   Path:', privyPath);
} else {
  console.log('✅ No nested node_modules in @privy-io/react-auth');
}

console.log('\n📋 Recommended fixes:');
console.log('1. Delete node_modules and package-lock.json/yarn.lock');
console.log('2. Ensure React versions match across all packages');
console.log('3. Run: npm install (or yarn install)');
console.log('4. Check for peer dependency warnings');
