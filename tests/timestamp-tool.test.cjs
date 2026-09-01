'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseUnixTimestamp,
  dateToUnix,
} = require('../timestamp/timestamp-tool.js');

test('auto-detects Unix seconds', () => {
  assert.deepEqual(parseUnixTimestamp('0'), {
    seconds: 0,
    milliseconds: 0,
    iso: '1970-01-01T00:00:00.000Z',
  });
  assert.equal(parseUnixTimestamp('1704067200').iso, '2024-01-01T00:00:00.000Z');
});

test('auto-detects Unix milliseconds', () => {
  const result = parseUnixTimestamp('1704067200123');
  assert.equal(result.seconds, 1704067200);
  assert.equal(result.milliseconds, 1704067200123);
  assert.equal(result.iso, '2024-01-01T00:00:00.123Z');
});

test('supports an explicit unit for ambiguous small millisecond values', () => {
  assert.deepEqual(parseUnixTimestamp('1000', 'milliseconds'), {
    seconds: 1,
    milliseconds: 1000,
    iso: '1970-01-01T00:00:01.000Z',
  });
  assert.equal(parseUnixTimestamp('1000', 'seconds').seconds, 1000);
});

test('normalizes fractional milliseconds to the integer used by Date', () => {
  assert.deepEqual(parseUnixTimestamp('0.0009', 'seconds'), {
    seconds: 0,
    milliseconds: 0,
    iso: '1970-01-01T00:00:00.000Z',
  });
});

test('normalizes negative fractions before flooring Unix seconds', () => {
  assert.deepEqual(parseUnixTimestamp('-0.999', 'milliseconds'), {
    seconds: 0,
    milliseconds: 0,
    iso: '1970-01-01T00:00:00.000Z',
  });
  assert.deepEqual(parseUnixTimestamp('-1', 'milliseconds'), {
    seconds: -1,
    milliseconds: -1,
    iso: '1969-12-31T23:59:59.999Z',
  });
  assert.deepEqual(parseUnixTimestamp('-0.0009', 'seconds'), {
    seconds: 0,
    milliseconds: 0,
    iso: '1970-01-01T00:00:00.000Z',
  });
  assert.equal(parseUnixTimestamp('-0.001', 'seconds').seconds, -1);
});

test('rejects empty, nonnumeric and out-of-range timestamps', () => {
  assert.throws(() => parseUnixTimestamp(''), /timestamp/i);
  assert.throws(() => parseUnixTimestamp('tomorrow'), /timestamp/i);
  assert.throws(() => parseUnixTimestamp('999999999999999999'), /range|date/i);
});

test('converts an ISO date to Unix seconds and milliseconds', () => {
  assert.deepEqual(dateToUnix('2024-01-01T00:00:00.000Z'), {
    seconds: 1704067200,
    milliseconds: 1704067200000,
    iso: '2024-01-01T00:00:00.000Z',
  });
});
