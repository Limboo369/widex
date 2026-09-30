'use strict';

// "v2.0.10" is newer than "2.0.9"; pre-release suffixes are ignored
function isNewer(latest, current) {
    const parse = (v) => String(v).replace(/^v/, '').split(/[.-]/).slice(0, 3).map((n) => parseInt(n, 10) || 0);
    const a = parse(latest);
    const b = parse(current);
    for (let k = 0; k < 3; k++) {
        if ((a[k] || 0) !== (b[k] || 0)) {
            return (a[k] || 0) > (b[k] || 0);
        }
    }
    return false;
}

module.exports = { isNewer };
