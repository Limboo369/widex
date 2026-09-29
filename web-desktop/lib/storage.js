'use strict';

/**
 * Persistent data (settings, key mapping profiles, app list cache), shared by the browser version and the Windows app:
 *   Windows: %APPDATA%\Wi-Dex      other: ~/.config/wi-dex      (override: WIDEX_DATA_DIR)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function getDataDir() {
    if (process.env.WIDEX_DATA_DIR) {
        return process.env.WIDEX_DATA_DIR;
    }
    if (process.platform === 'win32' && process.env.APPDATA) {
        return path.join(process.env.APPDATA, 'Wi-Dex');
    }
    return path.join(os.homedir(), '.config', 'wi-dex');
}

const DATA_DIR = getDataDir();
const PROFILES_DIR = path.join(DATA_DIR, 'profiles');
const CACHE_DIR = path.join(DATA_DIR, 'cache');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const PRESETS_DIR = path.join(__dirname, '..', 'presets');

function ensureDirs() {
    for (const dir of [DATA_DIR, PROFILES_DIR, CACHE_DIR]) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function readJson(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        return fallback;
    }
}

function writeJson(file, data) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
}

// ---------- settings ----------

const DEFAULT_CONFIG = {
    lastDevice: null,
    lastAddress: '',
    session: {
        maxSize: 1920,
        bitRate: 12000000,
        maxFps: 60,
        codec: 'h264',
        audio: true,
        turnScreenOff: false,
        stayAwake: true,
        newDisplay: '',
        encoderName: '',
    },
};

function loadConfig() {
    const saved = readJson(CONFIG_FILE, {});
    return Object.assign({}, DEFAULT_CONFIG, saved, {
        session: Object.assign({}, DEFAULT_CONFIG.session, saved.session || {}),
    });
}

function saveConfig(config) {
    ensureDirs();
    writeJson(CONFIG_FILE, config);
}

// ---------- key mapping profiles ----------

function sanitizeName(name) {
    return String(name).replace(/[^\w.\-]/g, '_').substring(0, 150);
}

function listProfiles() {
    ensureDirs();
    const result = [];
    for (const file of fs.readdirSync(PROFILES_DIR)) {
        if (!file.endsWith('.json')) {
            continue;
        }
        const profile = readJson(path.join(PROFILES_DIR, file), null);
        if (profile) {
            result.push({ package: profile.package || file.slice(0, -5), name: profile.name || '', updated: profile.updated || 0 });
        }
    }
    return result;
}

function getProfile(pkg) {
    return readJson(path.join(PROFILES_DIR, sanitizeName(pkg) + '.json'), null);
}

function saveProfile(pkg, profile) {
    ensureDirs();
    const data = Object.assign({}, profile, { package: pkg, updated: Date.now() });
    writeJson(path.join(PROFILES_DIR, sanitizeName(pkg) + '.json'), data);
    return data;
}

function deleteProfile(pkg) {
    try {
        fs.unlinkSync(path.join(PROFILES_DIR, sanitizeName(pkg) + '.json'));
        return true;
    } catch (e) {
        return false;
    }
}

function listPresets() {
    const result = [];
    try {
        for (const file of fs.readdirSync(PRESETS_DIR)) {
            if (file.endsWith('.json')) {
                const preset = readJson(path.join(PRESETS_DIR, file), null);
                if (preset) {
                    preset.id = file.slice(0, -5);
                    result.push(preset);
                }
            }
        }
    } catch (e) {
        // no presets
    }
    result.sort((a, b) => (a.order || 0) - (b.order || 0));
    return result;
}

// ---------- cache ----------

function readCache(name) {
    return readJson(path.join(CACHE_DIR, sanitizeName(name) + '.json'), null);
}

function writeCache(name, data) {
    ensureDirs();
    writeJson(path.join(CACHE_DIR, sanitizeName(name) + '.json'), data);
}

module.exports = {
    DATA_DIR,
    loadConfig,
    saveConfig,
    listProfiles,
    getProfile,
    saveProfile,
    deleteProfile,
    listPresets,
    readCache,
    writeCache,
};
