const test = require('node:test');
const assert = require('node:assert/strict');
const { isNewer } = require('../lib/version');

test('isNewer compares release tags with the app version', () => {
    assert.equal(isNewer('v2.0.2', '2.0.1'), true);
    assert.equal(isNewer('v2.0.10', '2.0.9'), true);
    assert.equal(isNewer('v3.0.0', '2.9.9'), true);
    assert.equal(isNewer('v2.0.1', '2.0.1'), false);
    assert.equal(isNewer('v2.0.0', '2.0.1'), false);
});
