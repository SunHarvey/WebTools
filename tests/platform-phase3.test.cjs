'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const site = require('../shared/site.js');
const { TOOLS } = require('../shared/tools-data.js');

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('tool search uses centralized localized names, descriptions and keywords', () => {
  assert.equal(site.searchTools('json', 'en', TOOLS)[0].id, 'json');
  assert.equal(site.searchTools('图片', 'zh', TOOLS)[0].id, 'image');
  assert.ok(site.searchTools('secure random', 'en', TOOLS).some(tool => tool.id === 'password'));
  assert.deepEqual(site.searchTools('', 'en', TOOLS), TOOLS);
});

test('favorites toggle and recent tools persist locally with safe bounds', () => {
  const storage = memoryStorage();
  assert.deepEqual(site.toggleFavorite(storage, 'json'), ['json']);
  assert.deepEqual(site.toggleFavorite(storage, 'uuid'), ['json', 'uuid']);
  assert.deepEqual(site.toggleFavorite(storage, 'json'), ['uuid']);
  for (const id of ['json', 'image', 'qr', 'timestamp', 'uuid', 'hash', 'color']) site.recordRecent(storage, id, 5);
  assert.deepEqual(site.readStoredIds(storage, 'utilcover.recent'), ['color', 'hash', 'uuid', 'timestamp', 'qr']);
});

test('site behavior survives a blocked localStorage getter', () => {
  const blocked = {};
  Object.defineProperty(blocked, 'localStorage', { get() { throw new Error('blocked'); } });
  assert.equal(site.getStorage(blocked), null);
});

test('every canonical page loads shared metadata and accessible site behavior', () => {
  const files = fs.readdirSync(root, { recursive: true }).filter(file => file.endsWith('index.html') && !file.includes('tools/') && !file.includes('password/index-zh'));
  for (const file of files) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /\/shared\/tools-data\.js/ , `${file} lacks metadata`);
    assert.match(html, /\/shared\/site\.js/, `${file} lacks site behavior`);
  }
  const source = fs.readFileSync(path.join(root, 'shared/site.js'), 'utf8');
  assert.match(source, /metaKey|ctrlKey/);
  assert.match(source, /aria-modal/);
  assert.match(source, /mobile-nav-toggle/);
  assert.match(source, /localStorage/);
  assert.match(source, /heading\.id = labelledBy/);
});

test('homepages expose favorite and recent tool regions', () => {
  for (const file of ['index.html', 'zh/index.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /id="favorite-tools"/);
    assert.match(html, /id="recent-tools"/);
  }
});

test('404 and compatibility pages receive search and mobile navigation behavior', () => {
  for (const file of ['404.html', 'zh/404.html', 'tools/index.html', 'zh/tools/index.html', 'index-zh.html', 'password/index-zh.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /\/shared\/tools-data\.js/, `${file} lacks search metadata`);
    assert.match(html, /\/shared\/site\.js/, `${file} lacks mobile navigation behavior`);
  }
});
