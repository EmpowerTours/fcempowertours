#!/bin/bash
cd ~/projects/fcempowertours

echo "🧹 Step 1: Stopping any running processes..."
pkill -f "next dev" || true

echo "🗑️  Step 2: Removing all node modules and caches..."
rm -rf node_modules
rm -rf .next
rm -rf .yarn
rm -rf yarn.lock
rm -rf package-lock.json

echo "📦 Step 3: Installing exact React versions..."
yarn add react@18.3.1 react-dom@18.3.1 --exact

echo "📦 Step 4: Installing dev dependencies..."
yarn add -D @types/react@18.3.25 @types/react-dom@18.3.7 --exact

echo "🔨 Step 5: Full install..."
yarn install

echo "✅ Done! Now run: yarn dev"
