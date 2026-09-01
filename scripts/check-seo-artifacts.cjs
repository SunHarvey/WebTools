'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { generate: generateSitemap, routes, sourceFile } = require('./generate-sitemap.cjs');
const { schemaFor } = require('./generate-structured-data.cjs');

const root = path.join(__dirname, '..');
const sources = [];

assert.equal(fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8'), generateSitemap(), 'sitemap.xml is stale; run npm run generate:seo');

for (const route of routes) {
  const file = sourceFile(route);
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const blocks = [...html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  assert.equal(blocks.length, 1, `${file} must contain one JSON-LD block`);
  assert.deepEqual(JSON.parse(blocks[0][1]), schemaFor(route, html, file), `${file} JSON-LD is stale; run npm run generate:seo`);
  sources.push(blocks[0][1]);
}

const expectedHashes = [...new Set(sources.map(source => `sha256-${crypto.createHash('sha256').update(source).digest('base64')}`))].sort();
const headers = fs.readFileSync(path.join(root, '_headers'), 'utf8');
const actualHashes = [...headers.matchAll(/'sha256-([^']+)'/g)].map(match => `sha256-${match[1]}`).sort();
assert.deepEqual(actualHashes, expectedHashes, '_headers JSON-LD CSP hashes are stale; run npm run generate:seo');

console.log(`SEO artifacts valid: ${routes.length} canonical URLs, ${expectedHashes.length} CSP hashes`);
