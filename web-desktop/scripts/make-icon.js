#!/usr/bin/env node
/**
 * Generate the application icon (app/icon.png and app/icon.ico) without any dependency:
 * same drawing as public/img/icon.svg, rasterized with 4x4 supersampling.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 256;
const SCALE = SIZE / 64; // the SVG is 64x64
const SAMPLES = 4;

function insideRoundedRect(x, y, rx0, ry0, w, h, r) {
    if (x < rx0 || y < ry0 || x > rx0 + w || y > ry0 + h) {
        return false;
    }
    const cx = Math.min(Math.max(x, rx0 + r), rx0 + w - r);
    const cy = Math.min(Math.max(y, ry0 + r), ry0 + h - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function distanceToRoundedRectBorder(x, y, rx0, ry0, w, h, r) {
    // signed distance to a rounded rectangle (negative inside)
    const hx = w / 2 - r;
    const hy = h / 2 - r;
    const px = Math.abs(x - (rx0 + w / 2)) - hx;
    const py = Math.abs(y - (ry0 + h / 2)) - hy;
    const outside = Math.hypot(Math.max(px, 0), Math.max(py, 0));
    const inside = Math.min(Math.max(px, py), 0);
    return outside + inside - r;
}

function insidePolygon(x, y, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

const BOLT = [[34, 20], [26, 33], [32, 33], [29, 44], [38, 29], [32, 29]];

function render() {
    const pixels = Buffer.alloc(SIZE * SIZE * 4);
    for (let py = 0; py < SIZE; ++py) {
        for (let px = 0; px < SIZE; ++px) {
            let r = 0;
            let g = 0;
            let b = 0;
            let a = 0;
            for (let sy = 0; sy < SAMPLES; ++sy) {
                for (let sx = 0; sx < SAMPLES; ++sx) {
                    const x = (px + (sx + 0.5) / SAMPLES) / SCALE;
                    const y = (py + (sy + 0.5) / SAMPLES) / SCALE;
                    if (!insideRoundedRect(x, y, 2, 2, 60, 60, 16)) {
                        continue;
                    }
                    // gradient #2563eb -> #06b6d4 along the diagonal
                    const t = Math.min(1, Math.max(0, (x + y - 4) / 120));
                    let cr = 0x25 + (0x06 - 0x25) * t;
                    let cg = 0x63 + (0xb6 - 0x63) * t;
                    let cb = 0xeb + (0xd4 - 0xeb) * t;
                    const phone = Math.abs(distanceToRoundedRectBorder(x, y, 21, 12, 22, 38, 5)) <= 1.75;
                    if (phone || insidePolygon(x, y, BOLT)) {
                        cr = 255;
                        cg = 255;
                        cb = 255;
                    }
                    r += cr;
                    g += cg;
                    b += cb;
                    a += 255;
                }
            }
            const n = SAMPLES * SAMPLES;
            const coverage = a / n;
            const offset = (py * SIZE + px) * 4;
            if (coverage > 0) {
                const covered = a / 255;
                pixels[offset] = Math.round(r / covered);
                pixels[offset + 1] = Math.round(g / covered);
                pixels[offset + 2] = Math.round(b / covered);
            }
            pixels[offset + 3] = Math.round(coverage);
        }
    }
    return pixels;
}

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; ++n) {
        let c = n;
        for (let k = 0; k < 8; ++k) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(buffer) {
    let c = 0xffffffff;
    for (const byte of buffer) {
        c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData));
    return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(pixels) {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(SIZE, 0);
    header.writeUInt32BE(SIZE, 4);
    header[8] = 8; // bit depth
    header[9] = 6; // RGBA
    const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
    for (let y = 0; y < SIZE; ++y) {
        raw[y * (SIZE * 4 + 1)] = 0; // no filter
        pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', header),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

function encodeIco(png) {
    // ICO with a single 256x256 PNG entry (supported since Windows Vista)
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2); // icon
    header.writeUInt16LE(1, 4); // one image
    const entry = Buffer.alloc(16);
    entry[0] = 0; // 256
    entry[1] = 0; // 256
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(6 + 16, 12);
    return Buffer.concat([header, entry, png]);
}

const outDir = path.join(__dirname, '..', 'app');
fs.mkdirSync(outDir, { recursive: true });
const png = encodePng(render());
fs.writeFileSync(path.join(outDir, 'icon.png'), png);
fs.writeFileSync(path.join(outDir, 'icon.ico'), encodeIco(png));
console.log('icon.png (' + png.length + ' bytes) and icon.ico written to ' + outDir);
