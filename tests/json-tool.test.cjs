'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatJson,
  minifyJson,
  validateJson,
  highlightJson,
  locateJsonError,
  buildJsonTree,
  tabIndexForKey,
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

test('highlights JSON without allowing markup injection', () => {
  const highlighted = highlightJson('{"tag":"<script>","ok":true,"count":2,"none":null}');
  assert.match(highlighted, /json-key/);
  assert.match(highlighted, /json-string/);
  assert.match(highlighted, /json-boolean/);
  assert.match(highlighted, /json-number/);
  assert.match(highlighted, /json-null/);
  assert.doesNotMatch(highlighted, /<script>/);
  assert.match(highlighted, /&lt;script&gt;/);
});

test('reports a stable line and column for invalid JSON', () => {
  const source = '{\n  "ok": true,\n  "broken": ]\n}';
  const location = locateJsonError(source);
  assert.equal(location.line, 3);
  assert.equal(location.column, 13);
  assert.match(location.reason, /Unexpected|JSON/i);
  const result = validateJson(source);
  assert.equal(result.line, 3);
  assert.equal(result.column, 13);
});

test('builds a nested tree model for objects and arrays', () => {
  const tree = buildJsonTree({ user: { roles: ['admin', 'editor'] }, active: true });
  assert.equal(tree.type, 'object');
  assert.equal(tree.children[0].key, 'user');
  assert.equal(tree.children[0].node.children[0].node.type, 'array');
  assert.equal(tree.children[0].node.children[0].node.children[1].node.value, 'editor');
});

test('JSON tabs support wrapping arrow, Home and End navigation', () => {
  assert.equal(tabIndexForKey(0, 'ArrowRight', 2), 1);
  assert.equal(tabIndexForKey(1, 'ArrowRight', 2), 0);
  assert.equal(tabIndexForKey(0, 'ArrowLeft', 2), 1);
  assert.equal(tabIndexForKey(1, 'Home', 2), 0);
  assert.equal(tabIndexForKey(0, 'End', 2), 1);
  assert.equal(tabIndexForKey(0, 'Enter', 2), null);
});

test('JSON pages expose accessible highlighted text and collapsible tree views', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  for (const file of ['../json/index.html', '../zh/json/index.html']) {
    const html = fs.readFileSync(path.join(__dirname, file), 'utf8');
    assert.match(html, /id="jsonTextView"/);
    assert.match(html, /id="jsonTreeView"/);
    assert.match(html, /id="showJsonText"[^>]*aria-controls="jsonTextView"/);
    assert.match(html, /id="showJsonTree"[^>]*aria-selected="false"[^>]*tabindex="-1"[^>]*aria-controls="jsonTreeView"/);
  }
  const css = fs.readFileSync(path.join(__dirname, '../shared/tools.css'), 'utf8');
  assert.match(css, /\.view-tabs\s*\{/);
  assert.match(css, /\.json-view, \.json-tree\s*\{/);
});
