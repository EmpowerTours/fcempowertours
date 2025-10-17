#!/bin/bash

echo "🔧 AGGRESSIVE React Hook Error Fix"
echo "===================================="
echo ""

cd ~/projects/fcempowertours

echo "📦 Step 1: Nuclear cleanup..."
rm -rf node_modules
rm -rf .next
rm -rf .turbo
rm -f yarn.lock
rm -f package-lock.json
rm -rf ~/.cache/yarn
echo "✅ Cleanup complete"
echo ""

echo "📝 Step 2: Verify package.json has React resolutions..."
if grep -q '"react": "18.3.1"' package.json; then
  echo "✅ React resolutions found in package.json"
else
  echo "❌ React resolutions NOT found!"
  echo "Please add these to package.json resolutions section:"
  echo '  "react": "18.3.1",'
  echo '  "react-dom": "18.3.1",'
  echo '  "@types/react": "18.3.25",'
  echo '  "@types/react-dom": "18.3.7"'
  exit 1
fi
echo ""

echo "📦 Step 3: Fresh install with yarn..."
yarn install --force
echo "✅ Install complete"
echo ""

echo "🔍 Step 4: Verify single React version..."
echo "Running: yarn why react"
yarn why react
echo ""

echo "🔍 Step 5: Count React installations..."
REACT_COUNT=$(find node_modules -name react -type d | wc -l)
echo "Found $REACT_COUNT React directories"
if [ $REACT_COUNT -gt 3 ]; then
  echo "⚠️  WARNING: Still multiple React copies detected"
  echo "Listing React directories:"
  find node_modules -name react -type d
else
  echo "✅ React installation looks clean"
fi
echo ""

echo "🎉 Done! Now run: yarn dev"
echo ""
echo "If errors persist, try:"
echo "  1. Close VSCode/terminal completely"
echo "  2. Run: cd ~/projects/fcempowertours && yarn cache clean --all"
echo "  3. Run this script again"
echo "  4. Use npm instead: rm -rf node_modules && npm install && npm run dev"
