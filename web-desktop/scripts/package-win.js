#!/usr/bin/env node
/**
 * Build the Windows application: dist/Wi-Dex-win32-x64/Wi-Dex.exe (portable, no installation needed).
 *   npm run package-win
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { packager } = require('@electron/packager');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist');

async function main() {
    if (!fs.existsSync(path.join(ROOT, 'bin', 'widex-server.jar'))) {
        throw new Error('bin/widex-server.jar is missing: run "npm run build-server" first');
    }
    const appPaths = await packager({
        dir: ROOT,
        out: OUT,
        name: 'Wi-Dex',
        executableName: 'Wi-Dex',
        platform: 'win32',
        arch: 'x64',
        overwrite: true,
        prune: true,
        // no asar archive: adb must be able to read bin/widex-server.jar directly
        asar: false,
        icon: path.join(ROOT, 'app', 'icon.ico'),
        ignore: [
            /^\/dist($|\/)/,
            /^\/scripts($|\/)/,
            /^\/\.claude($|\/)/,
            /\.log$/,
        ],
        appCopyright: 'Darko',
        win32metadata: {
            CompanyName: 'Wi-Dex',
            FileDescription: 'Wi-Dex — Android igre na PC-u',
            ProductName: 'Wi-Dex',
            InternalName: 'Wi-Dex',
        },
    });
    for (const appPath of appPaths) {
        console.log('OK: ' + path.join(appPath, 'Wi-Dex.exe'));
    }
}

main().catch((e) => {
    console.error('Packaging failed: ' + e.message);
    process.exit(1);
});
