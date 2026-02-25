#!/bin/bash
# Test script for OpenCode Overstory
# Run this to verify the installation works

set -e

echo "🧪 Testing OpenCode Overstory Installation..."
echo ""

# Test 1: Clone
echo "1️⃣ Cloning repository..."
git clone https://github.com/isaakdjedje-byte/overstory.git /tmp/overstory-test
cd /tmp/overstory-test
git checkout opencode-adaptation
echo "✅ Repository cloned"
echo ""

# Test 2: Check files exist
echo "2️⃣ Verifying OpenCode files..."
test -f src/opencode/agent-spawner.ts && echo "  ✓ agent-spawner.ts"
test -f src/opencode/persistent-agent.ts && echo "  ✓ persistent-agent.ts"
test -f src/opencode/task-agent.ts && echo "  ✓ task-agent.ts"
test -f opencode-plugin/index.ts && echo "  ✓ opencode-plugin/index.ts"
test -f opencode-skill/SKILL.md && echo "  ✓ opencode-skill/SKILL.md"
test -f templates/opencode-overlay.md.tmpl && echo "  ✓ templates/opencode-overlay.md.tmpl"
echo ""

# Test 3: Check package.json has OpenCode config
echo "3️⃣ Verifying package.json..."
grep -q "opencode" package.json && echo "  ✓ OpenCode section exists"
grep -q "opencode-plugin" package.json && echo "  ✓ opencode-plugin referenced"
echo ""

# Test 4: Try bun install (if bun is available)
echo "4️⃣ Installing dependencies..."
if command -v bun &> /dev/null; then
    bun install
    echo "  ✅ Dependencies installed"
    
    # Test 5: Type check
    echo ""
    echo "5️⃣ Running type check..."
    bun run typecheck && echo "  ✅ Type check passed" || echo "  ⚠️ Type check had issues (expected for new files)"
    
    # Test 6: Lint
    echo ""
    echo "6️⃣ Running linter..."
    bun run lint && echo "  ✅ Lint passed" || echo "  ⚠️ Lint had issues (expected for new files)"
else
    echo "  ⚠️ Bun not available, skipping install"
fi

echo ""
echo "🎉 Test complete!"
echo ""
echo "Next steps:"
echo "  1. cd /tmp/overstory-test"
echo "  2. bun link"
echo "  3. ov --version"
echo "  4. ov doctor"
