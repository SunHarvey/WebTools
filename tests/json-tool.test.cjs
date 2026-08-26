'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatJson,
  minifyJson,
  validateJson,
} = require('../json/json-tool.js');

test('formats JSON with configurable indentation', () => {
  assert.equal(formatJson('{"name":"WebTools","items":[1,2]}', 2), '{\n  "name": "WebTools",\n  "items": [\n    1,\n    2\n  ]\n}');
});

test('minifies valid JSON without changing values', () => {
  assert.equal(minifyJson(' { "ok": true, "value": null } '), '{"ok":true,"value":null}');
});

test('reports invalid JSON without throwing from validation', () => {
  const result = validateJson('{"broken": }');
  assert.equal(result.valid, false);
  assert.match(result.error, /position|line|column|JSON/i);
});

test('accepts top-level JSON primitives', () => {
  assert.deepEqual(validateJson('42'), { valid: true, value: 42 });
});
