#!/usr/bin/env node
/**
 * Build the Windows application: dist/Beam-win32-x64/Beam.exe (portable, no installation needed).
 *   npm run package-win
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { packager } = require('@electron/packager');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist');

async function main() {
    if (!fs.existsSync(path.join(ROOT, 'bin', 'beam-server.jar'))) {
        throw new Error('bin/beam-server.jar is missing: run "npm run build-server" first');
    }
    const appPaths = await packager({
        dir: ROOT,
        out: OUT,
        name: 'Beam',
        executableName: 'Beam',
        platform: 'win32',
        arch: 'x64',
        overwrite: true,
        prune: true,
        // no asar archive: adb must be able to read bin/beam-server.jar directly
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
            CompanyName: 'Beam',
            FileDescription: 'Beam: Android games on your PC',
            ProductName: 'Beam',
            InternalName: 'Beam',
        },
    });
    for (const appPath of appPaths) {
        console.log('OK: ' + path.join(appPath, 'Beam.exe'));
    }
}

main().catch((e) => {
    console.error('Packaging failed: ' + e.message);
    process.exit(1);
});
