'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCron, nextCronOccurrences, MAX_EXPRESSION_LENGTH, MAX_NEXT_COUNT } = require('../cron/cron-engine.js');

test('parses five-field numeric cron syntax with lists, ranges and steps', () => {
  const parsed = parseCron('*/15 9-17/2 1,15 * 1-5');
  assert.deepEqual([...parsed.minute.values].sort((a, b) => a - b), [0, 15, 30, 45]);
  assert.deepEqual([...parsed.hour.values].sort((a, b) => a - b), [9, 11, 13, 15, 17]);
  assert.deepEqual([...parsed.dayOfMonth.values].sort((a, b) => a - b), [1, 15]);
  assert.equal(parsed.dayOfWeek.values.size, 5);
});

test('allows positive step sizes larger than their field while emitting only in-range values', () => {
  const parsed = parseCron('*/100 0-23/30 * * *');
  assert.deepEqual([...parsed.minute.values], [0]);
  assert.deepEqual([...parsed.hour.values], [0]);
});

test('computes the next five UTC occurrences strictly after the start instant', () => {
  const results = nextCronOccurrences('*/20 9-10 * * *', { from: Date.parse('2026-09-30T09:20:00Z'), timeZone: 'UTC', count: 5 });
  assert.deepEqual(results.map(item => item.iso), [
    '2026-09-30T09:40:00.000Z', '2026-09-30T10:00:00.000Z', '2026-09-30T10:20:00.000Z', '2026-09-30T10:40:00.000Z', '2026-10-01T09:00:00.000Z',
  ]);
});

test('calculates schedule wall-clock times in a selected IANA timezone', () => {
  const results = nextCronOccurrences('0 9 * * 1-5', { from: Date.parse('2026-09-30T00:00:00Z'), timeZone: 'Asia/Singapore', count: 3 });
  assert.deepEqual(results.map(item => item.iso), ['2026-09-30T01:00:00.000Z', '2026-10-01T01:00:00.000Z', '2026-10-02T01:00:00.000Z']);
});

test('uses cron day-of-month/day-of-week OR semantics when both are restricted', () => {
  const results = nextCronOccurrences('0 0 1 * 1', { from: Date.parse('2026-09-01T00:00:00Z'), timeZone: 'UTC', count: 4 });
  assert.deepEqual(results.map(item => item.iso), [
    '2026-09-07T00:00:00.000Z', '2026-09-14T00:00:00.000Z', '2026-09-21T00:00:00.000Z', '2026-09-28T00:00:00.000Z',
  ]);
});

test('treats a stepped wildcard field as constrained for day-field conjunction semantics', () => {
  const results = nextCronOccurrences('0 0 */2 * 1', { from: Date.parse('2026-09-30T00:00:00Z'), timeZone: 'UTC', count: 2 });
  assert.deepEqual(results.map(item => item.iso), ['2026-10-05T00:00:00.000Z', '2026-10-19T00:00:00.000Z']);
});

test('does not mark a day field as a wildcard when an asterisk appears later in a list', () => {
  const results = nextCronOccurrences('0 0 1,* * 1', { from: Date.parse('2026-09-30T00:00:00Z'), timeZone: 'UTC', count: 2 });
  assert.deepEqual(results.map(item => item.iso), ['2026-10-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z']);
});

test('skips nonexistent spring-forward wall minutes and returns both fall-back instants', () => {
  const gap = nextCronOccurrences('30 2 * * *', { from: Date.parse('2026-03-08T05:00:00Z'), timeZone: 'America/New_York', count: 1 });
  assert.equal(gap[0].iso, '2026-03-09T06:30:00.000Z');
  const overlap = nextCronOccurrences('30 1 * * *', { from: Date.parse('2026-11-01T04:00:00Z'), timeZone: 'America/New_York', count: 2 });
  assert.deepEqual(overlap.map(item => item.iso), ['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z']);
});

test('rejects macros, wrong field counts, invalid ranges, steps and timezones', () => {
  for (const expression of ['@daily', '* * * *', '* * * * * *', '60 * * * *', '5-1 * * * *', '*/0 * * * *', '5/2 * * * *', '1,,2 * * * *']) assert.throws(() => parseCron(expression));
  assert.throws(() => nextCronOccurrences('* * * * *', { from: 0, timeZone: 'Not/AZone' }), /timezone/i);
});

test('enforces raw expression and requested occurrence limits', () => {
  assert.throws(() => parseCron(' '.repeat(MAX_EXPRESSION_LENGTH + 1)), /200 characters/i);
  assert.throws(() => nextCronOccurrences('* * * * *', { from: 0, count: MAX_NEXT_COUNT + 1 }), /count/i);
});

test('reports syntactically valid schedules that have no date within the search horizon', () => {
  assert.throws(() => nextCronOccurrences('0 0 31 2 *', { from: Date.parse('2026-09-30T00:00:00Z'), timeZone: 'UTC', count: 1 }), /six-year search limit/i);
});

test('Cron pages expose localized controls, guide content, and local-only code', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  for (const [file, language] of [['cron/index.html', 'en'], ['zh/cron/index.html', 'zh-CN']]) {
    const html = read(file);
    assert.match(html, new RegExp(`<html lang="${language}"`));
    for (const id of ['cronExpression', 'cronTimezone', 'runCron', 'clearCron', 'cronStatus', 'cronFieldsBody', 'cronNextList']) assert.match(html, new RegExp(`id="${id}"`));
    assert.match(html, /\/cron\/cron-engine\.js/);
    assert.match(html, /\/cron\/cron-tool\.js/);
    assert.match(html, /data-related-tools="cron"/);
    assert.match(html, /class="local-processing-note"/);
    assert.match(html, /five numeric fields|五个数字字段/);
    assert.match(html, /daylight-saving|夏令时/);
    assert.match(html, /hreflang="en"/);
    assert.match(html, /hreflang="zh-CN"/);
  }
  const script = read('cron/cron-tool.js');
  assert.doesNotMatch(script, /\beval\s*\(|new Function|\.innerHTML\s*=|\.outerHTML\s*=|\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB/i);
  assert.match(script, /textContent/);
  const tools = require('../shared/tools-data.js');
  assert.equal(tools.findTool('cron').recordRecent, false);
  assert.deepEqual(tools.RELATED_TOOLS.cron, ['timestamp', 'regex', 'calculator']);
  const headerBlocks = read('_headers').split(/\n{2,}/u);
  for (const route of ['/cron/*', '/zh/cron/*']) {
    const block = headerBlocks.find(candidate => candidate.split('\n')[0] === route);
    assert.ok(block, `${route} is missing its route-specific CSP`);
    assert.match(block, /worker-src 'none'/);
    assert.doesNotMatch(block, /worker-src 'self'/);
  }
  const packageJson = require('../package.json');
  assert.match(packageJson.scripts['check:js'], /cron\/cron-engine\.js/);
});
