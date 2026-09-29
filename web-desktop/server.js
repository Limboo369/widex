const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Return server LAN IP for easy mobile setup
app.get('/api/info', (req, res) => {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const devName in interfaces) {
        const iface = interfaces[devName];
        for (let i = 0; i < iface.length; i++) {
            const alias = iface[i];
            if (alias.family === 'IPv4' && !alias.internal) {
                ips.push(alias.address);
            }
        }
    }
    res.json({
        appName: "Wi-Dex Universal Desktop",
        version: "1.0.0",
        localIps: ips,
        port: PORT
    });
});

// WebSocket Connection handling (Proxy between Web Desktop and Android Phone if needed)
let activePhoneSocket = null;
const clientSockets = new Set();

wss.on('connection', (ws, req) => {
    const isPhone = req.url.includes('role=phone');
    
    if (isPhone) {
        console.log('[Wi-Dex] Android Phone Host connected over WebSocket!');
        activePhoneSocket = ws;
        
        // Broadcast phone status to desktop clients
        clientSockets.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'STATUS', phoneConnected: true }));
            }
        });

        ws.on('message', (message) => {
            // Forward screen binary data / app list / stats to all connected web desktop clients
            clientSockets.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(message);
                }
            });
        });

        ws.on('close', () => {
            console.log('[Wi-Dex] Android Phone Host disconnected.');
            activePhoneSocket = null;
            clientSockets.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'STATUS', phoneConnected: false }));
                }
            });
        });

    } else {
        console.log('[Wi-Dex] Web Desktop Client connected.');
        clientSockets.add(ws);

        // Notify client about phone connection status
        ws.send(JSON.stringify({
            type: 'STATUS',
            phoneConnected: activePhoneSocket !== null && activePhoneSocket.readyState === WebSocket.OPEN
        }));

        ws.on('message', (message) => {
            // Forward input commands (mouse, keys, game controls, app launch) to Android phone
            if (activePhoneSocket && activePhoneSocket.readyState === WebSocket.OPEN) {
                activePhoneSocket.send(message);
            }
        });

        ws.on('close', () => {
            clientSockets.delete(ws);
        });
    }
});

server.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(` Wi-Dex Desktop Server Running!`);
    console.log(` Open in PC Browser: http://localhost:${PORT}`);
    console.log(`===================================================`);
});
