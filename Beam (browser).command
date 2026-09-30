#!/bin/bash
# Beam on a Mac: starts the server and opens Beam in the default browser (Chrome recommended).
cd "$(dirname "$0")/web-desktop" || exit 1

if ! command -v node >/dev/null 2>&1; then
    echo
    echo " Node.js is not installed."
    echo " Download the LTS version from https://nodejs.org and open this file again."
    echo
    read -r -p "Press Enter to close..."
    exit 1
fi

if [ ! -d "node_modules/ws" ]; then
    echo "Installing the required packages, only the first time..."
    npm install --omit=dev
fi

echo
echo " Beam runs while this window is open. Close it when you are done playing."
echo
node server.js --open
