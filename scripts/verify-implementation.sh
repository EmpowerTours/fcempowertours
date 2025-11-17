#!/bin/bash

# Verification script for Itinerary NFT Marketplace implementation
# This script checks that all required files and configurations are in place

echo "🔍 Verifying Itinerary NFT Marketplace Implementation"
echo "======================================================"
echo ""

ERRORS=0
WARNINGS=0

# Function to check file exists
check_file() {
    if [ -f "$1" ]; then
        echo "✅ $1"
    else
        echo "❌ MISSING: $1"
        ((ERRORS++))
    fi
}

# Function to check directory exists
check_dir() {
    if [ -d "$1" ]; then
        echo "✅ $1/"
    else
        echo "❌ MISSING: $1/"
        ((ERRORS++))
    fi
}

# Function to check env variable
check_env() {
    if grep -q "$1" .env.local 2>/dev/null; then
        echo "✅ $1 configured in .env.local"
    else
        echo "⚠️  $1 not found in .env.local"
        ((WARNINGS++))
    fi
}

# Function to check if text exists in file
check_content() {
    if grep -q "$2" "$1" 2>/dev/null; then
        echo "✅ $1 contains '$2'"
    else
        echo "❌ $1 missing '$2'"
        ((ERRORS++))
    fi
}

echo "📁 Checking Core Files..."
echo "-------------------------"
check_file "lib/utils/gps.ts"
check_file "lib/utils/pinata.ts"
check_file "app/api/upload-to-ipfs/route.ts"
check_file "app/itinerary-market/page.tsx"
check_file "lib/abis/ItineraryNFT.json"
check_file "scripts/test-itinerary-marketplace.ts"
check_file "ITINERARY_MARKETPLACE.md"
check_file "IMPLEMENTATION_SUMMARY.md"
echo ""

echo "🔧 Checking Modified Files..."
echo "-----------------------------"
check_file "app/api/execute-delegated/route.ts"
check_content "app/api/execute-delegated/route.ts" "create_itinerary"
check_content "app/api/execute-delegated/route.ts" "purchase_itinerary"
check_content "app/api/execute-delegated/route.ts" "checkin_itinerary"
check_file "lib/passport/generatePassportSVG.ts"
check_content "lib/passport/generatePassportSVG.ts" "PassportStamp"
check_file "empowertours-envio/config.yaml"
check_content "empowertours-envio/config.yaml" "PassportStamped"
echo ""

echo "⚙️  Checking Environment Configuration..."
echo "-----------------------------------------"
check_env "NEXT_PUBLIC_ITINERARY_NFT"
check_env "NEXT_PUBLIC_PASSPORT"
check_env "PINATA_JWT"
check_env "PINATA_GATEWAY"
check_env "NEXT_PUBLIC_ENVIO_ENDPOINT"
echo ""

echo "📦 Checking Dependencies..."
echo "---------------------------"
if command -v tsx &> /dev/null; then
    echo "✅ tsx installed"
else
    echo "⚠️  tsx not installed (run: npm install -g tsx)"
    ((WARNINGS++))
fi

if command -v node &> /dev/null; then
    echo "✅ node installed ($(node --version))"
else
    echo "❌ node not installed"
    ((ERRORS++))
fi
echo ""

echo "🎯 Checking Contract Addresses..."
echo "---------------------------------"
if grep -q "0x5B61286AC88688fe8930711fAa5b1155e98daFe8" .env.local 2>/dev/null; then
    echo "✅ ItineraryNFT address configured"
else
    echo "⚠️  ItineraryNFT address may not match expected"
    ((WARNINGS++))
fi

if grep -q "0x820A9cc395D4349e19dB18BAc5Be7b3C71ac5163" .env.local 2>/dev/null; then
    echo "✅ PassportNFT address configured"
else
    echo "⚠️  PassportNFT address may not match expected"
    ((WARNINGS++))
fi
echo ""

echo "📊 Summary"
echo "=========="
echo "Total Errors: $ERRORS"
echo "Total Warnings: $WARNINGS"
echo ""

if [ $ERRORS -eq 0 ]; then
    echo "✅ All critical checks passed!"
    echo ""
    echo "Next steps:"
    echo "1. Review documentation: cat ITINERARY_MARKETPLACE.md"
    echo "2. Run tests: npx tsx scripts/test-itinerary-marketplace.ts"
    echo "3. Check results: cat TEST_RESULTS.md"
    echo "4. Start dev server: npm run dev"
    echo "5. Visit marketplace: http://localhost:3000/itinerary-market"
    exit 0
else
    echo "❌ Found $ERRORS critical error(s)"
    echo "Please fix the errors above before proceeding."
    exit 1
fi
