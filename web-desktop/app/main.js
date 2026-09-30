'use strict';

/**
 * Beam as a Windows application (Electron): same web desktop, without the browser around it.
 * Advantages for games: browser shortcuts (Ctrl+W, Ctrl+R, Alt...) do not interfere, one window, starts the server itself.
 */

const path = require('path');
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');

// the data (profiles, settings) is shared with the browser version (%APPDATA%\Beam)
const { startServer, findRunningServer } = require('../server');
const { initAutoUpdate } = require('./updater');
const { APP_NAME, DATA_DIR_NAME } = require('../lib/brand');

const PORT = 3000;

// Chromium's own files (cache, local storage...) in a subfolder, apart from the profiles and settings
app.setPath('userData', path.join(app.getPath('appData'), DATA_DIR_NAME, 'electron'));

// smoother video: never throttle the page, use the GPU for decoding
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport');

let server = null;
let mainWindow = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
            }
            mainWindow.focus();
        }
    });
}

async function createWindow() {
    let baseUrl;
    if (await findRunningServer(PORT)) {
        // the browser version is already running: use its server (one server per phone)
        baseUrl = 'http://127.0.0.1:' + PORT;
    } else {
        try {
            server = await startServer({ port: PORT, host: '127.0.0.1', open: false, quiet: true });
        } catch (e) {
            dialog.showErrorBox(APP_NAME, 'Could not start the ' + APP_NAME + ' server: ' + e.message);
            app.quit();
            return;
        }
        baseUrl = 'http://127.0.0.1:' + server.port;
    }

    Menu.setApplicationMenu(null);
    mainWindow = new BrowserWindow({
        width: 1600,
        height: 940,
        minWidth: 900,
        minHeight: 560,
        title: APP_NAME,
        backgroundColor: '#0b0d14',
        icon: path.join(__dirname, 'icon.png'),
        autoHideMenuBar: true,
        show: false,
        webPreferences: {
            backgroundThrottling: false,
            spellcheck: false,
        },
    });
    mainWindow.once('ready-to-show', async () => {
        mainWindow.maximize();
        mainWindow.show();
        // "Start in fullscreen": the same fullscreen as F11 in the page (the page needs a user gesture for it)
        try {
            const config = await (await fetch(baseUrl + '/api/config')).json();
            if (config.startFullscreen && mainWindow) {
                mainWindow.webContents.executeJavaScript('document.documentElement.requestFullscreen()', true).catch(() => {});
            }
        } catch (e) {
            // start in a window
        }
    });

    // external links in the default browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
    // do not leave the app with the mouse "back" button or Alt+Left
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (!url.startsWith(baseUrl)) {
            event.preventDefault();
        }
    });
    mainWindow.webContents.on('before-input-event', (event, input) => {
        // developer tools (for diagnostics)
        if (input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 'i') {
            mainWindow.webContents.toggleDevTools();
        }
    });
    // pointer lock, fullscreen, clipboard: allowed (local page)
    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        callback(['pointerLock', 'fullscreen', 'clipboard-read', 'clipboard-sanitized-write', 'keyboardLock'].includes(permission));
    });

    mainWindow.loadURL(baseUrl + '/?app=1');
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(async () => {
    await createWindow();
    initAutoUpdate(() => mainWindow);
});

app.on('window-all-closed', () => {
    app.quit();
});

app.on('before-quit', async (event) => {
    if (server && !quitting) {
        // stop the sessions first: the phone screen and sound are restored
        event.preventDefault();
        quitting = true;
        try {
            await Promise.race([server.shutdown(), new Promise((resolve) => setTimeout(resolve, 4000))]);
        } finally {
            server = null;
            app.quit();
        }
    }
});
