'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  hashText,
  hashBuffer,
  compareHash,
  validateFileSize,
  createLatestTaskRunner,
} = require('../hash/hash-tool.js');

test('computes the standard SHA-256 digest for text', async () => {
  assert.equal(
    await hashText('abc', 'SHA-256'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );
});

test('computes SHA-512 for an empty byte buffer', async () => {
  assert.equal(
    await hashBuffer(new Uint8Array(), 'SHA-512'),
    'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e'
  );
});

test('rejects unsupported algorithms', async () => {
  await assert.rejects(() => hashText('abc', 'MD5'), /algorithm/i);
});

test('compares hashes case-insensitively and ignores surrounding whitespace', () => {
  assert.equal(compareHash(' ABCD ', 'abcd'), true);
  assert.equal(compareHash('abcd', 'abce'), false);
});

test('limits buffered file hashing to 32 MiB', () => {
  assert.doesNotThrow(() => validateFileSize(32 * 1024 * 1024));
  assert.throws(() => validateFileSize(32 * 1024 * 1024 + 1), /32 MiB/);
});

test('ignores a stale async hash result when a newer task finishes first', async () => {
  const applied = [];
  let resolveSlow;
  const slow = new Promise(resolve => { resolveSlow = resolve; });
  const run = createLatestTaskRunner({ onSuccess: value => applied.push(value) });
  const first = run(() => slow);
  const second = run(async () => 'new');
  await second;
  resolveSlow('old');
  await first;
  assert.deepEqual(applied, ['new']);
});
