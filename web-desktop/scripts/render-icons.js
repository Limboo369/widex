// Renders the PNG icons in public/img/icons from Phosphor Icons (MIT).
//   npm install --no-save @phosphor-icons/core && npx electron scripts/render-icons.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const OUT = process.env.OUT || path.join(__dirname, '..', 'public', 'img', 'icons');
// the package does not export package.json, so find it through node_modules
const P = path.join(__dirname, '..', 'node_modules', '@phosphor-icons', 'core', 'assets');
const svg = (name, weight = 'fill') => fs.readFileSync(path.join(P, weight, name + (weight === 'regular' ? '' : '-' + weight) + '.svg'), 'utf8');

const glyphs = {
  phone: ['device-mobile'], game: ['game-controller'], keyboard: ['keyboard'], wifi: ['wifi-high', 'bold'], settings: ['gear-six'],
  help: ['question'], grid: ['squares-four'], volume: ['speaker-high'], muted: ['speaker-slash'], battery: ['battery-high'],
  light: ['lightbulb'], refresh: ['arrows-clockwise', 'bold'], rotate: ['arrow-clockwise', 'bold'], link: ['link', 'bold'], monitor: ['monitor'],
  plug: ['plug'], play: ['play'], eye: ['eye'], fullscreen: ['corners-out', 'bold'], back: ['caret-left'], home: ['circle'],
  square: ['square'], bell: ['bell'], close: ['x', 'bold'], minus: ['minus', 'bold'], check: ['check', 'bold'],
  warning: ['warning'], mouse: ['mouse'], save: ['floppy-disk'], bolt: ['lightning'], search: ['magnifying-glass', 'bold'],
  info: ['info'], video: ['film-strip'], tools: ['wrench'], trash: ['trash'],
};
// two glyphs in one icon: [outer, weight], [inner, weight, size, center x, center y] (fractions of the icon)
const composed = {
  // an Android app over the whole screen: a phone inside the fullscreen corners
  'app-fullscreen': [['corners-out', 'bold'], ['device-mobile', 'fill', .5, .5, .5]],
  // Wi-Dex over the whole screen: arrows out / in on a monitor
  'widex-fullscreen': [['monitor', 'bold'], ['arrows-out', 'bold', .42, .5, .42]],
  'widex-fullscreen-exit': [['monitor', 'bold'], ['arrows-in', 'bold', .42, .5, .42]],
};
// desktop tiles: [glyph, gradient top, gradient bottom]
const tiles = {
  phone: ['device-mobile', '#5aa9ff', '#2350e6'], game: ['game-controller', '#c77dff', '#6a2ee8'],
  keyboard: ['keyboard', '#4fe0c8', '#0b8f9e'], wifi: ['wifi-high', '#6ee7a0', '#12955a', 'bold'],
  settings: ['gear-six', '#aeb8c8', '#4c566a'], help: ['question', '#ffc56b', '#f0752a'],
};

const page = `<canvas id=c></canvas><script>
async function img(text){ const i=new Image(); i.src='data:image/svg+xml;base64,'+btoa(text); await i.decode(); return i; }
window.glyph = async (text, size) => { const c=document.getElementById('c'); c.width=c.height=size; const x=c.getContext('2d');
  x.clearRect(0,0,size,size); const i=await img(text.replace('fill="currentColor"','fill="#fff"')); x.drawImage(i,0,0,size,size); return c.toDataURL('image/png'); };
window.compose = async (outer, inner, s, cx, cy, size) => { const c=document.getElementById('c'); c.width=c.height=size; const x=c.getContext('2d');
  x.clearRect(0,0,size,size); const white=(t)=>t.replace('fill="currentColor"','fill="#fff"');
  x.drawImage(await img(white(outer)),0,0,size,size); const w=s*size; x.drawImage(await img(white(inner)),cx*size-w/2,cy*size-w/2,w,w); return c.toDataURL('image/png'); };
window.tile = async (text, top, bottom, size) => { const c=document.getElementById('c'); c.width=c.height=size; const x=c.getContext('2d'); x.clearRect(0,0,size,size);
  const pad=size*.04, s=size-2*pad, r=s*.235;
  const rr=()=>{ x.beginPath(); x.roundRect(pad,pad,s,s,r); };
  let g=x.createLinearGradient(0,pad,0,pad+s); g.addColorStop(0,top); g.addColorStop(1,bottom); rr(); x.fillStyle=g; x.fill();
  // soft light from the top, like glass
  g=x.createRadialGradient(size*.3,pad,0,size*.3,pad,s*.95); g.addColorStop(0,'rgba(255,255,255,.35)'); g.addColorStop(1,'rgba(255,255,255,0)');
  rr(); x.fillStyle=g; x.fill();
  // thin inner edge
  x.save(); rr(); x.clip(); x.lineWidth=size*.012; x.strokeStyle='rgba(255,255,255,.35)'; x.beginPath(); x.roundRect(pad+x.lineWidth/2,pad+x.lineWidth/2,s-x.lineWidth,s-x.lineWidth,r); x.stroke(); x.restore();
  const i=await img(text.replace('fill="currentColor"','fill="#fff"')); const gs=s*.54, o=(size-gs)/2;
  x.save(); x.shadowColor='rgba(0,0,0,.28)'; x.shadowBlur=size*.03; x.shadowOffsetY=size*.012; x.drawImage(i,o,o,gs,gs); x.restore();
  return c.toDataURL('image/png'); };
</script>`;

process.on('unhandledRejection', (e) => { console.error(e); app.exit(1); });
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html;base64,' + Buffer.from(page).toString('base64'));
  const save = (file, data) => fs.writeFileSync(path.join(OUT, file), Buffer.from(data.split(',')[1], 'base64'));
  fs.mkdirSync(path.join(OUT, 'desktop'), { recursive: true });
  for (const [name, [src, weight]] of Object.entries(glyphs)) {
    save(name + '.png', await win.webContents.executeJavaScript(`glyph(${JSON.stringify(svg(src, weight))}, 72)`));
  }
  for (const [name, [[outer, ow], [inner, iw, s, cx, cy]]] of Object.entries(composed)) {
    save(name + '.png', await win.webContents.executeJavaScript(`compose(${JSON.stringify(svg(outer, ow))}, ${JSON.stringify(svg(inner, iw))}, ${s}, ${cx}, ${cy}, 72)`));
  }
  for (const [name, [src, top, bottom, weight]] of Object.entries(tiles)) {
    save('desktop/' + name + '.png', await win.webContents.executeJavaScript(`tile(${JSON.stringify(svg(src, weight))}, '${top}', '${bottom}', 256)`));
  }
  app.quit();
});
