const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/js/ui/phone-taskbar.js'), 'utf8');
const first = { package: 'com.example.first', component: 'com.example.first/.Main', label: 'Prva' };
const second = { package: 'com.example.second', label: 'Druga' };

async function setup(storage = new Map()) {
    const calls = [], notices = [];
    let responder = async () => ({});
    const context = vm.createContext({ document: { getElementById: () => ({ dataset: {} }) }, localStorage: {
        getItem: key => storage.get(key) || null,
        setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key),
    } });
    const h = (tag, attrs, ...children) => {
        if (!attrs || typeof attrs !== 'object' || attrs.tag) { children.unshift(attrs); attrs = {}; }
        return { tag, attrs, children, dataset: attrs.dataset, classList: { values: new Set(), toggle(name, on) { if (on) this.values.add(name); else this.values.delete(name); } } };
    };
    const dependencies = {
        '../util/dom.js': { h, toast: (...args) => notices.push(args) },
        '../api.js': { api: { launchApp: (...args) => { calls.push(args); return responder(...args); } } },
        './icons.js': { icon: name => ({ tag: 'svg', name }) },
        './app-visual-gate.js': { AppVisualGate: class {} },
    };
    const module = new vm.SourceTextModule(source, { context });
    await module.link(async name => {
        const values = dependencies[name];
        return new vm.SyntheticModule(Object.keys(values), function () {
            for (const [key, value] of Object.entries(values)) this.setExport(key, value);
        }, { context });
    });
    await module.evaluate();
    const container = { children: [], replaceChildren() { this.children = []; }, appendChild(child) { this.children.push(child); } };
    const phone = { minimized: false };
    const app = {
        session: { id: 'session-a', serial: 'phone-a', state: 'running', options: {} },
        videoDisplayId: 7, foreground: null, openCount: 0,
        appsMenu: { apps: [first, second] },
        foregroundPackage() { return this.foreground; },
        async waitForAppVisual(pkg) { this.foreground = pkg; },
        openPhone() { this.openCount++; phone.minimized = false; this.windows.active = 'phone'; this.windows.updateTaskbar(); },
        windows: { active: 'phone', get: () => phone,
            minimize() { phone.minimized = true; this.active = null; this.updateTaskbar(); },
            updateTaskbar() { this.onTaskbarUpdate?.(); } },
    };
    const dock = new module.namespace.PhoneTaskbar(app, container);
    app.windows.onTaskbarUpdate = () => dock.render();
    dock.attach(app.session);
    return { dock, app, container, calls, notices, phone, storage, respond: fn => responder = fn };
}

test('two successful launches make separate entries; switching reuses the original target and display', async () => {
    const s = await setup();
    s.app.session.options.newDisplay = '1920x1080';
    assert.equal(await s.dock.launch(first), true);
    assert.equal(await s.dock.launch(second), true);
    assert.equal(s.container.children.length, 2);
    assert.equal(s.app.windows.hidePhoneTaskbarItem, true);
    await s.container.children[0].attrs.onclick();
    assert.deepEqual(s.calls[2], ['phone-a', first.component, 7]);
    assert.equal(s.dock.items.size, 2);
    assert.equal(s.app.openCount, 3);
});

test('active state follows Android foreground and phone window focus/minimization', async () => {
    const s = await setup();
    await s.dock.launch(first);
    s.app.foreground = first.package;
    s.dock.onForeground(first.package);
    assert.equal(s.container.children[0].attrs['aria-pressed'], 'true');
    s.phone.minimized = true;
    s.dock.render();
    assert.equal(s.container.children[0].attrs['aria-pressed'], 'false');
    await s.container.children[0].attrs.onclick();
    assert.equal(s.phone.minimized, false);
    s.app.windows.active = 'settings';
    s.dock.render();
    assert.equal(s.container.children[0].attrs['aria-pressed'], 'false');
});

test('failed or disconnected launches do not add an entry', async () => {
    const s = await setup();
    s.respond(async () => { throw new Error('Unavailable'); });
    assert.equal(await s.dock.launch(first), false);
    assert.equal(s.dock.items.size, 0);
    assert.equal(s.app.openCount, 0);
    s.app.session = null;
    assert.equal(await s.dock.launch(first), false);
    assert.equal(s.calls.length, 1);
});

test('concurrent clicks are serialized, and an old launch cannot affect a new connection', async () => {
    const s = await setup();
    let complete;
    s.respond(() => new Promise(resolve => { complete = resolve; }));
    const launch = s.dock.launch(first);
    assert.equal(await s.dock.launch(second), false);
    s.dock.clear();
    s.app.session = { ...s.app.session, id: 'session-b', serial: 'phone-b' };
    s.dock.attach(s.app.session);
    complete({});
    assert.equal(await launch, false);
    assert.equal(s.dock.items.size, 0);
    assert.equal(s.app.openCount, 0);
});

test('refresh restores only the same phone session; disconnect clears persisted entries', async () => {
    const s = await setup();
    await s.dock.launch(first);
    const restored = await setup(s.storage);
    assert.equal(restored.dock.items.size, 1);
    restored.app.session = { ...restored.app.session, id: 'session-b' };
    restored.dock.attach(restored.app.session);
    assert.equal(restored.dock.items.size, 0);
    s.dock.clear();
    assert.equal(s.container.children.length, 0);
    assert.equal(s.storage.has('widex.phoneApps'), false);
    assert.equal(s.app.windows.hidePhoneTaskbarItem, false);
});

test('foreground apps are deduplicated and system surfaces are excluded unless explicitly opened', async () => {
    const s = await setup();
    const system = { package: 'com.android.settings', label: 'Podešavanja telefona', system: true };
    s.app.appsMenu.apps.push(system);
    s.dock.onForeground(system.package);
    assert.equal(s.dock.items.size, 0);
    s.dock.onForeground(first.package);
    s.dock.onForeground(first.package);
    assert.equal(s.dock.items.size, 1);
    await s.dock.launch(system);
    assert.equal(s.dock.items.size, 2);
});

test('switch collapses the old window before launching, then restores from the new card', async () => {
    const s = await setup();
    s.app.foreground = first.package;
    s.dock.remember(first);
    const order = [];
    s.app.windows.animateDock = async (id, target, opening) => {
        order.push(opening ? 'expand' : 'collapse');
        if (!opening) s.phone.minimized = true;
        return true;
    };
    s.respond(async () => { order.push('launch'); return {}; });
    assert.equal(await s.dock.launch(second), true);
    assert.deepEqual(order, ['collapse', 'launch', 'expand']);
    assert.equal(s.phone.minimized, false);
    s.app.foreground = second.package;
    order.length = 0;
    await s.dock.launch(second);
    assert.deepEqual(order, []);
});

test('a failed app switch restores the previous window and clears the busy state', async () => {
    const s = await setup();
    s.app.foreground = first.package;
    s.dock.remember(first);
    const order = [];
    s.app.windows.animateDock = async (id, target, opening) => {
        order.push(opening ? 'restore' : 'collapse');
        if (!opening) s.phone.minimized = true;
        return true;
    };
    s.respond(async () => { throw new Error('Unavailable'); });
    assert.equal(await s.dock.launch(second), false);
    assert.deepEqual(order, ['collapse', 'restore']);
    assert.equal(s.phone.minimized, false);
    assert.equal(s.dock.pending, null);
    assert.equal(s.dock.items.size, 1);
});

test('a dock click on the active app minimizes without relaunching; the next click restores', async () => {
    const s = await setup();
    await s.dock.launch(first);
    const callsBefore = s.calls.length;
    await s.container.children[0].attrs.onclick();
    assert.equal(s.phone.minimized, true);
    assert.equal(s.calls.length, callsBefore);
    await s.container.children[0].attrs.onclick();
    assert.equal(s.phone.minimized, false);
    assert.equal(s.calls.length, callsBefore);
});

test('the window remains minimized until the new app visual is ready', async () => {
    const s = await setup();
    s.app.foreground = first.package;
    s.dock.remember(first);
    s.app.windows.animateDock = async (id, target, opening) => {
        if (!opening) s.app.windows.minimize(id);
        return true;
    };
    let reveal;
    s.app.waitForAppVisual = () => new Promise(resolve => { reveal = resolve; });
    const pending = s.dock.launch(second);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(s.phone.minimized, true);
    assert.equal(s.app.openCount, 0);
    reveal();
    assert.equal(await pending, true);
    assert.equal(s.phone.minimized, false);
});

test('closing removes only the current app and foreground updates cannot add it back', async () => {
    const s = await setup();
    await s.dock.launch(first);
    await s.dock.launch(second);
    s.dock.closeCurrent();
    assert.equal(s.dock.items.has(first.package), true);
    assert.equal(s.dock.items.has(second.package), false);
    s.dock.onForeground(second.package);
    s.dock.refreshMetadata();
    assert.equal(s.dock.items.has(second.package), false);
    const restored = await setup(s.storage);
    restored.dock.onForeground(second.package);
    assert.equal(restored.dock.items.has(second.package), false);
    assert.equal(restored.dock.items.size, 1);
});

test('explicitly opening a closed app restores its dock entry', async () => {
    const s = await setup();
    await s.dock.launch(first);
    s.dock.closeCurrent();
    assert.equal(s.dock.items.size, 0);
    assert.equal(await s.dock.launch(first), true);
    assert.equal(s.dock.items.has(first.package), true);
    assert.equal(s.dock.closedPackages.has(first.package), false);
});

test('closing during a pending launch prevents delayed reopening', async () => {
    const s = await setup();
    await s.dock.launch(first);
    let complete;
    s.respond(() => new Promise(resolve => { complete = resolve; }));
    const launch = s.dock.launch(second);
    const openedBefore = s.app.openCount;
    s.dock.closeCurrent();
    complete({});
    assert.equal(await launch, false);
    assert.equal(s.app.openCount, openedBefore);
    assert.equal(s.dock.items.size, 0);
    assert.equal(s.dock.pending, null);
});
