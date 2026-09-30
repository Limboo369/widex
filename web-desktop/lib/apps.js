'use strict';

/**
 * List and launch the apps installed on the phone.
 */

const { SERVER_VERSION, SERVER_JAR, DEVICE_JAR } = require('./session');
const storage = require('./storage');

const BEGIN_MARKER = 'BEAM_APPS_BEGIN';
const END_MARKER = 'BEAM_APPS_END';

function cacheName(serial) {
    return 'apps-' + serial;
}

async function listApps(adb, serial, { refresh = false } = {}) {
    if (!refresh) {
        const cached = storage.readCache(cacheName(serial));
        if (cached && Array.isArray(cached.apps)) {
            return cached.apps;
        }
    }
    await adb.push(serial, SERVER_JAR, DEVICE_JAR);
    const command = 'CLASSPATH=' + DEVICE_JAR + ' app_process / com.beam.server.Server ' + SERVER_VERSION + ' mode=list_apps icon_size=96';
    const result = await adb.shell(serial, command, { timeout: 90000 });
    const text = result.stdout;
    const begin = text.indexOf(BEGIN_MARKER);
    const end = text.indexOf(END_MARKER);
    if (begin === -1 || end === -1) {
        throw new Error('The app list is not available: ' + (result.stderr || text).trim().split('\n').slice(-3).join(' '));
    }
    const apps = JSON.parse(text.substring(begin + BEGIN_MARKER.length, end).trim());
    apps.sort((a, b) => a.label.localeCompare(b.label, 'sr'));
    storage.writeCache(cacheName(serial), { time: Date.now(), apps });
    return apps;
}

function shellQuote(value) {
    return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

async function launchApp(adb, serial, target, displayId) {
    if (!/^[\w.$\/]+$/.test(target)) {
        throw new Error('Invalid app name');
    }
    let command;
    if (target.includes('/')) {
        command = 'am start ' + (displayId > 0 ? '--display ' + (displayId | 0) + ' ' : '') + '-n ' + shellQuote(target);
    } else {
        command = 'monkey -p ' + shellQuote(target) + ' -c android.intent.category.LAUNCHER 1';
    }
    const result = await adb.shell(serial, command, { timeout: 20000 });
    const output = (result.stdout + result.stderr).trim();
    if (result.code !== 0 || /Error|Exception/.test(output)) {
        throw new Error(output || 'Could not start the app');
    }
    return output;
}

module.exports = { listApps, launchApp };
