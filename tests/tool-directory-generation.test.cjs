'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const { TOOLS, RELATED_TOOLS } = require(path.join(root, 'shared/tools-data.js'));

test('directory generator renders popular tools from centralized metadata', () => {
  const generator = require(path.join(root, 'scripts/generate-tool-directory.cjs'));
  const html = generator.renderPopular('en');
  for (const tool of TOOLS.filter(item => item.popular)) {
    assert.match(html, new RegExp(`href="/${tool.id}/"`));
    assert.match(html, new RegExp(`<h3>${generator.escapeHtml(tool.name.en)}</h3>`));
  }
});

test('directory generator renders every category tool from centralized metadata', () => {
  const generator = require(path.join(root, 'scripts/generate-tool-directory.cjs'));
  const html = generator.renderCategories('zh');
  for (const tool of TOOLS) {
    assert.match(html, new RegExp(`href="/zh/${tool.id}/"`));
  }
});

test('related-tool fallback markup follows the centralized relation map', () => {
  const generator = require(path.join(root, 'scripts/generate-tool-directory.cjs'));
  for (const [source, related] of Object.entries(RELATED_TOOLS)) {
    const html = generator.renderRelated(source, 'en');
    const hrefs = [...html.matchAll(/href="\/([^/]+)\/"/g)].map(match => match[1]);
    assert.deepEqual(hrefs, related);
  }
});

test('package exposes directory generation and drift checks', () => {
  const packageJson = require(path.join(root, 'package.json'));
  assert.equal(packageJson.scripts['generate:directory'], 'node scripts/generate-tool-directory.cjs');
  assert.equal(packageJson.scripts['check:directory'], 'node scripts/generate-tool-directory.cjs --check');
});
