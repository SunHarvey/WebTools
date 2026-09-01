'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const toolRoutes = ['password', 'calculator', 'json', 'text', 'encode', 'timestamp', 'uuid', 'hash', 'qr', 'unit', 'color', 'image'];
const canonicalPages = [
  { file: 'index.html', route: '/', language: 'en', peer: '/zh/' },
  ...toolRoutes.map(tool => ({ file: `${tool}/index.html`, route: `/${tool}/`, language: 'en', peer: `/zh/${tool}/` })),
  { file: 'zh/index.html', route: '/zh/', language: 'zh-CN', peer: '/' },
  ...toolRoutes.map(tool => ({ file: `zh/${tool}/index.html`, route: `/zh/${tool}/`, language: 'zh-CN', peer: `/${tool}/` }))
];
const origin = 'https://www.utilcover.com';
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const matches = (html, regex) => [...html.matchAll(regex)];

test('canonical pages expose one complete, reciprocal metadata set', () => {
  for (const page of canonicalPages) {
    const html = read(page.file);
    const canonical = origin + page.route;
    assert.equal(matches(html, /<title\b[^>]*>[\s\S]*?<\/title>/gi).length, 1, `${page.file}: title`);
    assert.equal(matches(html, /<meta\s+name="description"\s+content="[^"]+"\s*\/?>/gi).length, 1, `${page.file}: description`);
    assert.equal(matches(html, /<h1\b[^>]*>[\s\S]*?<\/h1>/gi).length, 1, `${page.file}: h1`);
    assert.deepEqual(matches(html, /<link\s+rel="canonical"\s+href="([^"]+)"\s*\/?>/gi).map(match => match[1]), [canonical], `${page.file}: self-canonical`);

    const alternates = new Map(matches(html, /<link\s+rel="alternate"\s+hreflang="([^"]+)"\s+href="([^"]+)"\s*\/?>/gi).map(match => [match[1], match[2]]));
    const englishRoute = page.language === 'en' ? page.route : page.peer;
    const chineseRoute = page.language === 'zh-CN' ? page.route : page.peer;
    assert.deepEqual(Object.fromEntries(alternates), {
      en: origin + englishRoute,
      'zh-CN': origin + chineseRoute,
      'x-default': origin + englishRoute
    }, `${page.file}: hreflang set`);

    const peerFile = canonicalPages.find(candidate => candidate.route === page.peer).file;
    assert.match(read(peerFile), new RegExp(`hreflang="${page.language}" href="${escapeRegex(canonical)}"`), `${peerFile}: reciprocal link`);
  }
});

test('canonical page titles and descriptions are unique', () => {
  const titles = new Map();
  const descriptions = new Map();
  for (const page of canonicalPages) {
    const html = read(page.file);
    const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1].trim();
    const description = html.match(/<meta\s+name="description"\s+content="([^"]+)"\s*\/?>/i)?.[1].trim();
    assert.ok(!titles.has(title), `${page.file} duplicates title from ${titles.get(title)}`);
    assert.ok(!descriptions.has(description), `${page.file} duplicates description from ${descriptions.get(description)}`);
    titles.set(title, page.file);
    descriptions.set(description, page.file);
  }
});

const decodeHtml = value => value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, '').trim();

function jsonLdBlocks(html) {
  return matches(html, /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi).map(match => ({ source: match[1], data: JSON.parse(match[1]) }));
}

function graphTypes(data) {
  const nodes = data['@graph'] || [data];
  return new Map(nodes.map(node => [node['@type'], node]));
}

test('canonical pages publish truthful localized structured data only', () => {
  for (const page of canonicalPages) {
    const blocks = jsonLdBlocks(read(page.file));
    assert.equal(blocks.length, 1, `${page.file}: JSON-LD block count`);
    const types = graphTypes(blocks[0].data);
    if (page.route === '/' || page.route === '/zh/') {
      assert.deepEqual([...types.keys()], ['WebSite', 'Organization'], `${page.file}: homepage schema types`);
      assert.equal(types.get('WebSite').url, origin + page.route);
      assert.equal(types.get('WebSite').inLanguage, page.language);
      assert.equal(types.get('WebSite').publisher['@id'], `${origin}/#organization`);
      assert.equal(types.get('Organization')['@id'], `${origin}/#organization`);
      assert.equal(types.get('Organization').url, `${origin}/`);
    } else {
      assert.deepEqual([...types.keys()], ['WebApplication', 'BreadcrumbList'], `${page.file}: tool schema types`);
      const app = types.get('WebApplication');
      assert.equal(app.url, origin + page.route);
      assert.equal(app.inLanguage, page.language);
      assert.equal(app.name, decodeHtml(read(page.file).match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)[1]));
      assert.equal(app.offers.price, '0');
      assert.equal(app.offers.priceCurrency, 'USD');
      assert.ok(!('aggregateRating' in app), `${page.file}: fabricated rating`);
      assert.ok(!('review' in app), `${page.file}: fabricated review`);
      const crumbs = types.get('BreadcrumbList').itemListElement;
      assert.equal(crumbs.at(-1).item, origin + page.route);
      assert.equal(crumbs.at(-1).name, app.name);
    }
  }

  for (const file of ['404.html', 'zh/404.html', 'index-zh.html', 'password/index-zh.html', 'tools/index.html', 'zh/tools/index.html']) {
    assert.equal(jsonLdBlocks(read(file)).length, 0, `${file}: aliases and errors must not carry canonical schema`);
  }
});

test('SEO generation and validation are wired into package scripts and deployment exclusions', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['generate:seo'], 'node scripts/generate-sitemap.cjs && node scripts/generate-structured-data.cjs');
  assert.equal(pkg.scripts['check:seo'], 'node --test tests/seo.test.cjs && node scripts/check-seo-artifacts.cjs');
  assert.match(read('.assetsignore'), /^scripts\/$/m);
  assert.ok(fs.existsSync(path.join(root, 'scripts/check-seo-artifacts.cjs')));
});

test('documents SEO artifact maintenance and the apex redirect deployment action', () => {
  const readme = read('README.md');
  assert.match(readme, /npm run generate:seo/);
  assert.match(readme, /npm run check:seo/);
  assert.match(readme, /最近一次Git提交日期/);
  assert.match(readme, /Cloudflare Single Redirect[\s\S]*utilcover\.com[\s\S]*https:\/\/www\.utilcover\.com/i);
  assert.match(readme, /无法通过静态HTML安全实现/);
});

test('sitemap lastmod uses the build date for dirty pages and Git history for clean pages', () => {
  const { lastModified } = require('../scripts/generate-sitemap.cjs');
  const now = () => new Date('2026-09-01T23:59:59Z');
  const gitDate = () => '2026-08-25';

  assert.equal(lastModified('index.html', { isDirty: () => true, now, gitDate }), '2026-09-01');
  assert.equal(lastModified('index.html', { isDirty: () => false, now, gitDate }), '2026-08-25');
});

test('sitemap contains only the 26 canonical URLs with deterministic ISO lastmod dates', () => {
  const sitemap = read('sitemap.xml');
  const locations = matches(sitemap, /<loc>([^<]+)<\/loc>/g).map(match => match[1]);
  assert.equal(locations.length, 26);
  assert.deepEqual(locations, canonicalPages.map(page => origin + page.route));
  const lastmods = matches(sitemap, /<lastmod>([^<]+)<\/lastmod>/g).map(match => match[1]);
  assert.equal(lastmods.length, 26);
  for (const date of lastmods) {
    assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10), date);
  }
  assert.equal(sitemap, require('../scripts/generate-sitemap.cjs').generate());
});

test('strict CSP authorizes every and only canonical JSON-LD block', () => {
  const crypto = require('node:crypto');
  const expected = canonicalPages.map(page => jsonLdBlocks(read(page.file))[0].source)
    .map(source => `sha256-${crypto.createHash('sha256').update(source).digest('base64')}`)
    .sort();
  const actual = matches(read('_headers'), /'sha256-([^']+)'/g).map(match => `sha256-${match[1]}`).sort();
  assert.deepEqual(actual, expected);
});

test('sitemap declares XHTML alternates for every canonical URL', () => {
  const sitemap = read('sitemap.xml');
  assert.match(sitemap, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
  for (const page of canonicalPages) {
    const entry = sitemap.match(new RegExp(`<url>[\\s\\S]*?<loc>${escapeRegex(origin + page.route)}<\\/loc>[\\s\\S]*?<\\/url>`))?.[0] || '';
    assert.ok(entry, `sitemap is missing ${page.route}`);
    const expected = {
      en: page.language === 'en' ? page.route : page.peer,
      'zh-CN': page.language === 'zh-CN' ? page.route : page.peer,
      'x-default': page.language === 'en' ? page.route : page.peer
    };
    for (const [language, route] of Object.entries(expected)) {
      assert.match(entry, new RegExp(`<xhtml:link rel="alternate" hreflang="${language}" href="${escapeRegex(origin + route)}"\\s*\/>`), `${page.route} lacks ${language}`);
    }
  }
});
