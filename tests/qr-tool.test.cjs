'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  normalizeQrOptions,
  buildWifiPayload,
  createQrMatrix,
  calculateQrLayout,
} = require('../qr/qr-tool.js');

test('normalizes QR rendering options', () => {
  assert.deepEqual(normalizeQrOptions({ size: '320', margin: '4', level: 'q', dark: '#000', light: '#fff' }), {
    size: 320,
    margin: 4,
    level: 'Q',
    dark: '#000000',
    light: '#ffffff',
  });
});

test('rejects invalid sizes, colors and correction levels', () => {
  assert.throws(() => normalizeQrOptions({ size: 64 }), /size/i);
  assert.throws(() => normalizeQrOptions({ size: 320, margin: 3 }), /margin/i);
  assert.doesNotThrow(() => normalizeQrOptions({ size: 320, margin: 16 }));
  assert.throws(() => normalizeQrOptions({ size: 320, level: 'X' }), /correction/i);
  assert.throws(() => normalizeQrOptions({ size: 320, dark: 'black' }), /color/i);
});

test('requires enough canvas pixels for the matrix and quiet zone', () => {
  assert.deepEqual(calculateQrLayout(21, 128, 4), {
    moduleSize: 4,
    drawnSize: 116,
    offset: 6,
  });
  assert.throws(() => calculateQrLayout(121, 128, 4), /too small/i);
});

test('QR page offers only standards-compliant quiet zones', () => {
  const html = fs.readFileSync(path.join(__dirname, '../qr/index.html'), 'utf8');
  const marginSelect = html.match(/<select id="qrMargin">([\s\S]*?)<\/select>/u)?.[1] || '';
  assert.doesNotMatch(marginSelect, /<option>2<\/option>/u);
});

test('builds an escaped Wi-Fi QR payload', () => {
  assert.equal(
    buildWifiPayload({ ssid: 'Cafe;"Guest', password: 'p:a,ss\\word', security: 'wpa', hidden: true }),
    'WIFI:T:WPA;S:Cafe\\;\\"Guest;P:p\\:a\\,ss\\\\word;H:true;;',
  );
});

test('preserves meaningful leading and trailing spaces in a Wi-Fi SSID', () => {
  assert.equal(
    buildWifiPayload({ ssid: ' Office ', security: 'nopass' }),
    'WIFI:T:nopass;S: Office ;P:;H:false;;',
  );
  assert.throws(() => buildWifiPayload({ ssid: ' \t ' }), /network name/i);
});

test('creates a square QR matrix using the vendored generator', () => {
  const result = createQrMatrix('https://genpass.top', 'M');
  assert.ok(result.size >= 21);
  assert.equal(result.modules.length, result.size);
  assert.ok(result.modules.every(row => row.length === result.size));
  assert.ok(result.modules.flat().some(Boolean));
});

test('rejects empty and excessively large payloads', () => {
  assert.throws(() => createQrMatrix('   ', 'M'), /content/i);
  assert.throws(() => createQrMatrix('x'.repeat(3000), 'H'), /large|capacity/i);
});
