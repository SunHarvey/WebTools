'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  encodeBase64,
  decodeBase64,
  encodeUrl,
  decodeUrl,
} = require('../encode/encode-tool.js');

test('round-trips UTF-8 text through Base64', () => {
  const encoded = encodeBase64('Web工具 👋');
  assert.equal(encoded, 'V2Vi5bel5YW3IPCfkYs=');
  assert.equal(decodeBase64(encoded), 'Web工具 👋');
});

test('decodes Base64 with omitted padding and harmless whitespace', () => {
  assert.equal(decodeBase64(' V2Vi5bel5YW3IPCfkYs\n'), 'Web工具 👋');
});

test('rejects malformed Base64 instead of returning corrupted text', () => {
  assert.throws(() => decodeBase64('%%%not-base64%%%'), /Base64/i);
});

test('rejects Base64 with non-zero padding bits', () => {
  for (const input of ['Zh==', 'Zm9=', 'AB==']) {
    assert.throws(() => decodeBase64(input), /Base64/i);
  }
});

test('encodes URL components without leaving reserved separators', () => {
  assert.equal(encodeUrl('a=b & 你好'), 'a%3Db%20%26%20%E4%BD%A0%E5%A5%BD');
});

test('decodes URL components and rejects malformed escapes', () => {
  assert.equal(decodeUrl('a%3Db%20%26%20%E4%BD%A0%E5%A5%BD'), 'a=b & 你好');
  assert.throws(() => decodeUrl('%E0%A4%A'), /URI|encoded/i);
});
