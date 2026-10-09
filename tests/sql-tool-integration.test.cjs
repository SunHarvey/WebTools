'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { findTool, RELATED_TOOLS } = require('../shared/tools-data.js');
const { routes } = require('../scripts/generate-sitemap.cjs');
const packageJson = require('../package.json');

test('registers SQL as a bilingual private developer tool with related routes and syntax checks', () => {
  const tool = findTool('sql');
  assert.ok(tool);
  assert.equal(tool.category, 'developer');
  assert.equal(tool.recordRecent, false);
  assert.equal(tool.name.en, 'SQL Formatter & Minifier');
  assert.equal(tool.name.zh, 'SQL 格式化与压缩工具');
  assert.ok(tool.description.en.includes('locally'));
  assert.ok(tool.description.zh.includes('本地'));
  assert.deepEqual(RELATED_TOOLS.sql, ['json', 'csv', 'yaml']);
  assert.ok(routes.includes('/sql/'));
  assert.ok(routes.includes('/zh/sql/'));
  for (const file of ['sql/sql-engine.mjs', 'sql/sql-tool.mjs', 'sql/sql-app.mjs']) {
    assert.ok(packageJson.scripts['check:js'].includes(`node --check ${file}`));
  }
});

test('SQL locale pages expose matching interactive controls and local module assets', () => {
  const fs = require('node:fs');
  const english = fs.readFileSync(require.resolve('../sql/index.html'), 'utf8');
  const chinese = fs.readFileSync(require.resolve('../zh/sql/index.html'), 'utf8');
  for (const id of ['sqlMode', 'sqlDialect', 'sqlKeywordCase', 'sqlIndent', 'sqlInput', 'sqlOutput', 'runSql', 'clearSql', 'sqlExample', 'copySql', 'sqlStatus']) {
    assert.match(english, new RegExp(`id="${id}"`));
    assert.match(chinese, new RegExp(`id="${id}"`));
  }
  assert.match(english, /src="\/sql\/sql-app\.mjs"/);
  assert.match(chinese, /src="\/sql\/sql-app\.mjs"/);
  assert.match(english, /lang="en"/);
  assert.match(chinese, /lang="zh-CN"/);
});
