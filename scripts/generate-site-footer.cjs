'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const ignoredDirectories = new Set(['.git', 'node_modules']);

function htmlFiles(directory = root) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) files.push(...htmlFiles(path.join(directory, entry.name)));
    } else if (entry.name.endsWith('.html')) {
      files.push(path.join(directory, entry.name));
    }
  }
  return files.sort();
}

function renderFooter(language) {
  const zh = String(language).toLowerCase().startsWith('zh');
  const prefix = zh ? '/zh' : '';
  const labels = zh
    ? { aria: '页脚导航', privacy: '隐私', about: '关于', contact: '联系', licenses: '开源许可', tagline: '私密、快速的浏览器本地工具' }
    : { aria: 'Footer navigation', privacy: 'Privacy', about: 'About', contact: 'Contact', licenses: 'Licenses', tagline: 'Private, fast, client-side utilities' };
  return `<footer><nav class="footer-nav" aria-label="${labels.aria}"><a href="${prefix}/privacy/">${labels.privacy}</a><a href="${prefix}/about/">${labels.about}</a><a href="${prefix}/contact/">${labels.contact}</a><a href="${prefix}/licenses/">${labels.licenses}</a><a href="https://github.com/SunHarvey/WebTools" target="_blank" rel="noopener noreferrer">GitHub</a></nav><p>UtilCover · ${labels.tagline}</p></footer>`;
}

function updateHtml(html) {
  const language = html.match(/<html\s+lang="([^"]+)"/i)?.[1] || 'en';
  const footer = renderFooter(language);
  if (/<footer\b[\s\S]*?<\/footer>/i.test(html)) return html.replace(/<footer\b[\s\S]*?<\/footer>/i, footer);
  const insertion = html.search(/\s*<\/body>/i);
  if (insertion < 0) throw new Error('Could not find closing body for footer insertion.');
  return `${html.slice(0, insertion)}\n${footer}${html.slice(insertion)}`;
}

function generate({ check = false } = {}) {
  const stale = [];
  for (const file of htmlFiles()) {
    const html = fs.readFileSync(file, 'utf8');
    const updated = updateHtml(html);
    if (updated !== html) {
      stale.push(path.relative(root, file));
      if (!check) fs.writeFileSync(file, updated);
    }
  }
  if (check && stale.length) throw new Error(`Footer markup is stale in: ${stale.join(', ')}`);
  return stale;
}

if (require.main === module) {
  const check = process.argv.includes('--check');
  const stale = generate({ check });
  console.log(check ? 'Checked shared footer markup (0 stale files).' : `Updated shared footer markup (${stale.length} files).`);
}

module.exports = { generate, htmlFiles, renderFooter, updateHtml };
