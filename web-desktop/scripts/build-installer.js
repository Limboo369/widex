#!/usr/bin/env node
/**
 * Build the installer for the current OS, with adb (Android SDK platform-tools) bundled
 * so the installed app works without the SDK:
 *   Windows: dist/installer/Beam-<version>-Windows-Setup.exe (+ latest.yml for auto-update)
 *   macOS:   dist/installer/Beam-<version>-macOS-AppleSilicon.dmg and Beam-<version>-macOS-Intel.dmg
 *   npm run installer
 * PLATFORM_TOOLS_DIR points at an unpacked platform-tools folder (otherwise the Android SDK is searched).
 */
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BUNDLED = path.join(ROOT, 'platform-tools');
const OUT = path.join(ROOT, 'dist', 'installer');
const IS_MAC = process.platform === 'darwin';
const ADB = IS_MAC ? 'adb' : 'adb.exe';
const ADB_FILES = IS_MAC ? ['adb', 'NOTICE.txt'] : ['adb.exe', 'AdbWinApi.dll', 'AdbWinUsbApi.dll', 'libwinpthread-1.dll', 'NOTICE.txt'];
// electron-builder arch -> the name people know
const MAC_ARCHS = { arm64: 'AppleSilicon', x64: 'Intel' };

function findPlatformTools() {
    const candidates = [];
    if (process.env.PLATFORM_TOOLS_DIR) {
        candidates.push(process.env.PLATFORM_TOOLS_DIR);
    }
    for (const env of ['ANDROID_HOME', 'ANDROID_SDK_ROOT']) {
        if (process.env[env]) {
            candidates.push(path.join(process.env[env], 'platform-tools'));
        }
    }
    if (process.env.LOCALAPPDATA) {
        candidates.push(path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools'));
    }
    candidates.push(path.join(os.homedir(), 'Library', 'Android', 'sdk', 'platform-tools'));
    return candidates.find((dir) => fs.existsSync(path.join(dir, ADB)));
}

function bundleAdb() {
    const source = findPlatformTools();
    if (!source) {
        throw new Error(ADB + ' not found: install Android SDK platform-tools, or set PLATFORM_TOOLS_DIR or ANDROID_HOME');
    }
    fs.rmSync(BUNDLED, { recursive: true, force: true });
    fs.mkdirSync(BUNDLED);
    for (const file of ADB_FILES) {
        const from = path.join(source, file);
        if (fs.existsSync(from)) {
            fs.copyFileSync(from, path.join(BUNDLED, file));
        }
    }
    if (IS_MAC) {
        fs.chmodSync(path.join(BUNDLED, 'adb'), 0o755);
    }
    console.log('adb bundled from ' + source);
}

function main() {
    if (!fs.existsSync(path.join(ROOT, 'bin', 'beam-server.jar'))) {
        throw new Error('bin/beam-server.jar is missing: run "npm run build-server" first');
    }
    bundleAdb();
    const run = (args) => execSync('npx electron-builder ' + args + ' --publish never', { cwd: ROOT, stdio: 'inherit' });
    if (!IS_MAC) {
        run('--win nsis --x64');
        return;
    }
    const version = require(path.join(ROOT, 'package.json')).version;
    for (const [arch, label] of Object.entries(MAC_ARCHS)) {
        run('--mac dmg --' + arch);
        // package.json names it Beam-<version>-macOS-<arch>.dmg
        fs.renameSync(path.join(OUT, 'Beam-' + version + '-macOS-' + arch + '.dmg'),
            path.join(OUT, 'Beam-' + version + '-macOS-' + label + '.dmg'));
    }
}

try {
    main();
} catch (e) {
    console.error('Installer build failed: ' + e.message);
    process.exit(1);
}
