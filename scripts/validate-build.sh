#!/bin/bash
# Pre-commit validation to catch issues before Vercel does
# Run this before pushing: ./scripts/validate-build.sh

set -e

echo "🔍 Running pre-commit validation..."
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo "⚠️  node_modules not found. Installing dependencies..."
  npm install
  echo ""
fi

echo "📋 Running ESLint..."
npm run lint
echo "✅ ESLint passed"
echo ""

echo "🔧 Running TypeScript type check..."
npx tsc --noEmit
echo "✅ TypeScript passed"
echo ""

echo "✅ All checks passed! Safe to push."
