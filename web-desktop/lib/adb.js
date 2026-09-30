'use strict';

/**
 * Thin wrapper around the adb executable (Android SDK platform-tools).
 */

const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const IS_WINDOWS = process.platform === 'win32';
const ADB_EXE = IS_WINDOWS ? 'adb.exe' : 'adb';

function findAdb() {
    const candidates = [];
    if (process.env.BEAM_ADB) {
        candidates.push(process.env.BEAM_ADB);
    }
    // bundled platform-tools (next to the app)
    candidates.push(path.join(__dirname, '..', 'platform-tools', ADB_EXE));
    if (process.resourcesPath) {
        candidates.push(path.join(process.resourcesPath, 'platform-tools', ADB_EXE));
    }
    for (const env of ['ANDROID_HOME', 'ANDROID_SDK_ROOT']) {
        if (process.env[env]) {
            candidates.push(path.join(process.env[env], 'platform-tools', ADB_EXE));
        }
    }
    if (IS_WINDOWS && process.env.LOCALAPPDATA) {
        candidates.push(path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', ADB_EXE));
    }
    if (process.env.HOME) {
        candidates.push(path.join(process.env.HOME, 'Library', 'Android', 'sdk', 'platform-tools', ADB_EXE));
        candidates.push(path.join(process.env.HOME, 'Android', 'Sdk', 'platform-tools', ADB_EXE));
    }
    for (const candidate of candidates) {
        try {
            if (fs.statSync(candidate).isFile()) {
                return candidate;
            }
        } catch (e) {
            // not found
        }
    }
    // rely on the PATH
    return ADB_EXE;
}

class AdbError extends Error {
    constructor(message, result) {
        super(message);
        this.result = result;
    }
}

class Adb {
    constructor() {
        this.path = findAdb();
    }

    /**
     * Run an adb command and return {code, stdout, stderr} (never rejects on non-zero exit code).
     */
    run(args, { serial, timeout = 20000 } = {}) {
        const fullArgs = serial ? ['-s', serial, ...args] : args;
        return new Promise((resolve) => {
            execFile(this.path, fullArgs, { timeout, windowsHide: true, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' },
                (error, stdout, stderr) => {
                    let code = 0;
                    if (error) {
                        code = typeof error.code === 'number' ? error.code : -1;
                        if (error.code === 'ENOENT') {
                            stderr = 'adb not found (' + this.path + ')';
                        } else if (error.killed) {
                            stderr = (stderr || '') + ' (timeout)';
                        }
                    }
                    resolve({ code, stdout: stdout || '', stderr: stderr || '' });
                });
        });
    }

    async runOrThrow(args, options) {
        const result = await this.run(args, options);
        if (result.code !== 0) {
            const message = (result.stderr || result.stdout || '').trim() || ('adb ' + args.join(' ') + ' failed');
            throw new AdbError(message, result);
        }
        return result.stdout;
    }

    async version() {
        const result = await this.run(['version'], { timeout: 10000 });
        if (result.code !== 0) {
            return null;
        }
        const match = /Version ([^\s]+)/.exec(result.stdout);
        return match ? match[1] : result.stdout.split('\n')[0].trim();
    }

    async startServer() {
        await this.run(['start-server'], { timeout: 20000 });
    }

    /**
     * List the devices known by adb.
     */
    async devices() {
        const out = await this.runOrThrow(['devices', '-l'], { timeout: 10000 });
        const devices = [];
        for (const line of out.split(/\r?\n/)) {
            if (!line.trim() || line.startsWith('List of devices') || line.startsWith('*')) {
                continue;
            }
            const parts = line.trim().split(/\s+/);
            const serial = parts[0];
            const state = parts[1];
            const props = {};
            for (const part of parts.slice(2)) {
                const eq = part.indexOf(':');
                if (eq > 0) {
                    props[part.substring(0, eq)] = part.substring(eq + 1);
                }
            }
            let transport = 'usb';
            if (serial.startsWith('emulator-')) {
                transport = 'emulator';
            } else if (serial.includes('._adb-tls-connect._tcp') || /:\d+$/.test(serial)) {
                transport = 'wifi';
            }
            devices.push({
                serial,
                state,
                model: (props.model || '').replace(/_/g, ' '),
                product: props.product || '',
                device: props.device || '',
                transport,
            });
        }
        return devices;
    }

    /**
     * Services discovered on the local network through mDNS (wireless debugging).
     */
    async mdnsServices() {
        const result = await this.run(['mdns', 'services'], { timeout: 10000 });
        const services = [];
        for (const line of result.stdout.split(/\r?\n/)) {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 3 || !parts[1].startsWith('_adb')) {
                continue;
            }
            const [name, type, address] = parts;
            services.push({
                name,
                type: type.includes('pairing') ? 'pairing' : type.includes('tls-connect') ? 'connect' : 'other',
                address,
            });
        }
        return services;
    }

    async pair(address, code) {
        const result = await this.run(['pair', address, code], { timeout: 30000 });
        const text = (result.stdout + result.stderr).trim();
        if (result.code !== 0 || !/Successfully paired/i.test(text)) {
            throw new AdbError(text || 'Pairing failed', result);
        }
        return text;
    }

    async connect(address) {
        const result = await this.run(['connect', address], { timeout: 20000 });
        const text = (result.stdout + result.stderr).trim();
        if (!/connected to/i.test(text) || /failed|unable|cannot/i.test(text)) {
            throw new AdbError(text || 'Connection failed', result);
        }
        return text;
    }

    async disconnect(address) {
        const args = address ? ['disconnect', address] : ['disconnect'];
        return (await this.run(args, { timeout: 10000 })).stdout.trim();
    }

    async shell(serial, command, { timeout = 20000 } = {}) {
        const result = await this.run(['shell', command], { serial, timeout });
        return result;
    }

    async getProp(serial, name) {
        const result = await this.shell(serial, 'getprop ' + name, { timeout: 10000 });
        return result.stdout.trim();
    }

    async push(serial, local, remote) {
        await this.runOrThrow(['push', local, remote], { serial, timeout: 60000 });
    }

    /**
     * adb forward tcp:0 <remote>: returns the local port allocated by adb.
     */
    async forward(serial, remote) {
        const out = await this.runOrThrow(['forward', 'tcp:0', remote], { serial, timeout: 15000 });
        const port = parseInt(out.trim(), 10);
        if (!port) {
            throw new AdbError('adb forward did not return a port: ' + out);
        }
        return port;
    }

    async forwardRemove(serial, port) {
        await this.run(['forward', '--remove', 'tcp:' + port], { serial, timeout: 10000 });
    }

    spawnShell(serial, command) {
        return spawn(this.path, ['-s', serial, 'shell', command], { windowsHide: true });
    }
}

module.exports = { Adb, AdbError, findAdb };
