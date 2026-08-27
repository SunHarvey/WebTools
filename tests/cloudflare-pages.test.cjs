'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('configures Workers Builds static assets without exposing repository files', () => {
  const config = JSON.parse(read('wrangler.json'));
  const ignored = read('.assetsignore');

  assert.equal(config.name, 'webtools');
  assert.match(config.compatibility_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(config.assets.directory, '.');
  assert.equal(config.assets.not_found_handling, '404-page');

  for (const entry of ['tests/', 'package.json', 'README.md', 'wrangler.json']) {
    assert.match(ignored, new RegExp(`^${entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  }
});

test('provides a top-level Cloudflare Pages 404 instead of SPA fallback', () => {
  const html = read('404.html');
  assert.match(html, /<!DOCTYPE html>/i);
  assert.match(html, /Page not found/i);
  assert.match(html, /href="\/tools\/"/);
});

test('defines hardened static response headers without inline script execution', () => {
  const headers = read('_headers');
  assert.match(headers, /Content-Security-Policy:/);
  assert.match(headers, /default-src 'self'/);
  assert.match(headers, /script-src 'self'/);
  assert.doesNotMatch(headers, /script-src[^;\n]*'unsafe-inline'/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /connect-src 'none'/);
  assert.match(headers, /X-Frame-Options: DENY/);
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /Permissions-Policy:/);

  for (const file of ['index.html', 'index-zh.html']) {
    const match = read(file).match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(match, `${file} must contain JSON-LD`);
    const hash = crypto.createHash('sha256').update(match[1]).digest('base64');
    assert.match(headers, new RegExp(`'sha256-${hash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  }
});

test('production HTML avoids inline event handlers required by strict CSP', () => {
  for (const file of fs.readdirSync(root).filter(name => name.endsWith('.html'))) {
    const html = read(file);
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i, `${file} contains an inline event handler`);
  }
});

test('publishes robots and sitemap entries for every public tool route', () => {
  const robots = read('robots.txt');
  const sitemap = read('sitemap.xml');
  assert.match(robots, /Sitemap: https:\/\/www\.genpass\.top\/sitemap\.xml/);
  const routes = ['/', '/index-zh', '/tools/', '/calculator/', '/json/', '/text/', '/encode/', '/timestamp/', '/uuid/', '/hash/', '/qr/', '/unit/', '/color/', '/image/'];
  for (const route of routes) assert.match(sitemap, new RegExp(`<loc>https://www\\.genpass\\.top${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>`));
});

test('documents exact Workers Builds settings and custom-domain canonical host', () => {
  const readme = read('README.md');
  assert.match(readme, /Workers Builds/);
  assert.match(readme, /Build command.*`exit 0`/i);
  assert.match(readme, /Deploy command.*`npx wrangler deploy`/i);
  assert.match(readme, /Production branch.*`main`/i);
  assert.match(readme, /www\.genpass\.top/);
});
