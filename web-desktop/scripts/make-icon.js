// Generates the application icon (app/icon.png and a multi-size app/icon.ico) from public/img/icon.svg.
// Runs headless in Electron (no window):  npx electron scripts/make-icon.js
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow, dialog } = require('electron');

const ROOT = path.join(__dirname, '..');
const SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];

dialog.showErrorBox = (title, content) => { console.error(title, content); app.exit(1); };
process.on('uncaughtException', (e) => { console.error(e); app.exit(1); });
app.disableHardwareAcceleration();
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'beam-icon-')));

const page = `<canvas id=c></canvas><script>
window.render = async (text, size) => {
  const i = new Image(); i.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(text))); await i.decode();
  const c = document.getElementById('c'); c.width = c.height = size; const x = c.getContext('2d');
  x.clearRect(0, 0, size, size); x.drawImage(i, 0, 0, size, size); return c.toDataURL('image/png');
};
</script>`;

// ICO with one PNG entry per size (PNG entries are supported since Windows Vista)
function encodeIco(pngs) {
    const header = Buffer.alloc(6 + 16 * pngs.length);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(pngs.length, 4);
    let offset = header.length;
    pngs.forEach(({ size, data }, k) => {
        const e = 6 + 16 * k;
        header.writeUInt8(size >= 256 ? 0 : size, e);
        header.writeUInt8(size >= 256 ? 0 : size, e + 1);
        header.writeUInt16LE(1, e + 4); // color planes
        header.writeUInt16LE(32, e + 6); // bits per pixel
        header.writeUInt32LE(data.length, e + 8);
        header.writeUInt32LE(offset, e + 12);
        offset += data.length;
    });
    return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

app.whenReady().then(async () => {
    const svg = fs.readFileSync(path.join(ROOT, 'public', 'img', 'icon.svg'), 'utf8');
    const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
    await win.loadURL('data:text/html;base64,' + Buffer.from(page).toString('base64'));
    const pngs = [];
    for (const size of SIZES) {
        const url = await win.webContents.executeJavaScript(`render(${JSON.stringify(svg)}, ${size})`);
        pngs.push({ size, data: Buffer.from(url.split(',')[1], 'base64') });
    }
    fs.writeFileSync(path.join(ROOT, 'app', 'icon.png'), pngs[pngs.length - 1].data);
    fs.writeFileSync(path.join(ROOT, 'app', 'icon.ico'), encodeIco(pngs));
    console.log('app/icon.png and app/icon.ico (' + SIZES.join(', ') + ' px) written');
    app.exit(0);
});
