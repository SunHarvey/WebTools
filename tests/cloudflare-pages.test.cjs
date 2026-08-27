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

test('publishes a complete UtilCover icon and installable brand set on every page', () => {
  const requiredAssets = [
    'images/favicon.svg',
    'images/favicon.ico',
    'images/favicon-32x32.png',
    'images/apple-touch-icon.png',
    'images/icon-192.png',
    'images/icon-512.png',
    'images/icon-maskable-192.png',
    'images/icon-maskable-512.png',
    'images/logo.svg',
    'images/logo-light.svg',
    'images/og-image.jpg'
  ];
  for (const asset of requiredAssets) assert.ok(fs.statSync(path.join(root, asset)).size > 0, `${asset} is empty`);

  const manifest = JSON.parse(read('site.webmanifest'));
  assert.equal(manifest.short_name, 'UtilCover');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.theme_color, '#08111f');
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'));

  for (const file of fs.readdirSync(root, { recursive: true }).filter(name => name.endsWith('.html'))) {
    const html = read(file);
    assert.match(html, /href="\/images\/favicon\.svg"/i, `${file} is missing the SVG favicon`);
    assert.match(html, /rel="apple-touch-icon"/i, `${file} is missing the Apple touch icon`);
    assert.match(html, /href="\/site\.webmanifest"/i, `${file} is missing the web manifest`);
    assert.match(html, /name="theme-color" content="#08111f"/i, `${file} is missing the theme color`);
  }
});

test('uses the tool directory as the canonical homepage and keeps password generation at its own route', () => {
  const homepage = read('index.html');
  const toolsAlias = read('tools/index.html');
  const password = read('password/index.html');

  assert.match(homepage, /<body class="home-directory">/);
  assert.match(homepage, /<h1>Useful tools\. Zero uploads\.<\/h1>/);
  assert.match(homepage, /<link rel="canonical" href="https:\/\/www\.utilcover\.com\/">/);
  assert.match(homepage, /href="\/password\/"/);
  assert.doesNotMatch(homepage, /id="generateButton"/);

  assert.match(password, /id="generateButton"/);
  assert.match(password, /<link rel="canonical" href="https:\/\/www\.utilcover\.com\/password\/">/);
  assert.match(toolsAlias, /<link rel="canonical" href="https:\/\/www\.utilcover\.com\/">/);
});

test('keeps the homepage introduction compact so tools remain above the fold', () => {
  const css = read('shared/tools.css');
  assert.match(css, /\.home-directory \.page-shell\s*\{[^}]*padding:\s*28px 0 72px/s);
  assert.match(css, /\.home-directory \.hero\s*\{[^}]*margin:\s*0 auto 20px/s);
  assert.match(css, /\.home-directory h1\s*\{[^}]*font-size:\s*clamp\(1\.75rem, 4vw, 2\.65rem\)/s);
  assert.match(css, /\.nav-trust\s*\{/);
});

test('uses a one-line English desktop introduction and a four-by-three homepage grid', () => {
  const css = read('shared/tools.css');
  assert.match(css, /html\[lang="en"\] \.home-directory \.hero p\s*\{[^}]*white-space:\s*nowrap/s);
  assert.match(css, /\.home-directory \.tool-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/s);
  for (const file of ['index.html', 'tools/index.html', 'zh/index.html', 'zh/tools/index.html']) {
    assert.equal((read(file).match(/class="tool-tile"/g) || []).length, 12, `${file} does not have twelve tools`);
  }
});

test('orders homepage tools by the requested three-row workflow', () => {
  const englishOrder = ['/json/', '/image/', '/qr/', '/encode/', '/password/', '/text/', '/timestamp/', '/uuid/', '/hash/', '/color/', '/unit/', '/calculator/'];
  for (const file of ['index.html', 'tools/index.html', 'zh/index.html', 'zh/tools/index.html']) {
    const html = read(file);
    const grid = html.match(/<section class="tool-grid"[\s\S]*?<\/section>/)?.[0] || '';
    const actual = [...grid.matchAll(/<a class="tool-tile" href="([^"]+)"/g)].map(match => match[1]);
    const expected = file.startsWith('zh/') ? englishOrder.map(route => `/zh${route}`) : englishOrder;
    assert.deepEqual(actual, expected, `${file} has the wrong tool order`);
  }
});

test('keeps every tool-page introduction and title compact', () => {
  const css = read('shared/tools.css');
  assert.match(css, /\.tool-directory-page \.page-shell\s*\{[^}]*padding:\s*32px 0 72px/s);
  assert.match(css, /\.tool-directory-page \.hero\s*\{[^}]*margin:\s*0 auto 20px/s);
  assert.match(css, /\.tool-directory-page h1\s*\{[^}]*font-size:\s*clamp\(1\.7rem, 4vw, 2\.5rem\)/s);
  assert.match(read('json/index.html'), /<body class="tool-directory-page">/);
});

test('shows direct links to all twelve tools in every shared top navigation', () => {
  const routes = ['/password/', '/calculator/', '/json/', '/text/', '/encode/', '/timestamp/', '/uuid/', '/hash/', '/qr/', '/unit/', '/color/', '/image/'];
  const pages = fs.readdirSync(root, { recursive: true }).filter(name => name.endsWith('.html') && read(name).includes('class="nav-links"'));
  assert.ok(pages.length >= 12);
  for (const file of pages) {
    const html = read(file);
    const nav = html.match(/<div class="nav-links">([\s\S]*?)<\/div>/)?.[1] || '';
    const expectedRoutes = /<html lang="zh-CN">/.test(html) ? routes.map(route => `/zh${route}`) : routes;
    for (const route of expectedRoutes) assert.match(nav, new RegExp(`href="${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`), `${file} navigation is missing ${route}`);
  }
});

test('removes nonessential utility-category labels from all visible page heroes', () => {
  const toolPages = ['json', 'text', 'encode', 'timestamp', 'uuid', 'hash', 'qr', 'unit', 'color', 'image'];
  for (const tool of toolPages) assert.doesNotMatch(read(`${tool}/index.html`), /class="eyebrow"/, `${tool} still has a category label`);
  for (const file of ['index.html', 'tools/index.html', 'zh/index.html', 'zh/tools/index.html']) {
    assert.doesNotMatch(read(file), /class="eyebrow"/, `${file} still has a category label`);
  }
});

test('uses the shared UtilCover layout for password and calculator pages', () => {
  for (const file of ['password/index.html', 'password/index-zh.html', 'calculator/index.html']) {
    const html = read(file);
    assert.match(html, /href="\/shared\/tools\.css"/);
    assert.match(html, /class="site-header"/);
    assert.match(html, /class="nav-links"/);
    assert.match(html, /<body class="tool-directory-page/);
    assert.match(html, /class="tool-card/);
  }
  assert.match(read('password/index.html'), /id="generateButton"/);
  assert.match(read('calculator/index.html'), /id="calculatorDisplay"/);
  assert.doesNotMatch(read('calculator/calculator.css'), /border-radius:\s*50%/);
  assert.doesNotMatch(read('calculator/calculator.css'), /border-radius:\s*38px/);
});

test('keeps generic local-processing claims off individual tool heroes', () => {
  const toolPages = ['password/index.html', 'password/index-zh.html', 'index-zh.html', 'calculator/index.html', 'json/index.html', 'text/index.html', 'encode/index.html', 'timestamp/index.html', 'uuid/index.html', 'hash/index.html', 'qr/index.html', 'unit/index.html', 'color/index.html', 'image/index.html'];
  for (const file of toolPages) {
    const html = read(file);
    const hero = html.match(/<section class="hero">([\s\S]*?)<\/section>/)?.[1] || '';
    assert.doesNotMatch(hero, /class="privacy-note"/, `${file} still repeats the privacy claim in its hero`);
  }
  for (const file of ['index.html', 'tools/index.html', 'zh/index.html', 'zh/tools/index.html']) {
    const html = read(file);
    const hero = html.match(/<section class="hero">([\s\S]*?)<\/section>/)?.[1] || '';
    const nav = html.match(/<nav class="nav-shell"[\s\S]*?<\/nav>/)?.[0] || '';
    assert.doesNotMatch(hero, /class="privacy-note"/, `${file} still has the privacy claim in its hero`);
    assert.match(nav, /class="brand-cluster"/, `${file} does not group the logo and privacy claim`);
    assert.match(nav, /class="nav-trust"/, `${file} lacks the navigation privacy claim`);
    assert.doesNotMatch(nav, /✓/, `${file} still prefixes the privacy claim with a checkmark`);
    if (file.startsWith('zh/')) {
      assert.match(nav, />仅在本地处理，不会上传<\/span>/, `${file} has ambiguous Chinese trust copy`);
      assert.doesNotMatch(nav, /保留在此设备/, `${file} still implies storage`);
    } else {
      assert.match(nav, />Processed locally — never uploaded<\/span>/, `${file} has ambiguous English trust copy`);
      assert.doesNotMatch(nav, /input stays on this device/i, `${file} still implies storage`);
    }
  }
});

test('styles the homepage trust message as a distinct logo-adjacent brand signal', () => {
  const css = read('shared/tools.css');
  assert.match(css, /\.brand-cluster\s*\{[^}]*gap:\s*10px/s);
  assert.match(css, /\.nav-trust\s*\{[^}]*font-size:\s*0\.82rem/s);
  assert.match(css, /\.nav-trust\s*\{[^}]*border-left:\s*2px solid/s);
});

test('places concise privacy notes beside sensitive inputs only', () => {
  const sensitivePages = ['password/index.html', 'json/index.html', 'text/index.html', 'encode/index.html', 'hash/index.html', 'qr/index.html', 'image/index.html'];
  for (const file of sensitivePages) assert.match(read(file), /class="local-processing-note"/, `${file} lacks a contextual local-processing note`);
  const css = read('shared/tools.css');
  assert.match(css, /\.local-processing-note\s*\{[^}]*font-size:\s*0\.78rem/s);
});

test('provides a top-level Cloudflare Pages 404 instead of SPA fallback', () => {
  const html = read('404.html');
  assert.match(html, /<!DOCTYPE html>/i);
  assert.match(html, /Page not found/i);
  assert.match(html, /href="\/"/);
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

  for (const file of ['password/index.html', 'password/index-zh.html', 'zh/password/index.html']) {
    const match = read(file).match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(match, `${file} must contain JSON-LD`);
    const hash = crypto.createHash('sha256').update(match[1]).digest('base64');
    assert.match(headers, new RegExp(`'sha256-${hash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  }
});

test('production HTML avoids inline event handlers required by strict CSP', () => {
  for (const file of fs.readdirSync(root, { recursive: true }).filter(name => name.endsWith('.html'))) {
    const html = read(file);
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i, `${file} contains an inline event handler`);
  }
});

test('publishes robots and sitemap entries for every public tool route', () => {
  const robots = read('robots.txt');
  const sitemap = read('sitemap.xml');
  assert.match(robots, /Sitemap: https:\/\/www\.utilcover\.com\/sitemap\.xml/);
  const routes = ['/', '/password/', '/calculator/', '/json/', '/text/', '/encode/', '/timestamp/', '/uuid/', '/hash/', '/qr/', '/unit/', '/color/', '/image/', '/zh/', '/zh/password/', '/zh/calculator/', '/zh/json/', '/zh/text/', '/zh/encode/', '/zh/timestamp/', '/zh/uuid/', '/zh/hash/', '/zh/qr/', '/zh/unit/', '/zh/color/', '/zh/image/'];
  for (const route of routes) assert.match(sitemap, new RegExp(`<loc>https://www\\.utilcover\\.com${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>`));
  assert.doesNotMatch(sitemap, /<loc>https:\/\/www\.utilcover\.com\/tools\/<\/loc>/);
});

test('documents exact Workers Builds settings and custom-domain canonical host', () => {
  const readme = read('README.md');
  assert.match(readme, /Workers Builds/);
  assert.match(readme, /Build command.*`exit 0`/i);
  assert.match(readme, /Deploy command.*`npx wrangler deploy`/i);
  assert.match(readme, /Production branch.*`main`/i);
  assert.match(readme, /www\.utilcover\.com/);
});
