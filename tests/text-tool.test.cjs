'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  textStats,
  removeBlankLines,
  deduplicateLines,
  sortLines,
  trimLines,
  toTitleCase,
} = require('../text/text-tool.js');

test('counts unicode characters, words, Chinese characters, lines and paragraphs', () => {
  assert.deepEqual(textStats('Hello world\n\n你好 👋'), {
    characters: 17,
    charactersNoSpaces: 13,
    words: 2,
    chineseCharacters: 2,
    lines: 3,
    paragraphs: 2,
  });
});

test('returns zero lines and paragraphs for empty text', () => {
  assert.equal(textStats('').lines, 0);
  assert.equal(textStats('').paragraphs, 0);
});

test('removes blank lines and trims every line', () => {
  assert.equal(removeBlankLines(' one \n \n two '), ' one \n two ');
  assert.equal(trimLines(' one \n two '), 'one\ntwo');
});

test('deduplicates lines while preserving first occurrence', () => {
  assert.equal(deduplicateLines('beta\nalpha\nbeta\nalpha '), 'beta\nalpha\nalpha ');
});

test('sorts lines with locale-aware numeric ordering', () => {
  assert.equal(sortLines('item10\nitem2\nitem1'), 'item1\nitem2\nitem10');
});

test('converts text to title case', () => {
  assert.equal(toTitleCase('hello WEB tools'), 'Hello Web Tools');
});
