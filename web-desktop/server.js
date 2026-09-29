#!/usr/bin/env node
'use strict';

/**
 * Wi-Dex PC server: serves the web desktop (http://localhost:3000) and bridges the browser and the phone.
 *
 *   node server.js [--port 3000] [--open]
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const { Adb } = require('./lib/adb');
const { SessionManager, SERVER_VERSION, SERVER_JAR } = require('./lib/session');
const apps = require('./lib/apps');
const storage = require('./lib/storage');

const PUBLIC_DIR = path.join(__dirname, 'public');
const APP_VERSION = require('./package.json').version;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json',
    '.woff2': 'font/woff2',
};

function parseArgs(argv) {
    const args = { port: parseInt(process.env.PORT, 10) || 3000, open: false };
    for (let i = 0; i < argv.length; ++i) {
        if (argv[i] === '--port') {
            args.port = parseInt(argv[++i], 10);
        } else if (argv[i] === '--open') {
            args.open = true;
        }
    }
    return args;
}

function sendJson(res, status, data) {
    const body = JSON.stringify(data);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
    });
    res.end(body);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > 5 * 1024 * 1024) {
                reject(new Error('Body too large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (!chunks.length) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch (e) {
                reject(new Error('Invalid JSON'));
            }
        });
        req.on('error', reject);
    });
}

function isLocalHost(hostHeader) {
    if (!hostHeader) {
        return false;
    }
    const host = hostHeader.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function isAllowedOrigin(origin) {
    if (!origin || origin === 'null' || origin.startsWith('file://')) {
        return true;
    }
    try {
        return isLocalHost(new URL(origin).host);
    } catch (e) {
        return false;
    }
}

function serveStatic(req, res, pathname) {
    let relative = decodeURIComponent(pathname);
    if (relative === '/' || relative === '') {
        relative = '/index.html';
    }
    const file = path.normalize(path.join(PUBLIC_DIR, relative));
    if (!file.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        res.end();
        return;
    }
    fs.stat(file, (err, stat) => {
        if (err || !stat.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not found');
            return;
        }
        res.writeHead(200, {
            'Content-Type': MIME_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
            'Content-Length': stat.size,
            'Cache-Control': 'no-cache',
        });
        fs.createReadStream(file).pipe(res);
    });
}

function openBrowser(url) {
    try {
        if (process.platform === 'win32') {
            spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
        } else if (process.platform === 'darwin') {
            spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
        } else {
            spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
        }
    } catch (e) {
        console.log('Otvori ručno: ' + url);
    }
}

function listen(server, port, host) {
    return new Promise((resolve, reject) => {
        const onError = (e) => {
            server.removeListener('listening', onListening);
            reject(e);
        };
        const onListening = () => {
            server.removeListener('error', onError);
            resolve(server.address().port);
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, host);
    });
}

async function startServer({ port = 3000, host = '127.0.0.1', open = false, quiet = false } = {}) {
    const adb = new Adb();
    const sessions = new SessionManager(adb);
    const serverLogs = [];

    const log = (line) => {
        const entry = new Date().toISOString().substring(11, 19) + ' ' + line;
        serverLogs.push(entry);
        if (serverLogs.length > 300) {
            serverLogs.shift();
        }
        if (!quiet) {
            console.log(line);
        }
    };
    sessions.on('log', (session, line) => {
        if (!quiet) {
            console.log('[' + session.serial + '] ' + line.substring(9));
        }
    });

    adb.startServer().catch(() => {});

    const routes = {
        'GET /api/info': async () => ({
            version: APP_VERSION,
            serverVersion: SERVER_VERSION,
            adb: adb.path,
            adbVersion: await adb.version(),
            serverJar: fs.existsSync(SERVER_JAR),
            dataDir: storage.DATA_DIR,
            platform: process.platform,
        }),
        'GET /api/devices': async () => {
            const [devices, mdns] = await Promise.all([
                adb.devices().catch((e) => {
                    throw new Error('adb: ' + e.message);
                }),
                adb.mdnsServices().catch(() => []),
            ]);
            return { devices, mdns };
        },
        'POST /api/pair': async (body) => {
            const address = String(body.address || '').trim();
            const code = String(body.code || '').trim();
            if (!/^[\w.\-:\[\]]+:\d+$/.test(address) || !/^\d{6}$/.test(code)) {
                throw new Error('Unesi adresu (IP:port) i 6-cifreni kod');
            }
            log('Uparivanje sa ' + address);
            const output = await adb.pair(address, code);
            return { output };
        },
        'POST /api/connect': async (body) => {
            const address = String(body.address || '').trim();
            if (!/^[\w.\-:\[\]]+(:\d+)?$/.test(address)) {
                throw new Error('Neispravna adresa');
            }
            log('Povezivanje sa ' + address);
            const output = await adb.connect(address);
            const config = storage.loadConfig();
            config.lastAddress = address;
            storage.saveConfig(config);
            return { output };
        },
        'POST /api/disconnect': async (body) => ({ output: await adb.disconnect(body.address ? String(body.address) : '') }),
        'GET /api/sessions': async () => ({ sessions: sessions.list() }),
        'POST /api/session/start': async (body) => {
            const serial = String(body.serial || '');
            if (!serial) {
                throw new Error('Nije izabran uređaj');
            }
            const config = storage.loadConfig();
            const options = Object.assign({}, config.session, body.options || {});
            const session = await sessions.start(serial, options);
            config.lastDevice = serial;
            config.session = session.options;
            storage.saveConfig(config);
            return { session: session.describe() };
        },
        'POST /api/session/stop': async (body) => {
            await sessions.stop(String(body.id || ''));
            return { ok: true };
        },
        'GET /api/session/logs': async (body, url) => {
            const session = sessions.get(url.searchParams.get('id') || '');
            return { logs: session ? session.logs : [], server: serverLogs };
        },
        'GET /api/apps': async (body, url) => {
            const serial = url.searchParams.get('serial');
            if (!serial) {
                throw new Error('Nije izabran uređaj');
            }
            return { apps: await apps.listApps(adb, serial, { refresh: url.searchParams.get('refresh') === '1' }) };
        },
        'POST /api/apps/launch': async (body) => {
            const serial = String(body.serial || '');
            const target = String(body.target || '');
            const output = await apps.launchApp(adb, serial, target, body.displayId | 0);
            return { output };
        },
        'GET /api/config': async () => storage.loadConfig(),
        'PUT /api/config': async (body) => {
            const config = Object.assign(storage.loadConfig(), body || {});
            storage.saveConfig(config);
            return config;
        },
        'GET /api/profiles': async () => ({ profiles: storage.listProfiles(), presets: storage.listPresets() }),
    };

    async function handleApi(req, res, url) {
        // Protection against other web pages trying to control the phone through this local server
        if (!isAllowedOrigin(req.headers.origin)) {
            sendJson(res, 403, { error: 'Forbidden origin' });
            return;
        }
        if (req.method !== 'GET' && !String(req.headers['content-type'] || '').includes('application/json')) {
            sendJson(res, 415, { error: 'JSON required' });
            return;
        }
        try {
            const body = req.method === 'GET' ? {} : await readBody(req);
            const profileMatch = /^\/api\/profiles\/(.+)$/.exec(url.pathname);
            if (profileMatch) {
                const pkg = decodeURIComponent(profileMatch[1]);
                if (req.method === 'GET') {
                    const profile = storage.getProfile(pkg);
                    sendJson(res, profile ? 200 : 404, profile || { error: 'Nema profila' });
                } else if (req.method === 'PUT') {
                    sendJson(res, 200, storage.saveProfile(pkg, body));
                } else if (req.method === 'DELETE') {
                    sendJson(res, 200, { ok: storage.deleteProfile(pkg) });
                } else {
                    sendJson(res, 405, { error: 'Method not allowed' });
                }
                return;
            }
            const handler = routes[req.method + ' ' + url.pathname];
            if (!handler) {
                sendJson(res, 404, { error: 'Not found' });
                return;
            }
            sendJson(res, 200, await handler(body, url));
        } catch (e) {
            sendJson(res, 500, { error: e.message || String(e) });
        }
    }

    const server = http.createServer((req, res) => {
        if (!isLocalHost(req.headers.host)) {
            res.writeHead(403);
            res.end('Forbidden host');
            return;
        }
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname.startsWith('/api/')) {
            handleApi(req, res, url);
        } else if (req.method === 'GET' || req.method === 'HEAD') {
            serveStatic(req, res, url.pathname);
        } else {
            res.writeHead(405);
            res.end();
        }
    });

    const wss = new WebSocket.Server({ noServer: true, perMessageDeflate: false });
    server.on('upgrade', (req, socket, head) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname !== '/ws' || !isLocalHost(req.headers.host) || !isAllowedOrigin(req.headers.origin)) {
            socket.destroy();
            return;
        }
        const session = sessions.get(url.searchParams.get('session') || '');
        wss.handleUpgrade(req, socket, head, (ws) => {
            if (!session || session.state !== 'running') {
                ws.close(4004, 'no-session');
                return;
            }
            ws.on('error', () => {});
            session.addViewer(ws);
        });
    });

    let actualPort = null;
    for (let p = port; p < port + 20; ++p) {
        try {
            actualPort = await listen(server, p, host);
            break;
        } catch (e) {
            if (e.code !== 'EADDRINUSE') {
                throw e;
            }
        }
    }
    if (!actualPort) {
        throw new Error('Nema slobodnog porta od ' + port);
    }

    const url = 'http://localhost:' + actualPort;
    if (!quiet) {
        console.log('==================================================');
        console.log(' Wi-Dex ' + APP_VERSION + ' je pokrenut');
        console.log(' Otvori u Chrome/Edge: ' + url);
        console.log(' adb: ' + adb.path);
        console.log(' Podaci: ' + storage.DATA_DIR);
        console.log(' Za izlaz pritisni Ctrl+C');
        console.log('==================================================');
    }
    if (open) {
        openBrowser(url);
    }

    const shutdown = async () => {
        await sessions.stopAll();
        server.close();
    };

    return { server, port: actualPort, url, sessions, adb, shutdown };
}

/**
 * Return the info of a Wi-Dex server already running on this port (e.g. the Windows app), or null.
 */
function findRunningServer(port) {
    return new Promise((resolve) => {
        const req = http.get({ host: '127.0.0.1', port, path: '/api/info', timeout: 1500 }, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                try {
                    const info = JSON.parse(body);
                    resolve(info && info.serverVersion ? info : null);
                } catch (e) {
                    resolve(null);
                }
            });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => {
            req.destroy();
            resolve(null);
        });
    });
}

module.exports = { startServer, findRunningServer };

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const running = await findRunningServer(args.port);
    if (running) {
        // one server per PC: reuse it (two servers would both drive the same phone)
        const url = 'http://localhost:' + args.port;
        console.log('Wi-Dex već radi na ' + url + ' (možda kao Windows aplikacija).');
        if (args.open) {
            openBrowser(url);
        }
        return;
    }
    startServer({ port: args.port, open: args.open }).then((instance) => {
        let stopping = false;
        const stop = async () => {
            if (stopping) {
                process.exit(0);
            }
            stopping = true;
            console.log('Zaustavljam...');
            await instance.shutdown();
            process.exit(0);
        };
        process.on('SIGINT', stop);
        process.on('SIGTERM', stop);
    }).catch((e) => {
        console.error('Greška: ' + e.message);
        process.exit(1);
    });
}

if (require.main === module) {
    main();
}
