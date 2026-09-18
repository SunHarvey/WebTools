'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  uuidFromBytes,
  generateUuid,
  generateUuids,
  generateUuidV7,
} = require('../uuid/uuid-tool.js');

test('sets RFC 4122 version 4 and variant bits', () => {
  assert.equal(uuidFromBytes(new Uint8Array(16)), '00000000-0000-4000-8000-000000000000');
});

test('uses cryptographically supplied random bytes', () => {
  const cryptoApi = { getRandomValues(bytes) { bytes.fill(0xff); return bytes; } };
  assert.equal(generateUuid({ cryptoApi }), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
});

test('supports uppercase and no-hyphen formatting', () => {
  const cryptoApi = { getRandomValues(bytes) { bytes.fill(0xab); return bytes; } };
  assert.equal(generateUuid({ cryptoApi, uppercase: true, hyphens: false }), 'ABABABABABAB4BABABABABABABABABAB');
});

test('generates a bounded batch', () => {
  let seed = 0;
  const cryptoApi = { getRandomValues(bytes) { bytes.fill(seed++); return bytes; } };
  const values = generateUuids(3, { cryptoApi });
  assert.equal(values.length, 3);
  assert.equal(new Set(values).size, 3);
  assert.throws(() => generateUuids(0, { cryptoApi }), /1.*1000/);
  assert.equal(generateUuids(1000, { cryptoApi }).length, 1000);
  assert.throws(() => generateUuids(1001, { cryptoApi }), /1.*1000/);
});

test('generates RFC 9562 UUID v7 with timestamp, version and variant bits', () => {
  const cryptoApi = { getRandomValues(bytes) { bytes.fill(0); return bytes; } };
  const value = generateUuidV7({ cryptoApi, timestamp: 1704067200123 });
  assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(value.slice(0, 13), '018cc251-f47b');
});

test('generates selected UUID versions in supported preset counts', () => {
  const cryptoApi = { getRandomValues(bytes) { bytes.fill(1); return bytes; } };
  assert.equal(generateUuids(10, { cryptoApi, version: 'v7', timestamp: 0 }).length, 10);
  assert.match(generateUuids(1, { cryptoApi, version: 'v7', timestamp: 0 })[0], /-7/);
});

test('UUID pages offer version, preset count, copy all and TXT download', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  for (const file of ['../uuid/index.html', '../zh/uuid/index.html']) {
    const html = fs.readFileSync(path.join(__dirname, file), 'utf8');
    assert.match(html, /id="uuidVersion"/);
    for (const count of [1, 10, 100, 1000]) assert.match(html, new RegExp(`<option value="${count}"`));
    assert.match(html, /id="copyUuid"/);
    assert.match(html, /id="downloadUuid"/);
  }
});
