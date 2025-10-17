#!/bin/bash
echo "🧹 Cleaning React..."
rm -rf node_modules yarn.lock .next
yarn add react@18.3.1 react-dom@18.3.1 --exact
yarn add -D @types/react@18.3.25 @types/react-dom@18.3.7 --exact
yarn install
echo "✅ React fixed!"
