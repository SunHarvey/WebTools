'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const origin = 'https://www.utilcover.com';
const tools = ['password', 'calculator', 'json', 'text', 'encode', 'timestamp', 'uuid', 'hash', 'qr', 'unit', 'color', 'image'];
const routes = ['/', ...tools.map(tool => `/${tool}/`), '/zh/', ...tools.map(tool => `/zh/${tool}/`)];

function sourceFile(route) {
  if (route === '/') return 'index.html';
  if (route === '/zh/') return 'zh/index.html';
  return `${route.slice(1)}index.html`;
}

function alternateRoutes(route) {
  const chinese = route.startsWith('/zh/');
  const english = chinese ? (route === '/zh/' ? '/' : route.replace(/^\/zh/, '')) : route;
  const zh = chinese ? route : (route === '/' ? '/zh/' : `/zh${route}`);
  return { en: english, 'zh-CN': zh, 'x-default': english };
}

function committedDate(file) {
  return execFileSync('git', ['log', '-1', '--format=%cs', '--', file], { cwd: root, encoding: 'utf8' }).trim();
}

function workingTreeChanged(file) {
  try {
    execFileSync('git', ['diff', '--quiet', 'HEAD', '--', file], { cwd: root, stdio: 'ignore' });
    return false;
  } catch (error) {
    if (error.status === 1) return true;
    throw error;
  }
}

function lastModified(file, { isDirty = workingTreeChanged, now = () => new Date(), gitDate = committedDate } = {}) {
  if (isDirty(file)) return now().toISOString().slice(0, 10);
  return gitDate(file);
}

function generate() {
  const entries = routes.map(route => {
    const alternates = Object.entries(alternateRoutes(route))
      .map(([language, alternate]) => `    <xhtml:link rel="alternate" hreflang="${language}" href="${origin}${alternate}" />`)
      .join('\n');
    return `  <url>\n    <loc>${origin}${route}</loc>\n${alternates}\n    <lastmod>${lastModified(sourceFile(route))}</lastmod>\n  </url>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries}\n</urlset>\n`;
}

if (require.main === module) fs.writeFileSync(path.join(root, 'sitemap.xml'), generate());

module.exports = { alternateRoutes, generate, lastModified, routes, sourceFile };
