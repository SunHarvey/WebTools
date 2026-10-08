'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

test('renders localized CSV errors without exposing raw engine diagnostics', async () => {
  const { renderCsvError } = await import('../csv/csv-tool.mjs');
  const malformed = { code: 'UNCLOSED_QUOTE', message: 'raw engine detail with secret payload', row: 2, column: 4 };
  assert.equal(
    renderCsvError(malformed, 'en'),
    'Unclosed quoted field (line 2, column 4). Check doubled quotes and field boundaries.',
  );
  assert.equal(
    renderCsvError(malformed, 'zh'),
    '引用字段未闭合（第 2 行，第 4 列）。请检查双引号转义和字段边界。',
  );
  const duplicate = { code: 'JSON_DUPLICATE_KEY', message: 'raw JSON parser detail', row: 1, column: null };
  assert.match(renderCsvError(duplicate, 'zh'), /JSON.*属性.*重复/);
  assert.doesNotMatch(renderCsvError(duplicate, 'zh'), /raw JSON parser detail/);
  assert.doesNotMatch(renderCsvError(malformed, 'en'), /secret payload|raw engine detail/);
});
