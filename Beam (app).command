#!/bin/bash
# Beam as a Mac app (no browser), run from the source code. The installed app is the .dmg from the Releases page.
cd "$(dirname "$0")/web-desktop" || exit 1

if ! command -v node >/dev/null 2>&1; then
    echo
    echo " Node.js is not installed."
    echo " Download the LTS version from https://nodejs.org and open this file again."
    echo
    read -r -p "Press Enter to close..."
    exit 1
fi

if [ ! -d "node_modules/electron" ]; then
    echo "Installing Beam, only the first time (downloads about 100 MB)..."
    npm install || { echo " Installing failed. Use \"Beam (browser).command\"."; read -r -p "Press Enter to close..."; exit 1; }
fi

npm run app
