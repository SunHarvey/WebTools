'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseUnixTimestamp,
  dateToUnix,
  formatInTimezone,
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

test('preserves exact integer microseconds and nanoseconds with BigInt', () => {
  const micros = parseUnixTimestamp('1704067200123456', 'microseconds');
  assert.equal(micros.microseconds, '1704067200123456');
  assert.equal(micros.nanoseconds, '1704067200123456000');
  assert.equal(micros.milliseconds, 1704067200123);
  const nanos = parseUnixTimestamp('1704067200123456789', 'nanoseconds');
  assert.equal(nanos.microseconds, '1704067200123456');
  assert.equal(nanos.nanoseconds, '1704067200123456789');
  assert.equal(nanos.iso, '2024-01-01T00:00:00.123Z');
  assert.throws(() => parseUnixTimestamp('1.5', 'nanoseconds'), /integer/i);
});

test('formats a timestamp in a selected Intl timezone', () => {
  const utc = formatInTimezone(0, 'UTC', 'en-GB');
  const tokyo = formatInTimezone(0, 'Asia/Tokyo', 'en-GB');
  assert.match(utc, /00:00:00/);
  assert.match(tokyo, /09:00:00/);
  assert.throws(() => formatInTimezone(0, 'Mars/Olympus'), /timezone/i);
});

test('timestamp pages expose timezone and precision selectors', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  for (const file of ['../timestamp/index.html', '../zh/timestamp/index.html']) {
    const html = fs.readFileSync(path.join(__dirname, file), 'utf8');
    assert.match(html, /id="timezoneSelect"/);
    assert.match(html, /value="microseconds"/);
    assert.match(html, /value="nanoseconds"/);
    assert.match(html, /id="resultMicroseconds"/);
    assert.match(html, /id="resultNanoseconds"/);
  }
});

test('timezone changes retain the exact sub-millisecond result', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../timestamp/timestamp-tool.js'), 'utf8');
  assert.match(source, /let currentResult/);
  assert.match(source, /if \(currentResult\) render\(currentResult\)/);
  assert.doesNotMatch(source, /resultFromMilliseconds\(Number\(value\)\)/);
});
