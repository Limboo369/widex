/**
 * Wi-Dex Main Client Application Entry point
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Wi-Dex] Initializing Universal Desktop Environment...');

    const windowManager = new WindowManager();
    let ws = null;
    let phoneWs = null;
    let streamer = null;
    let inputMapper = null;
    let phoneDisplayWindow = null;

    // Start Menu Toggle
    const startBtn = document.getElementById('start-btn');
    const startMenu = document.getElementById('start-menu');

    startBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        startMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!startMenu.contains(e.target) && e.target !== startBtn) {
            startMenu.classList.add('hidden');
        }
    });

    // Clock update loop
    const clockEl = document.getElementById('clock');
    const updateClock = () => {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };
    updateClock();
    setInterval(updateClock, 1000);

    // Initialize Local PC Server Relay WebSocket
    function connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}?role=desktop`;
        
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('[Wi-Dex] Connected to Wi-Dex Local PC Relay.');
        };

        ws.onmessage = (event) => {
            if (typeof event.data === 'string') {
                try {
                    const data = JSON.parse(event.data);
                    handleServerMessage(data);
                } catch (e) {
                    console.error('Invalid JSON message', e);
                }
            } else if (event.data instanceof Blob) {
                if (streamer) {
                    streamer.renderFrame(event.data);
                }
            }
        };

        ws.onclose = () => {
            setTimeout(connectWebSocket, 3000);
        };
    }

    // Direct WebSocket Connection to Android Phone IP
    function connectDirectPhone(phoneIp) {
        const cleanIp = phoneIp.trim().replace(/^https?:\/\//, '').replace(/:8080\/?$/, '');
        const directUrl = `ws://${cleanIp}:8080`;

        console.log(`[Wi-Dex] Attempting Direct Connection to Phone: ${directUrl}`);
        const statusEl = document.getElementById('device-ip-status');
        statusEl.textContent = `Connecting to ${cleanIp}...`;
        statusEl.className = 'status-tag disconnected';

        if (phoneWs) {
            phoneWs.close();
        }

        try {
            phoneWs = new WebSocket(directUrl);
            phoneWs.binaryType = 'arraybuffer';

            phoneWs.onopen = () => {
                console.log(`[Wi-Dex] Direct Phone WebSocket Connected! (${cleanIp}:8080)`);
                statusEl.textContent = `Connected (${cleanIp})`;
                statusEl.className = 'status-tag connected';
                
                openPhoneMirrorWindow();
                if (streamer) {
                    streamer.stopDemoFeed();
                    streamer.isConnected = true;
                }
            };

            phoneWs.onmessage = (event) => {
                if (typeof event.data === 'string') {
                    try {
                        const data = JSON.parse(event.data);
                        handleServerMessage(data);
                    } catch (e) {}
                } else {
                    if (streamer) streamer.renderFrame(event.data);
                }
            };

            phoneWs.onerror = (err) => {
                console.error('[Wi-Dex] Direct Phone WebSocket Error:', err);
                alert(`Could not connect to ${cleanIp}:8080. Ensure Wi-Dex Host is RUNNING on your phone and both devices are on the same Wi-Fi.`);
                statusEl.textContent = 'Connection Failed';
                statusEl.className = 'status-tag disconnected';
            };

            phoneWs.onclose = () => {
                console.log('[Wi-Dex] Direct Phone Connection closed.');
            };

        } catch (e) {
            console.error('Failed to connect to direct phone WebSocket', e);
        }
    }

    function sendWebSocketMessage(msgString) {
        if (phoneWs && phoneWs.readyState === WebSocket.OPEN) {
            phoneWs.send(msgString);
        } else if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(msgString);
        }
    }

    function handleServerMessage(data) {
        if (data.type === 'STATUS') {
            const statusEl = document.getElementById('device-ip-status');
            if (data.phoneConnected) {
                statusEl.textContent = 'Android Device Online';
                statusEl.className = 'status-tag connected';
                if (streamer) streamer.stopDemoFeed();
            }
        } else if (data.type === 'PHONE_STATS') {
            document.getElementById('battery-text').textContent = `${data.batteryLevel || 85}%`;
            document.getElementById('ping-text').textContent = `${data.ping || 12} ms`;
        } else if (data.type === 'APP_LIST') {
            renderAppGrid(data.apps);
        }
    }

    // Launch Phone Mirror Window
    function openPhoneMirrorWindow() {
        if (phoneDisplayWindow && document.getElementById('win-phone-mirror')) {
            windowManager.focusWindow('phone-mirror');
            return;
        }

        const bodyContainer = document.createElement('div');
        bodyContainer.className = 'stream-container';
        bodyContainer.innerHTML = `
            <div class="stream-toolbar">
                <span class="stream-stat" id="stat-fps">60 FPS</span>
                <span class="stream-stat" id="stat-res">1080p</span>
                <span class="stream-stat" id="stat-latency">8ms</span>
                <button class="btn btn-secondary btn-sm" id="btn-toggle-game">🎮 Game Mode</button>
            </div>
            <canvas id="phone-stream-canvas"></canvas>
        `;

        phoneDisplayWindow = windowManager.createWindow({
            id: 'phone-mirror',
            title: 'Android Host Display (Screen Off Mode Active)',
            icon: '📱',
            width: 1080,
            height: 640,
            contentElement: bodyContainer
        });

        const canvas = bodyContainer.querySelector('#phone-stream-canvas');
        streamer = new PhoneStreamer(canvas);
        inputMapper = new InputMapper(canvas, sendWebSocketMessage);

        streamer.onFpsUpdate = (stats) => {
            const fpsEl = bodyContainer.querySelector('#stat-fps');
            if (fpsEl) fpsEl.textContent = `${stats.fps} FPS`;
        };

        // Start demo canvas animation until real Android phone connects
        if (!phoneWs || phoneWs.readyState !== WebSocket.OPEN) {
            streamer.startDemoFeed();
        }

        // Toggle Game Mode listener inside window toolbar
        const gameModeBtn = bodyContainer.querySelector('#btn-toggle-game');
        gameModeBtn.addEventListener('click', () => {
            const isEnabled = inputMapper.toggleGameMode();
            gameModeBtn.textContent = isEnabled ? '🎮 Game Mode (ACTIVE)' : '🎮 Game Mode';
            gameModeBtn.className = isEnabled ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
            document.getElementById('game-mode-badge').textContent = isEnabled ? 'ON' : 'OFF';
        });
    }

    // Initialize Default Desktop Icons
    document.getElementById('icon-phone-mirror').addEventListener('click', openPhoneMirrorWindow);
    document.getElementById('icon-game-mode').addEventListener('click', () => {
        openPhoneMirrorWindow();
        if (inputMapper) {
            inputMapper.toggleGameMode(true);
        }
    });

    document.getElementById('icon-apps').addEventListener('click', () => {
        startMenu.classList.remove('hidden');
    });

    document.getElementById('icon-settings').addEventListener('click', () => {
        const settingsContent = document.createElement('div');
        settingsContent.style.padding = '20px';
        settingsContent.innerHTML = `
            <h3>Wi-Dex LAN Settings</h3>
            <p style="color:#9ca3af; margin-top:8px; font-size:14px;">Connect directly to your Android device running Wi-Dex Host server on port 8080.</p>
            
            <div style="margin-top:20px; display:flex; flex-direction:column; gap:12px;">
                <label style="font-size:13px;">Android Phone IP Address:</label>
                <input type="text" id="phone-ip-input" value="192.168.100.126" placeholder="e.g. 192.168.100.126" style="padding:10px; border-radius:8px; border:1px solid #334155; background:#0f172a; color:#fff;">
                
                <label style="font-size:13px; margin-top:10px;">Stream Quality Bitrate:</label>
                <select id="bitrate-select" style="padding:10px; border-radius:8px; border:1px solid #334155; background:#0f172a; color:#fff;">
                    <option value="25">Ultra High (25 Mbps - Low Latency LAN)</option>
                    <option value="15" selected>Balanced (15 Mbps)</option>
                    <option value="8">Battery Saver (8 Mbps)</option>
                </select>

                <button id="btn-save-settings" class="btn btn-primary" style="margin-top:15px;">Connect to Phone</button>
            </div>
        `;

        const win = windowManager.createWindow({
            id: 'settings',
            title: 'Connection & Quality Settings',
            icon: '⚙️',
            width: 480,
            height: 380,
            contentElement: settingsContent
        });

        settingsContent.querySelector('#btn-save-settings').addEventListener('click', () => {
            const ip = settingsContent.querySelector('#phone-ip-input').value;
            if (ip) {
                windowManager.closeWindow('settings');
                connectDirectPhone(ip);
            }
        });
    });

    // Populate Sample Apps
    function renderAppGrid(apps) {
        const appGrid = document.getElementById('app-grid');
        appGrid.innerHTML = '';

        const defaultApps = apps || [
            { name: 'Google Chrome', icon: '🌐', pkg: 'com.android.chrome' },
            { name: 'PUBG Mobile', icon: '🔫', pkg: 'com.tencent.ig' },
            { name: 'Call of Duty', icon: '🎯', pkg: 'com.activision.callofduty.shooter' },
            { name: 'YouTube', icon: '▶️', pkg: 'com.google.android.youtube' },
            { name: 'Genshin Impact', icon: '⚔️', pkg: 'com.miHoYo.GenshinImpact' },
            { name: 'Gallery', icon: '🖼️', pkg: 'com.android.gallery3d' },
            { name: 'Files', icon: '📁', pkg: 'com.android.documentsui' },
            { name: 'Settings', icon: '⚙️', pkg: 'com.android.settings' }
        ];

        defaultApps.forEach(app => {
            const card = document.createElement('div');
            card.className = 'app-card';
            card.innerHTML = `
                <div class="profile-avatar" style="width:40px; height:40px; font-size:20px; margin-bottom:6px;">${app.icon}</div>
                <span>${app.name}</span>
            `;
            card.addEventListener('click', () => {
                sendWebSocketMessage(JSON.stringify({ type: 'LAUNCH_APP', packageName: app.pkg }));
                startMenu.classList.add('hidden');
                openPhoneMirrorWindow();
            });
            appGrid.appendChild(card);
        });
    }

    renderAppGrid();
    connectWebSocket();
    openPhoneMirrorWindow();
});
