'use strict';

const assert = require('node:assert/strict');
const { before, test } = require('node:test');

let sqlTool;
before(async () => {
  sqlTool = await import('../sql/sql-tool.mjs');
});

test('renders bounded SQL engine failures as localized messages without raw input', () => {
  const error = { code: 'UNCLOSED_STRING', line: 3, column: 8, message: 'secret_table value' };
  const english = sqlTool.renderSqlError(error, 'en');
  const chinese = sqlTool.renderSqlError(error, 'zh-CN');
  assert.match(english, /line 3, column 8/i);
  assert.match(chinese, /第 3 行，第 8 列/);
  assert.doesNotMatch(english, /secret_table/);
  assert.doesNotMatch(chinese, /secret_table/);
});

test('localizes input, resource-bound, dialect, and option errors', () => {
  for (const code of ['EMPTY_INPUT', 'INPUT_INVALID', 'INPUT_TOO_LARGE', 'TOKEN_LIMIT', 'DEPTH_LIMIT', 'OUTPUT_TOO_LARGE', 'DIALECT_INVALID', 'OPTION_INVALID', 'UNCLOSED_COMMENT']) {
    const english = sqlTool.renderSqlError({ code }, 'en');
    const chinese = sqlTool.renderSqlError({ code }, 'zh-CN');
    assert.ok(english.length > 0, `missing English message for ${code}`);
    assert.ok(chinese.length > 0, `missing Chinese message for ${code}`);
    assert.notEqual(english, chinese, `messages should be localized for ${code}`);
  }
});

test('falls back to a generic localized SQL error without exposing engine details', () => {
  const error = { message: 'query contains private_table and secret values' };
  assert.equal(sqlTool.renderSqlError(error, 'en'), 'Could not safely process this SQL input.');
  assert.equal(sqlTool.renderSqlError(error, 'zh-CN'), '无法安全处理此 SQL 输入。');
});
