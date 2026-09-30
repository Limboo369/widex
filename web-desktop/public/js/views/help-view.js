/**
 * Help window.
 */
import { h } from '../util/dom.js';
import { APP_NAME } from '../brand.js';

function row(keys, text) {
    return h('tr', h('td', keys), h('td', text));
}

export function createHelpView(openSetup) {
    return h('div.view',
        h('div.section',
            h('div.section-title', h('h3', '📱 Setting up a phone'),
                h('button.btn.btn-sm.btn-primary', { onclick: openSetup }, 'Open setup guide')),
            h('p.small', 'Step-by-step guide: Developer options, USB or wireless debugging, the permission prompt and drivers, with a live connection check.')),
        h('div.section',
            h('h3', '🎮 How to play'),
            h('ol.steps',
                h('li', 'Connect your phone (the ', h('b', 'Connect'), ' window) and click ', h('b', '▶ Start'), '.'),
                h('li', 'Open a game from the ', h('b', 'Games & apps'), ' menu or straight on the phone screen.'),
                h('li', 'Press ', h('kbd', 'F8'), ' (or 🎮 Game): the mouse and keyboard become the controls.'),
                h('li', 'The first time, press ', h('kbd', 'F9'), ', pick a template (e.g. Shooter) and drag the markers exactly over the buttons in the game. Save.'),
                h('li', 'Click the screen so the mouse takes over the camera. ', h('kbd', '`'), ' (the key left of 1) frees the cursor for menus.'))),
        h('div.section',
            h('h3', '⌨️ Shortcuts'),
            h('table.shortcut-table',
                row(h('kbd', 'F8'), 'Game mode on/off'),
                row(h('kbd', 'F9'), 'Key mapping for the current game (the profile is saved per game)'),
                row(h('kbd', 'F10'), 'App fullscreen: only the phone screen, without the ' + APP_NAME + ' desktop (Esc goes to the game; hold Esc to exit)'),
                row(h('kbd', 'F11'), APP_NAME + ' fullscreen: the whole desktop, like any Windows app'),
                row(h('kbd', '`'), 'In a game: free/capture the mouse (a cursor for clicking menus)'),
                row(h('kbd', 'Esc'), 'Release the mouse (outside fullscreen) / Back on the phone'),
                row('Right click', 'Back (outside game mode)'),
                row('Middle click', 'Home (outside game mode)'),
                row('Wheel', 'Scroll (outside game mode)'),
                row([h('kbd', 'Ctrl'), '+', h('kbd', 'V')], 'Paste text from the PC into the phone'),
                row([h('kbd', 'Ctrl'), '+', h('kbd', 'C')], 'Copy the selected text from the phone to the PC'))),
        h('div.section',
            h('h3', '💡 Tips for the best results'),
            h('ul',
                h('li', 'Use 5 GHz (or 6 GHz) Wi-Fi with the phone close to the router. The PC is best on a cable.'),
                h('li', 'If the picture lags or stutters: Settings → lower the bitrate or resolution ("Fast").'),
                h('li', 'Turn on "Turn the phone screen off": the game keeps running and the phone stays cooler.'),
                h('li', 'After the phone restarts, turn Wireless debugging on again (no need to pair again).'),
                h('li', 'Note: some games do not allow keyboard mapping (anti-cheat). Use it at your own risk.'))),
        h('div.section',
            h('h3', '❓ Troubleshooting'),
            h('ul',
                h('li', h('b', 'The phone does not show up: '), 'check that both are on the same network, turn Wireless debugging off and on, or enter the IP and port manually.'),
                h('li', h('b', 'No picture: '), 'use Chrome or Edge and open ', h('code', 'http://localhost:3000'), ' (not the IP address).'),
                h('li', h('b', 'No sound: '), 'click anywhere on the page (the browser needs a click before it plays sound).'),
                h('li', h('b', 'The controls miss: '), 'open the key mapping (F9) while the game is open and line up the markers.'),
                h('li', h('b', 'The phone screen stayed off: '), 'press the power button twice.'))));
}
