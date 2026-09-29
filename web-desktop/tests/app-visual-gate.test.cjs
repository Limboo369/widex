const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/js/ui/app-visual-gate.js'), 'utf8');
const modulePromise = import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('old frames cannot reveal a new app; a fresh frame after target confirmation can', async () => {
    const { AppVisualGate } = await modulePromise;
    let requests = 0, ready = false;
    const gate = new AppVisualGate('target', () => requests++, { settleMs: 0, timeoutMs: 500 });
    const completion = gate.promise.then(() => { ready = true; });
    gate.onFrame();
    gate.onForeground('old');
    gate.onFrame();
    assert.equal(ready, false);
    gate.onForeground('target');
    gate.onFrame();
    assert.equal(ready, false);
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(requests, 1);
    assert.equal(ready, false);
    gate.onFrame();
    await completion;
    assert.equal(ready, true);
});

test('a different foreground cancels frame readiness; timeout rejects instead of showing stale content', async () => {
    const { AppVisualGate } = await modulePromise;
    const gate = new AppVisualGate('target', () => {}, { settleMs: 0, timeoutMs: 25 });
    const rejected = assert.rejects(gate.promise, /Telefon još nije prikazao/);
    gate.onForeground('target');
    await new Promise(resolve => setTimeout(resolve, 5));
    gate.onForeground('old');
    gate.onFrame();
    await rejected;
});

test('disconnect cancels the wait and its frame request', async () => {
    const { AppVisualGate } = await modulePromise;
    let requests = 0;
    const gate = new AppVisualGate('target', () => requests++, { settleMs: 10, timeoutMs: 500 });
    const rejected = assert.rejects(gate.promise, /Veza je prekinuta/);
    gate.onForeground('target');
    gate.cancel();
    await rejected;
    assert.equal(requests, 0);
});
