'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const routes = [
  ['', 'index.html'],
  ['password/', 'password/index.html'],
  ['calculator/', 'calculator/index.html'],
  ['json/', 'json/index.html'],
  ['text/', 'text/index.html'],
  ['encode/', 'encode/index.html'],
  ['timestamp/', 'timestamp/index.html'],
  ['uuid/', 'uuid/index.html'],
  ['hash/', 'hash/index.html'],
  ['qr/', 'qr/index.html'],
  ['unit/', 'unit/index.html'],
  ['color/', 'color/index.html'],
  ['image/', 'image/index.html']
];
const cjk = /[\u3400-\u9fff]/;
const esc = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('keeps every canonical English page English-only with a Chinese alternate', () => {
  for (const [route, file] of routes) {
    const html = read(file);
    const enUrl = `https://www.utilcover.com/${route}`;
    const zhUrl = `https://www.utilcover.com/zh/${route}`;
    assert.match(html, /<html lang="en">/, `${file} must declare English`);
    assert.doesNotMatch(html, cjk, `${file} contains Chinese text`);
    assert.match(html, new RegExp(`<link rel="canonical" href="${esc(enUrl)}">`));
    assert.match(html, new RegExp(`<link rel="alternate" hreflang="en" href="${esc(enUrl)}">`));
    assert.match(html, new RegExp(`<link rel="alternate" hreflang="zh-CN" href="${esc(zhUrl)}">`));
    assert.match(html, new RegExp(`<link rel="alternate" hreflang="x-default" href="${esc(enUrl)}">`));
    assert.match(html, /<script src="\/shared\/locale-redirect\.js"><\/script>/);
    const navigation = html.match(/<div class="nav-links">([\s\S]*?)<\/div>/)?.[1] || '';
    assert.match(navigation, new RegExp(`<a class="language-link" href="/zh/${esc(route)}">Chinese<\/a>`));
  }
  for (const file of ['tools/index.html', '404.html']) {
    assert.doesNotMatch(read(file), cjk, `${file} contains Chinese text`);
  }
});

test('publishes a static Chinese counterpart for every canonical page', () => {
  for (const [route] of routes) {
    const file = `zh/${route}index.html`;
    const html = read(file);
    const enPath = `/${route}`;
    const enUrl = `https://www.utilcover.com/${route}`;
    const zhUrl = `https://www.utilcover.com/zh/${route}`;
    assert.match(html, /<html lang="zh-CN">/, `${file} must declare Chinese`);
    assert.match(html, cjk, `${file} lacks Chinese content`);
    assert.match(html, /<title>[^<]*[\u3400-\u9fff][^<]*<\/title>/, `${file} title is not localized`);
    assert.match(html, /<meta name="description" content="[^"]*[\u3400-\u9fff][^"]*">/, `${file} description is not localized`);
    if (/property="og:title"/.test(read(routes.find(item => item[0] === route)[1]))) {
      assert.match(html, /<meta property="og:title" content="[^"]*[\u3400-\u9fff][^"]*">/, `${file} Open Graph title is not localized`);
      assert.match(html, /<meta property="og:description" content="[^"]*[\u3400-\u9fff][^"]*">/, `${file} Open Graph description is not localized`);
    }
    assert.match(html, new RegExp(`<link rel="canonical" href="${esc(zhUrl)}">`));
    assert.match(html, new RegExp(`<link rel="alternate" hreflang="en" href="${esc(enUrl)}">`));
    assert.match(html, new RegExp(`<link rel="alternate" hreflang="zh-CN" href="${esc(zhUrl)}">`));
    assert.match(html, new RegExp(`<link rel="alternate" hreflang="x-default" href="${esc(enUrl)}">`));
    assert.match(html, /<a class="brand" href="\/zh\/">/);
    const navigation = html.match(/<div class="nav-links">([\s\S]*?)<\/div>/)?.[1] || '';
    assert.match(navigation, new RegExp(`<a class="language-link" href="${esc(enPath)}\\?lang=en">英文<\/a>`));
    assert.doesNotMatch(html, /locale-redirect\.js/);
  }
});

test('Chinese calculator help text is localized', () => {
  const html = read('zh/calculator/index.html');
  assert.doesNotMatch(html, /Keyboard shortcuts:/);
  assert.match(html, /键盘快捷键：/);
});

test('redirects Chinese browsers unless English is explicitly requested', () => {
  const { chooseChineseUrl, sameHostPath } = require('../shared/locale-redirect.js');
  assert.equal(chooseChineseUrl(['zh-CN', 'en'], '', '/zh/json/'), '/zh/json/');
  assert.equal(chooseChineseUrl(['en-US'], '', '/zh/json/'), null);
  assert.equal(chooseChineseUrl(['en-US', 'zh-CN'], '', '/zh/json/'), null);
  assert.equal(chooseChineseUrl(['fr-FR', 'zh-CN', 'en-US'], '', '/zh/json/'), '/zh/json/');
  assert.equal(chooseChineseUrl([], '', '/zh/json/'), null);
  assert.equal(chooseChineseUrl(['zh-TW'], '?lang=en', '/zh/json/'), null);
  assert.equal(chooseChineseUrl(['zh-HK'], '?x=1', '/zh/json/'), '/zh/json/');
  assert.equal(sameHostPath('https://www.utilcover.com/zh/json/?source=alternate'), '/zh/json/?source=alternate');
});

test('propagates an explicit English choice across internal English links', () => {
  const { preserveEnglishLinks } = require('../shared/locale-redirect.js');
  const values = ['/json/', '/password/?x=1', '/zh/json/', 'https://example.com/'];
  const anchors = values.map(value => ({ value, getAttribute() { return this.value; }, setAttribute(_name, next) { this.value = next; } }));
  preserveEnglishLinks({ querySelectorAll: () => anchors.slice(0, 3) }, 'https://www.utilcover.com');
  assert.equal(anchors[0].value, '/json/?lang=en');
  assert.equal(anchors[1].value, '/password/?x=1&lang=en');
  assert.equal(anchors[2].value, '/zh/json/');
  assert.equal(anchors[3].value, 'https://example.com/');
});

test('defers English-link propagation until navigation exists', () => {
  const { applyEnglishPreference } = require('../shared/locale-redirect.js');
  let readyHandler;
  const anchor = { value: '/hash/', getAttribute() { return this.value; }, setAttribute(_name, value) { this.value = value; } };
  const documentObject = {
    readyState: 'loading',
    querySelectorAll: () => [anchor],
    addEventListener(name, handler) { if (name === 'DOMContentLoaded') readyHandler = handler; },
  };
  assert.equal(applyEnglishPreference(documentObject, { search: '?lang=en', origin: 'https://www.utilcover.com' }), true);
  assert.equal(anchor.value, '/hash/');
  readyHandler();
  assert.equal(anchor.value, '/hash/?lang=en');
});
