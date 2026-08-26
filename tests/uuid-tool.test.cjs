'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  uuidFromBytes,
  generateUuid,
  generateUuids,
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
  assert.throws(() => generateUuids(0, { cryptoApi }), /1.*100/);
  assert.throws(() => generateUuids(101, { cryptoApi }), /1.*100/);
});
