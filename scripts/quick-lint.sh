#!/bin/bash
# Quick lint check without full build
# Cloud agents: Use this before committing

set -e

echo "🔍 Quick validation (no node_modules needed)..."
echo ""

echo "📝 Checking for common lint issues..."

# Check for React Hook naming violations
if grep -rn "function use[A-Z]" lib/ engine/ 2>/dev/null | grep -v "custom.*hook" | grep -v "^Binary"; then
  echo "❌ Found function names starting with 'use' that aren't React hooks"
  echo "   React linter will fail. Rename these functions."
  exit 1
fi

# Check for unused variables in new code
if git diff --cached --name-only | grep -E '\.(ts|tsx)$' > /dev/null; then
  echo "✓ Found TypeScript files in staging"
  git diff --cached --name-only | grep -E '\.(ts|tsx)$' | while read file; do
    # Check for obvious unused vars
    if git diff --cached "$file" | grep -E '^\+.*const [a-zA-Z_]+ =' | grep -v '^\+.*export'; then
      echo "⚠️  Check for unused variables in: $file"
    fi
  done
fi

echo ""
echo "✅ Quick checks passed"
echo "💡 For full validation, run: npm run lint && npx tsc --noEmit"
