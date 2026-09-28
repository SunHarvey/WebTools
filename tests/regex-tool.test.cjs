'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

const {
  MAX_REGEX_CAPTURES,
  MAX_REGEX_MATCHES,
  MAX_REGEX_OUTPUT,
  MAX_REGEX_RESULT,
  MAX_REGEX_PATTERN,
  MAX_REGEX_REPLACEMENT,
  MAX_REGEX_TEXT,
  analyzeRegex,
} = require('../regex/regex-engine.js');

test('matches text with JavaScript flags and reports capture groups', () => {
  const result = analyzeRegex({
    pattern: '(?<word>[A-Za-z]+)-(\\d+)',
    text: 'item-42 and next-7',
    flags: 'g',
    replacement: '$<word>:$2',
  });

  assert.deepEqual(result.matches, [
    {
      value: 'item-42',
      index: 0,
      end: 7,
      captures: ['item', '42'],
      groups: { word: 'item' },
    },
    {
      value: 'next-7',
      index: 12,
      end: 18,
      captures: ['next', '7'],
      groups: { word: 'next' },
    },
  ]);
  assert.equal(result.replacement, 'item:42 and next:7');
  assert.equal(result.truncated, false);
});

test('bounds raw inputs, flags, capture groups, matches and replacement output', () => {
  assert.throws(() => analyzeRegex({ pattern: 'x'.repeat(MAX_REGEX_PATTERN + 1), text: '', flags: '' }), /pattern.*too large/i);
  assert.throws(() => analyzeRegex({ pattern: '', text: 'x'.repeat(MAX_REGEX_TEXT + 1), flags: '' }), /text.*too large/i);
  assert.throws(() => analyzeRegex({ pattern: '', text: '', flags: '', replacement: 'x'.repeat(MAX_REGEX_REPLACEMENT + 1) }), /replacement.*too large/i);
  assert.throws(() => analyzeRegex({ pattern: 'x', text: 'x', flags: 'gg' }), /flags/i);
  assert.throws(() => analyzeRegex({ pattern: 'x', text: 'x', flags: 'z' }), /flags/i);

  const tooManyCaptures = Array.from({ length: MAX_REGEX_CAPTURES + 1 }, () => '(a)').join('');
  for (const text of ['a'.repeat(MAX_REGEX_CAPTURES + 1), 'does-not-match', '']) {
    assert.throws(() => analyzeRegex({ pattern: tooManyCaptures, text, flags: '' }), /capture groups/i);
  }

  const capped = analyzeRegex({ pattern: 'a', text: 'a'.repeat(MAX_REGEX_MATCHES + 1), flags: 'g', replacement: 'b' });
  assert.equal(capped.matches.length, MAX_REGEX_MATCHES);
  assert.equal(capped.truncated, true);
  assert.equal(capped.replacement, null);

  const exactLimit = analyzeRegex({ pattern: 'a', text: 'a'.repeat(MAX_REGEX_MATCHES), flags: 'g', replacement: 'b' });
  assert.equal(exactLimit.matches.length, MAX_REGEX_MATCHES);
  assert.equal(exactLimit.truncated, false);
  assert.equal(exactLimit.replacement, 'b'.repeat(MAX_REGEX_MATCHES));

  assert.throws(() => analyzeRegex({
    pattern: 'a',
    text: 'a'.repeat(Math.floor(MAX_REGEX_OUTPUT / MAX_REGEX_REPLACEMENT) + 1),
    flags: 'g',
    replacement: 'x'.repeat(MAX_REGEX_REPLACEMENT),
  }), /replacement output.*too large/i);

  assert.throws(() => analyzeRegex({
    pattern: '(?=(.{100000}))',
    text: 'a'.repeat(MAX_REGEX_TEXT),
    flags: 'g',
  }), /result payload.*too large/i);
  assert.ok(MAX_REGEX_RESULT <= MAX_REGEX_OUTPUT);

  assert.throws(() => analyzeRegex({
    pattern: 'a',
    text: 'a'.repeat(MAX_REGEX_TEXT),
    flags: '',
    replacement: "$'".repeat(MAX_REGEX_REPLACEMENT / 2),
  }), /replacement output.*too large/i);
});

test('preserves capture states and keeps sticky replacement semantics consistent', () => {
  const captures = analyzeRegex({ pattern: '(a)?()', text: '', flags: '' });
  assert.equal(captures.matches[0].captures[0], undefined);
  assert.equal(captures.matches[0].captures[1], '');

  const sticky = analyzeRegex({ pattern: 'a', text: 'aa ba', flags: 'y', replacement: 'X' });
  assert.deepEqual(sticky.matches.map(match => match.index), [0]);
  assert.equal(sticky.replacement, 'Xa ba');
});

test('bounded replacement matches native JavaScript substitution tokens', () => {
  const pattern = '(?<word>a)(b)?';
  const text = 'ab a';
  const flags = 'g';
  const replacement = "$$|$&|$`|$'|$1|$2|$<word>";
  const result = analyzeRegex({ pattern, text, flags, replacement });
  assert.equal(result.replacement, text.replace(new RegExp(pattern, flags), replacement));

  for (const request of [
    { pattern: '(a)', text: 'a', flags: '', replacement: '$01' },
    { pattern: '(a)(b)(c)(d)(e)(f)(g)(h)(i)', text: 'abcdefghi', flags: '', replacement: '$09' },
    { pattern: '(?<known>a)', text: 'a', flags: '', replacement: '$<missing>' },
    { pattern: '(a)', text: 'a', flags: '', replacement: '$<missing>' },
  ]) {
    assert.equal(analyzeRegex(request).replacement, request.text.replace(new RegExp(request.pattern, request.flags), request.replacement));
  }
});

test('advances zero-length Unicode matches without splitting surrogate pairs', () => {
  const result = analyzeRegex({ pattern: '(?:)', text: '😀', flags: 'gu', replacement: '-' });
  assert.deepEqual(result.matches.map(match => match.index), [0, 2]);
  assert.equal(result.replacement, '-😀-');
});

test('Regex Tester uses a same-origin worker and keeps input ephemeral', () => {
  const worker = fs.readFileSync(path.join(root, 'regex/regex-worker.js'), 'utf8');
  const tool = fs.readFileSync(path.join(root, 'regex/regex-tool.js'), 'utf8');
  const english = fs.readFileSync(path.join(root, 'regex/index.html'), 'utf8');
  const chinese = fs.readFileSync(path.join(root, 'zh/regex/index.html'), 'utf8');

  for (const page of [english, chinese]) {
    assert.match(page, /id="patternInput"/);
    assert.match(page, /id="testText"/);
    assert.match(page, /id="replacementInput"/);
    assert.match(page, /id="runRegex"/);
    assert.match(page, /id="regexResults"/);
    assert.match(page, /id="copyMatches"/);
    assert.match(page, /id="copyReplacement"/);
    assert.match(page, /regex-engine\.js/);
    assert.match(page, /regex-tool\.js/);
    assert.match(page, /never uploaded|不会上传/i);
  }

  assert.match(worker, /importScripts\('\/regex\/regex-engine\.js'\)/);
  assert.match(tool, /new Worker\('\/regex\/regex-worker\.js'\)/);
  assert.match(tool, /\.terminate\(\)/);
  assert.match(tool, /setTimeout/);
  assert.match(tool, /addEventListener\('pagehide'/);
  assert.match(tool, /addEventListener\('pageshow'/);
  assert.match(tool, /input\.checked = input\.value === 'g'/);
  assert.match(tool, /renderHighlighted\(testText\.value, result\.matches\.slice\(0, MAX_RENDERED_MATCHES\)\)/);
  assert.match(tool, /MAX_RENDERED_DETAILS = 1_000/);
  assert.match(tool, /detailCount >= MAX_RENDERED_DETAILS/);
  for (const source of [worker, tool]) {
    assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|document\.cookie/);
    assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|\beval\s*\(|new Function/);
  }
});

test('Regex Tester is registered as a storage-free developer tool', () => {
  const { findTool, RELATED_TOOLS } = require('../shared/tools-data.js');
  const tool = findTool('regex');
  assert.ok(tool);
  assert.equal(tool.category, 'developer');
  assert.equal(tool.recordRecent, false);
  assert.equal(tool.name.en, 'Regex Tester');
  assert.equal(tool.name.zh, '正则表达式测试器');
  assert.deepEqual(RELATED_TOOLS.regex, ['text', 'text-diff', 'json']);
});

test('Regex Tester scripts are included in the repository JavaScript check', () => {
  const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
  for (const script of ['regex/regex-engine.js', 'regex/regex-worker.js', 'regex/regex-tool.js']) {
    assert.match(packageJson, new RegExp(`node --check ${script.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}`));
  }
});

test('Regex routes allow only the required same-origin worker in production CSP', () => {
  const headers = fs.readFileSync(path.join(root, '_headers'), 'utf8');
  for (const route of ['/regex/*', '/zh/regex/*']) {
    const start = headers.indexOf(`${route}\n`);
    assert.notEqual(start, -1);
    const block = headers.slice(start, headers.indexOf('\n\n', start));
    assert.match(block, /worker-src 'self'/);
    assert.doesNotMatch(block, /worker-src 'none'/);
  }
  assert.match(fs.readFileSync(path.join(root, 'scripts/browser-acceptance.cjs'), 'utf8'), /Content-Security-Policy/);
});
