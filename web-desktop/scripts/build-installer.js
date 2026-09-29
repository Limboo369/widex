#!/usr/bin/env node
/**
 * Build the Windows installer: dist/installer/Wi-Dex-Setup-<version>.exe
 * adb (Android SDK platform-tools) is bundled so the installed app works without the SDK.
 *   npm run installer
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BUNDLED = path.join(ROOT, 'platform-tools');
const ADB_FILES = ['adb.exe', 'AdbWinApi.dll', 'AdbWinUsbApi.dll', 'libwinpthread-1.dll', 'NOTICE.txt'];

function findPlatformTools() {
    const candidates = [];
    for (const env of ['ANDROID_HOME', 'ANDROID_SDK_ROOT']) {
        if (process.env[env]) {
            candidates.push(path.join(process.env[env], 'platform-tools'));
        }
    }
    if (process.env.LOCALAPPDATA) {
        candidates.push(path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools'));
    }
    return candidates.find((dir) => fs.existsSync(path.join(dir, 'adb.exe')));
}

function main() {
    if (!fs.existsSync(path.join(ROOT, 'bin', 'widex-server.jar'))) {
        throw new Error('bin/widex-server.jar is missing: run "npm run build-server" first');
    }
    const source = findPlatformTools();
    if (!source) {
        throw new Error('adb.exe not found: install Android SDK platform-tools or set ANDROID_HOME');
    }
    fs.rmSync(BUNDLED, { recursive: true, force: true });
    fs.mkdirSync(BUNDLED);
    for (const file of ADB_FILES) {
        const from = path.join(source, file);
        if (fs.existsSync(from)) {
            fs.copyFileSync(from, path.join(BUNDLED, file));
        }
    }
    console.log('adb bundled from ' + source);
    execSync('npx electron-builder --win nsis --x64', { cwd: ROOT, stdio: 'inherit' });
}

try {
    main();
} catch (e) {
    console.error('Installer build failed: ' + e.message);
    process.exit(1);
}
