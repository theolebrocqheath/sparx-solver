#!/bin/bash
# Double-click this file to launch Sparx Solver (macOS)

cd "$(dirname "$0")"
clear

echo ""
echo "  ╔═══════════════════════════╗"
echo "  ║      Sparx Solver         ║"
echo "  ╚═══════════════════════════╝"
echo ""

# Check for Node.js
if ! command -v node &>/dev/null; then
  echo "  Node.js is not installed."
  echo ""
  echo "  Install it from: https://nodejs.org"
  echo "  (Download the LTS version, run the installer, then try again)"
  echo ""
  read -p "  Press Enter to open nodejs.org..."
  open "https://nodejs.org"
  exit 1
fi

echo "  ✓ Node.js $(node -v)"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "  Installing dependencies (first time only)..."
  npm install --silent 2>&1
  echo "  ✓ Dependencies installed"
fi

# Install Playwright browser if needed
CHROMIUM_PATH=$(node -e "try{const p=require('playwright-core');console.log(p.chromium.executablePath())}catch{}" 2>/dev/null)
if [ -z "$CHROMIUM_PATH" ] || [ ! -f "$CHROMIUM_PATH" ]; then
  echo "  Downloading browser (first time only, ~200MB)..."
  npx playwright install chromium 2>&1 | grep -E "downloaded|Downloading"
  echo "  ✓ Browser ready"
fi

echo ""
echo "  Starting server..."
echo "  (Close this window to stop)"
echo ""

node server.js
