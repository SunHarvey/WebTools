'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { routes, sourceFile } = require('./generate-sitemap.cjs');

const root = path.join(__dirname, '..');
const origin = 'https://www.utilcover.com';
const aliases = ['404.html', 'zh/404.html', 'index-zh.html', 'password/index-zh.html', 'tools/index.html', 'zh/tools/index.html'];
const blockPattern = /\n?\s*<!-- JSON-LD -->\s*<script\s+type="application\/ld\+json">[\s\S]*?<\/script>\s*/gi;
const plainBlockPattern = /\n?\s*<script\s+type="application\/ld\+json">[\s\S]*?<\/script>\s*/gi;

function decodeHtml(value) {
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, '').trim();
}

function valueFrom(html, pattern, file) {
  const value = html.match(pattern)?.[1];
  if (!value) throw new Error(`Could not derive structured data from ${file}`);
  return decodeHtml(value);
}

function schemaFor(route, html, file) {
  const language = route.startsWith('/zh/') ? 'zh-CN' : 'en';
  const url = origin + route;
  if (route === '/' || route === '/zh/') {
    const organizationId = `${origin}/#organization`;
    return {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', '@id': `${url}#website`, name: 'UtilCover', url, description: valueFrom(html, /<meta\s+name="description"\s+content="([^"]+)"/i, file), inLanguage: language, publisher: { '@id': organizationId } },
        { '@type': 'Organization', '@id': organizationId, name: 'UtilCover', url: `${origin}/`, logo: `${origin}/images/logo.svg` }
      ]
    };
  }

  const name = valueFrom(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i, file);
  const description = valueFrom(html, /<meta\s+name="description"\s+content="([^"]+)"/i, file);
  const homeUrl = language === 'zh-CN' ? `${origin}/zh/` : `${origin}/`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication', '@id': `${url}#application`, name, url, description, inLanguage: language,
        applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any', browserRequirements: 'Requires JavaScript and a modern web browser',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
      },
      {
        '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: language === 'zh-CN' ? '工具' : 'Tools', item: homeUrl },
          { '@type': 'ListItem', position: 2, name, item: url }
        ]
      }
    ]
  };
}

function updatePage(route) {
  const file = sourceFile(route);
  const fullPath = path.join(root, file);
  let html = fs.readFileSync(fullPath, 'utf8').replace(blockPattern, '\n').replace(plainBlockPattern, '\n');
  const source = `\n  <script type="application/ld+json">\n${JSON.stringify(schemaFor(route, html, file), null, 2)}\n  </script>\n`;
  html = html.replace(/\n?<\/head>/i, `${source}</head>`);
  fs.writeFileSync(fullPath, html);
  return source.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
}

function updateCsp(sources) {
  const hashes = [...new Set(sources.map(source => `'sha256-${crypto.createHash('sha256').update(source).digest('base64')}'`))].sort();
  const file = path.join(root, '_headers');
  const headers = fs.readFileSync(file, 'utf8');
  const updated = headers.replace(/script-src 'self'(?: 'sha256-[^']+')*;/, `script-src 'self' ${hashes.join(' ')};`);
  if (updated === headers && !hashes.every(hash => headers.includes(hash))) throw new Error('Could not update CSP script-src hashes');
  fs.writeFileSync(file, updated);
}

function generate() {
  const sources = routes.map(updatePage);
  for (const file of aliases) {
    const fullPath = path.join(root, file);
    const html = fs.readFileSync(fullPath, 'utf8').replace(blockPattern, '\n').replace(plainBlockPattern, '\n');
    fs.writeFileSync(fullPath, html);
  }
  updateCsp(sources);
}

if (require.main === module) generate();
module.exports = { decodeHtml, generate, schemaFor };
