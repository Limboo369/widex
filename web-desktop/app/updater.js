'use strict';

/**
 * Automatic updates: on start, look for a newer Wi-Dex on GitHub Releases (Limboo369/widex).
 * Nothing is downloaded without asking: the user confirms the download and the restart.
 *
 * Local test (unpackaged app only):
 *   WIDEX_UPDATE_URL=http://127.0.0.1:8765/  folder with latest.yml + Wi-Dex-Setup-<version>.exe
 *   WIDEX_PRETEND_VERSION=2.0.0              pretend to be an older version
 */

const { app, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');

const CHECK_DELAY_MS = 5000;

function configureLocalTest() {
    const url = process.env.WIDEX_UPDATE_URL;
    if (app.isPackaged || !url) {
        return false;
    }
    autoUpdater.forceDevUpdateConfig = true;
    autoUpdater.setFeedURL({ provider: 'generic', url });
    if (process.env.WIDEX_PRETEND_VERSION) {
        // electron-updater's own semver copy (instanceof checks)
        const { SemVer } = require(require.resolve('semver', { paths: [require.resolve('electron-updater')] }));
        autoUpdater.currentVersion = new SemVer(process.env.WIDEX_PRETEND_VERSION);
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
            title: 'Wi-Dex',
            message: 'Dostupna je nova verzija Wi-Dex ' + info.version,
            detail: 'Trenutna verzija: ' + autoUpdater.currentVersion.version
                + '\n\nPreuzimanje ide u pozadini, a igru možeš da nastaviš.',
            buttons: ['Preuzmi', 'Kasnije'],
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
            title: 'Wi-Dex',
            message: 'Wi-Dex ' + info.version + ' je spreman za instalaciju',
            detail: 'Restartuj sada, ili će se instalirati kada sledeći put zatvoriš Wi-Dex.',
            buttons: ['Restartuj sada', 'Kasnije'],
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
