'use strict';

/**
 * Automatic updates: on start, look for a newer Beam on GitHub Releases (Limboo369/widex).
 * Nothing is downloaded without asking: the user confirms the download and the restart.
 *
 * Local test (unpackaged app only):
 *   BEAM_UPDATE_URL=http://127.0.0.1:8765/   folder with latest.yml + Beam-Setup-<version>.exe
 *   BEAM_PRETEND_VERSION=2.0.0               pretend to be an older version
 */

const { app, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const { APP_NAME } = require('../lib/brand');

const CHECK_DELAY_MS = 5000;

function configureLocalTest() {
    const url = process.env.BEAM_UPDATE_URL;
    if (app.isPackaged || !url) {
        return false;
    }
    autoUpdater.forceDevUpdateConfig = true;
    autoUpdater.setFeedURL({ provider: 'generic', url });
    if (process.env.BEAM_PRETEND_VERSION) {
        // electron-updater's own semver copy (instanceof checks)
        const { SemVer } = require(require.resolve('semver', { paths: [require.resolve('electron-updater')] }));
        autoUpdater.currentVersion = new SemVer(process.env.BEAM_PRETEND_VERSION);
    }
    return true;
}

function initAutoUpdate(getWindow) {
    if (!app.isPackaged && !configureLocalTest()) {
        return;
    }
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', async (info) => {
        const { response } = await dialog.showMessageBox(getWindow(), {
            type: 'info',
            title: APP_NAME,
            message: APP_NAME + ' ' + info.version + ' is available',
            detail: 'Current version: ' + autoUpdater.currentVersion.version
                + '\n\nIt downloads in the background, so you can keep playing.',
            buttons: ['Download', 'Later'],
            defaultId: 0,
            cancelId: 1,
            noLink: true,
        });
        if (response === 0) {
            autoUpdater.downloadUpdate().catch(() => {});
        }
    });

    autoUpdater.on('download-progress', (progress) => {
        const win = getWindow();
        if (win) {
            win.setProgressBar(progress.percent / 100);
        }
    });

    autoUpdater.on('update-downloaded', async (info) => {
        const win = getWindow();
        if (win) {
            win.setProgressBar(-1);
        }
        const { response } = await dialog.showMessageBox(win, {
            type: 'info',
            title: APP_NAME,
            message: APP_NAME + ' ' + info.version + ' is ready to install',
            detail: 'Restart now, or it will be installed the next time you close ' + APP_NAME + '.',
            buttons: ['Restart now', 'Later'],
            defaultId: 0,
            cancelId: 1,
            noLink: true,
        });
        if (response === 0) {
            // the before-quit handler in main.js still stops the sessions first
            setImmediate(() => autoUpdater.quitAndInstall(true, true));
        }
    });

    autoUpdater.on('error', (e) => {
        // no internet or no release yet: stay silent, the app works normally
        const win = getWindow();
        if (win) {
            win.setProgressBar(-1);
        }
        console.error('update check failed: ' + (e && e.message));
    });

    setTimeout(() => {
        autoUpdater.checkForUpdates().catch(() => {});
    }, CHECK_DELAY_MS);
}

module.exports = { initAutoUpdate };
