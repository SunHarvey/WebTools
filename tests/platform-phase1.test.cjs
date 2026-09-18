'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const pairs = ['privacy', 'about', 'licenses', 'contact'];

test('Phase 1 publishes localized trust pages with complete metadata', () => {
  for (const route of pairs) {
    for (const prefix of ['', 'zh/']) {
      const file = `${prefix}${route}/index.html`;
      const html = read(file);
      const pagePath = `/${prefix}${route}/`;
      const enPath = `/${route}/`;
      const zhPath = `/zh/${route}/`;
      assert.match(html, new RegExp(`<html lang="${prefix ? 'zh-CN' : 'en'}">`));
      assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.utilcover\\.com${pagePath}">`));
      assert.match(html, new RegExp(`<link rel="alternate" hreflang="en" href="https://www\\.utilcover\\.com${enPath}">`));
      assert.match(html, new RegExp(`<link rel="alternate" hreflang="zh-CN" href="https://www\\.utilcover\\.com${zhPath}">`));
      assert.match(html, /hreflang="x-default"/);
      assert.match(html, /property="og:title"/);
      assert.match(html, /property="og:description"/);
      assert.match(html, /property="og:url"/);
    }
  }
  assert.match(read('privacy/index.html'), /not uploaded to UtilCover servers/i);
  assert.match(read('zh/privacy/index.html'), /不会上传到 UtilCover 服务器/);
  assert.match(read('licenses/index.html'), /qrcode-generator[^]*1\.4\.4[^]*MIT/i);
  assert.doesNotMatch(read('licenses/index.html'), /React|Vue|jQuery/i);
  const contact = read('contact/index.html');
  assert.match(contact, /Bug report[^]*Feature request[^]*Security issue/i);
  assert.match(contact, /github\.com\/SunHarvey\/WebTools\/issues\/new/);
  assert.match(contact, /github\.com\/SunHarvey\/WebTools\/security\/advisories\/new/);
  assert.doesNotMatch(contact, /poopsplat|security@utilcover\.com/i);
  assert.doesNotMatch(read('zh/contact/index.html'), /poopsplat|security@utilcover\.com/i);
});

test('Phase 1 homepage presents brand, popular tools and reusable categories', () => {
  for (const file of ['index.html', 'zh/index.html']) {
    const html = read(file);
    assert.match(html, /class="value-points"/);
    assert.match(html, /id="popular-tools"/);
    assert.match(html, /id="categories"/);
    assert.match(html, /data-tool-category=/);
  }
  assert.match(read('index.html'), /Private browser tools\. Nothing uploaded\./);
  assert.match(read('zh/index.html'), /实用浏览器工具，数据无需上传。/);
  const metadata = read('shared/tools-data.js');
  assert.match(metadata, /category:\s*'developer'/);
  assert.match(metadata, /popular:\s*true/);
});

test('Phase 1 adds reusable related tools and indexes every canonical route', () => {
  assert.match(read('shared/site.js'), /renderRelatedTools/);
  for (const file of ['json/index.html', 'image/index.html', 'timestamp/index.html', 'password/index.html', 'zh/json/index.html']) {
    assert.match(read(file), /data-related-tools/);
  }
  const sitemap = read('sitemap.xml');
  for (const route of pairs) {
    assert.match(sitemap, new RegExp(`<loc>https://www\\.utilcover\\.com/${route}/</loc>`));
    assert.match(sitemap, new RegExp(`<loc>https://www\\.utilcover\\.com/zh/${route}/</loc>`));
  }
  assert.match(read('robots.txt'), /Allow:\s*\//);
});
