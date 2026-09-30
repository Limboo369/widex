'use strict';

/**
 * The app name, in one place for the server and the Windows app (the page uses public/js/brand.js).
 * The installer names (productName, shortcut, setup file) are in package.json "build".
 */
module.exports = {
    APP_NAME: 'Beam',
    // %APPDATA%\Beam on Windows, ~/.config/beam elsewhere
    DATA_DIR_NAME: 'Beam',
    // the app's earlier name: its saved profiles and settings are copied over once
    LEGACY_DATA_DIR_NAME: 'Wi-Dex',
};
