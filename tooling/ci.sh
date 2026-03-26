#!/bin/bash
# CI/CD pipeline — runs all checks in sequence.
# Exit on first failure.
set -e

echo "=== CI Pipeline ==="

echo ""
echo "--- Prettier (format check) ---"
npx prettier --check "engine/**/*.ts" "view/**/*.ts" "game/**/*.ts" "browser/**/*.ts"
echo "  PASS"

echo ""
echo "--- ESLint ---"
npx eslint "engine/**/*.ts" "view/**/*.ts" "game/**/*.ts" "browser/**/*.ts"
echo "  PASS"

echo ""
echo "--- TypeScript (type check) ---"
npx tsc --noEmit
echo "  PASS"

echo ""
echo "--- Vitest (tests) ---"
npx vitest run
echo "  PASS"

echo ""
echo "=== CI Pipeline PASSED ==="
