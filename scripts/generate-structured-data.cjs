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
  const section = route.replace(/^\/zh\//, '/').split('/').filter(Boolean)[0];
  const informationTypes = { privacy: 'WebPage', about: 'AboutPage', contact: 'ContactPage', licenses: 'WebPage' };
  const pageType = informationTypes[section];
  const primary = pageType
    ? { '@type': pageType, '@id': `${url}#page`, name, url, description, inLanguage: language, isPartOf: { '@id': `${homeUrl}#website` } }
    : {
        '@type': 'WebApplication', '@id': `${url}#application`, name, url, description, inLanguage: language,
        applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any', browserRequirements: 'Requires JavaScript and a modern web browser',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
      };
  return {
    '@context': 'https://schema.org',
    '@graph': [
      primary,
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

function csp(hash = '') {
  const scriptSource = hash ? `script-src 'self' ${hash};` : "script-src 'self';";
  return `default-src 'self'; ${scriptSource} script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; media-src 'self' blob:; object-src 'none'; worker-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; manifest-src 'self'; upgrade-insecure-requests`;
}

function headerPattern(route) {
  return route === '/' || route === '/zh/' ? route : `${route}*`;
}

function renderHeaders(routeSources) {
  const globalHeaders = [
    '/*',
    `  Content-Security-Policy: ${csp()}`,
    '  X-Frame-Options: DENY',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), serial=()'
  ].join('\n');
  const routeHeaders = routeSources.map(({ route, source }) => {
    const hash = `'sha256-${crypto.createHash('sha256').update(source).digest('base64')}'`;
    return [
      headerPattern(route),
      '  ! Content-Security-Policy',
      `  Content-Security-Policy: ${csp(hash)}`
    ].join('\n');
  }).join('\n\n');
  const previewHeaders = [
    'https://:project.pages.dev/*',
    '  X-Robots-Tag: noindex',
    '',
    'https://:version.:project.pages.dev/*',
    '  X-Robots-Tag: noindex'
  ].join('\n');
  return `${globalHeaders}\n\n${routeHeaders}\n\n${previewHeaders}\n`;
}

function updateCsp(routeSources) {
  fs.writeFileSync(path.join(root, '_headers'), renderHeaders(routeSources));
}

function generate() {
  const routeSources = routes.map(route => ({ route, source: updatePage(route) }));
  for (const file of aliases) {
    const fullPath = path.join(root, file);
    const html = fs.readFileSync(fullPath, 'utf8').replace(blockPattern, '\n').replace(plainBlockPattern, '\n');
    fs.writeFileSync(fullPath, html);
  }
  updateCsp(routeSources);
}

if (require.main === module) generate();
module.exports = { decodeHtml, generate, headerPattern, renderHeaders, schemaFor };
