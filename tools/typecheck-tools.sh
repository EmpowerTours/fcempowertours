#!/usr/bin/env bash
# Typecheck the scripts in tools/.
#
# The project tsconfig EXCLUDES "tools", so `npx tsc --noEmit` silently skips every file here.
# That is how a dangling call to a deleted function survived a "tsc clean" report and was caught
# only by eslint. These scripts run migrations and pin metadata; they deserve a typechecker.
set -euo pipefail
cd "$(dirname "$0")/.."
npx tsc --noEmit --skipLibCheck --strict \
  --target es2022 --module esnext --moduleResolution bundler \
  --allowImportingTsExtensions --types node \
  tools/*.ts
echo "tools/ typecheck clean"
