'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

for (const route of ['base64', 'url-encoder']) {
  test(`${route} is a complete localized tool page rather than a thin shell`, () => {
    for (const prefix of ['', 'zh/']) {
      const html = read(`${prefix}${route}/index.html`);
      const pagePath = `/${prefix}${route}/`;
      assert.match(html, /class="tool-card"/);
      assert.match(html, /id="encodeInput"/);
      assert.match(html, /id="encodeOutput"/);
      assert.match(html, /\/encode\/encode-tool\.js/);
      assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.utilcover\\.com${pagePath}">`));
      assert.match(html, /hreflang="en"/);
      assert.match(html, /hreflang="zh-CN"/);
      assert.match(html, /hreflang="x-default"/);
      assert.match(html, /property="og:title"/);
      assert.match(html, /data-related-tools/);
      assert.ok(html.indexOf('class="tool-card"') < html.indexOf('tool-details'), 'controls must precede long content');
    }
  });
}

test('focused pages expose only their corresponding encode controls', () => {
  assert.match(read('base64/index.html'), /id="base64Encode"/);
  assert.match(read('base64/index.html'), /id="base64Decode"/);
  assert.doesNotMatch(read('base64/index.html'), /id="urlEncode"/);
  assert.match(read('url-encoder/index.html'), /id="urlEncode"/);
  assert.match(read('url-encoder/index.html'), /id="urlDecode"/);
  assert.doesNotMatch(read('url-encoder/index.html'), /id="base64Encode"/);
});

test('sitemap indexes focused encode pages in both languages', () => {
  const sitemap = read('sitemap.xml');
  for (const route of ['base64', 'url-encoder']) {
    assert.match(sitemap, new RegExp(`<loc>https://www\\.utilcover\\.com/${route}/</loc>`));
    assert.match(sitemap, new RegExp(`<loc>https://www\\.utilcover\\.com/zh/${route}/</loc>`));
  }
});
