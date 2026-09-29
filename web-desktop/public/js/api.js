/**
 * Calls to the local Wi-Dex server (server.js).
 */

async function request(method, url, body) {
    const options = { method, headers: {} };
    if (body !== undefined) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }
    let response;
    try {
        response = await fetch(url, options);
    } catch (e) {
        throw new Error('Wi-Dex server ne radi (pokreni start.bat)');
    }
    let data = null;
    try {
        data = await response.json();
    } catch (e) {
        // no JSON
    }
    if (!response.ok) {
        throw new Error((data && data.error) || ('HTTP ' + response.status));
    }
    return data;
}

export const api = {
    get: (url) => request('GET', url),
    post: (url, body = {}) => request('POST', url, body),
    put: (url, body = {}) => request('PUT', url, body),
    del: (url) => request('DELETE', url),

    info: () => request('GET', '/api/info'),
    devices: () => request('GET', '/api/devices'),
    pair: (address, code) => request('POST', '/api/pair', { address, code }),
    connect: (address) => request('POST', '/api/connect', { address }),
    disconnect: (address) => request('POST', '/api/disconnect', { address }),
    sessions: () => request('GET', '/api/sessions'),
    startSession: (serial, options) => request('POST', '/api/session/start', { serial, options }),
    stopSession: (id) => request('POST', '/api/session/stop', { id }),
    sessionLogs: (id) => request('GET', '/api/session/logs?id=' + encodeURIComponent(id || '')),
    apps: (serial, refresh) => request('GET', '/api/apps?serial=' + encodeURIComponent(serial) + (refresh ? '&refresh=1' : '')),
    launchApp: (serial, target, displayId) => request('POST', '/api/apps/launch', { serial, target, displayId }),
    config: () => request('GET', '/api/config'),
    saveConfig: (config) => request('PUT', '/api/config', config),
    profiles: () => request('GET', '/api/profiles'),
    profile: async (pkg) => {
        try {
            return await request('GET', '/api/profiles/' + encodeURIComponent(pkg));
        } catch (e) {
            return null;
        }
    },
    saveProfile: (pkg, profile) => request('PUT', '/api/profiles/' + encodeURIComponent(pkg), profile),
    deleteProfile: (pkg) => request('DELETE', '/api/profiles/' + encodeURIComponent(pkg)),
};
