'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const {
  MAX_DIFF_CHARACTERS,
  MAX_DIFF_LINES,
  MAX_DIFF_TOTAL_LINES,
  MAX_DIFF_WORK,
  compareLines,
  formatDiffText,
  nextChangeIndex,
  summarizeDiff,
} = require('../text-diff/text-diff-tool.js');

test('compares lines while preserving original text', () => {
  assert.deepEqual(compareLines('alpha\nbeta\ngamma', 'alpha\nBETA\ndelta'), [
    { type: 'equal', left: 'alpha', right: 'alpha', leftNumber: 1, rightNumber: 1 },
    { type: 'delete', left: 'beta', right: null, leftNumber: 2, rightNumber: null },
    { type: 'insert', left: null, right: 'BETA', leftNumber: null, rightNumber: 2 },
    { type: 'delete', left: 'gamma', right: null, leftNumber: 3, rightNumber: null },
    { type: 'insert', left: null, right: 'delta', leftNumber: null, rightNumber: 3 },
  ]);
});

test('can ignore case and whitespace without changing displayed lines', () => {
  assert.deepEqual(compareLines('  Alpha   beta\nKeep', 'alpha beta\nkeep', {
    ignoreCase: true,
    ignoreWhitespace: true,
  }), [
    { type: 'equal', left: '  Alpha   beta', right: 'alpha beta', leftNumber: 1, rightNumber: 1 },
    { type: 'equal', left: 'Keep', right: 'keep', leftNumber: 2, rightNumber: 2 },
  ]);
});

test('summarizes additions, deletions and contiguous change blocks', () => {
  const rows = compareLines('one\ntwo\nthree\nfour', 'one\nTWO\nthree\nfive\nsix');
  assert.deepEqual(summarizeDiff(rows), {
    added: 3,
    deleted: 2,
    unchanged: 2,
    changes: 2,
    identical: false,
  });
});

test('formats a portable text result with line prefixes', () => {
  const rows = compareLines('same\nold', 'same\nnew');
  assert.equal(formatDiffText(rows), '  same\n- old\n+ new');
});

test('treats two empty inputs as identical empty documents', () => {
  const rows = compareLines('', '');
  assert.deepEqual(rows, []);
  assert.deepEqual(summarizeDiff(rows), {
    added: 0,
    deleted: 0,
    unchanged: 0,
    changes: 0,
    identical: true,
  });
});

test('rejects oversized raw input and excessive line counts before comparison', () => {
  assert.throws(() => compareLines('x'.repeat(MAX_DIFF_CHARACTERS + 1), ''), /too large/i);
  assert.throws(() => compareLines('', `x\n`.repeat(MAX_DIFF_LINES)), /too many lines/i);
  assert.throws(() => compareLines(`x\r`.repeat(MAX_DIFF_LINES), ''), /too many lines/i);
  const left = Array.from({ length: Math.floor(MAX_DIFF_TOTAL_LINES / 2) + 1 }, () => 'left').join('\n');
  const right = Array.from({ length: Math.ceil(MAX_DIFF_TOTAL_LINES / 2) }, () => 'right').join('\n');
  assert.throws(() => compareLines(left, right), /too many total lines/i);
  const workSide = Math.floor(Math.sqrt(MAX_DIFF_WORK)) + 1;
  const workLeft = Array.from({ length: workSide }, (_, index) => `left-${index}`).join('\n');
  const workRight = Array.from({ length: workSide }, (_, index) => `right-${index}`).join('\n');
  assert.throws(() => compareLines(workLeft, workRight), /comparison is too complex/i);
});

test('difference navigation starts in the requested direction and wraps', () => {
  assert.equal(nextChangeIndex(-1, 3, 1), 0);
  assert.equal(nextChangeIndex(-1, 3, -1), 2);
  assert.equal(nextChangeIndex(0, 3, -1), 2);
  assert.equal(nextChangeIndex(2, 3, 1), 0);
});

test('Text Diff pages and implementation keep compared text local', () => {
  const script = fs.readFileSync(path.join(root, 'text-diff/text-diff-tool.js'), 'utf8');
  const english = fs.readFileSync(path.join(root, 'text-diff/index.html'), 'utf8');
  const chinese = fs.readFileSync(path.join(root, 'zh/text-diff/index.html'), 'utf8');
  for (const page of [english, chinese]) {
    assert.match(page, /id="leftText"/);
    assert.match(page, /id="rightText"/);
    assert.match(page, /id="compareText"/);
    assert.match(page, /data-diff-output/);
    assert.match(page, /never uploaded|不会上传/i);
    assert.match(page, /text-diff-tool\.js/);
  }
  assert.doesNotMatch(script, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|document\.cookie/);
  assert.doesNotMatch(script, /innerHTML|insertAdjacentHTML|\beval\s*\(|new Function/);
  assert.match(script, /textContent/);
  assert.match(script, /addEventListener\('pagehide'/);
  assert.match(script, /addEventListener\('pageshow'/);
  assert.match(script, /aria-current/);
  assert.match(script, /\.focus\(/);
});

test('Text Diff is registered as a storage-free productivity tool', () => {
  const { findTool, RELATED_TOOLS } = require('../shared/tools-data.js');
  const tool = findTool('text-diff');
  assert.ok(tool);
  assert.equal(tool.category, 'productivity');
  assert.equal(tool.recordRecent, false);
  assert.equal(tool.name.en, 'Text Diff Checker');
  assert.equal(tool.name.zh, '文本差异比较器');
  assert.deepEqual(RELATED_TOOLS['text-diff'], ['text', 'json', 'hash']);
});
