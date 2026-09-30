/** Isolated interface preview. Never loads adb, changes user data, or connects to a phone. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../public');
const taskbarDemo = process.argv.includes('--taskbar-demo');
const demoApps = [
    { package: 'demo.browser', component: 'demo.browser/.Main', label: 'Browser', system: false },
    { package: 'demo.music', component: 'demo.music/.Main', label: 'Music', system: false },
    { package: 'demo.gallery', component: 'demo.gallery/.Main', label: 'Gallery', system: false },
];
const config = { session: { maxSize: 1920, bitRate: 12000000, maxFps: 60, codec: 'h264', audio: true, stayAwake: true, newDisplay: '' } };
const routes = {
    '/api/info': { adbVersion: 'Design preview', version: '2.0.0' },
    '/api/config': config,
    '/api/profiles': { profiles: [], presets: [] },
    '/api/sessions': { sessions: [] },
    '/api/devices': { devices: [], mdns: [] },
    ...(taskbarDemo ? { '/api/apps': { apps: demoApps } } : {}),
};
http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (taskbarDemo && url.pathname === '/api/apps/launch' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end('{}'); // Simulation only. No adb module is loaded.
    }
    if (taskbarDemo && url.pathname === '/__test/taskbar-demo.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
        return res.end(fs.readFileSync(path.join(__dirname, '../tests/taskbar-demo.js')));
    }
    if (url.pathname.startsWith('/api/')) {
        res.writeHead(req.method === 'GET' && routes[url.pathname] ? 200 : 403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(req.method === 'GET' && routes[url.pathname] || { error: 'Design preview: connecting and saving are turned off.' }));
    }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (error, data) => {
        if (error) { res.writeHead(404); return res.end(); }
        const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        if (taskbarDemo && path.extname(file) === '.html') data = data.toString().replace('src="js/main.js"', 'src="/__test/taskbar-demo.js"');
        res.end(data);
    });
}).listen(3010, '127.0.0.1', () => console.log('Design preview: http://localhost:3010 (no phone connection)'));
