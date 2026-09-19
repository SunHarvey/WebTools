'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { TOOLS, TOOL_CATEGORIES, RELATED_TOOLS } = require('../shared/tools-data.js');

const ROOT = path.resolve(__dirname, '..');

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function route(tool, language) {
  return `${language === 'zh' ? '/zh' : ''}/${tool.id}/`;
}

function renderTile(tool, language) {
  return `<a class="tool-tile" data-tool-category="${escapeHtml(tool.category)}" href="${route(tool, language)}"><div class="tool-icon">${escapeHtml(tool.icon)}</div><h3>${escapeHtml(tool.name[language])}</h3><p>${escapeHtml(tool.description[language])}</p></a>`;
}

function renderPopular(language) {
  const heading = language === 'zh' ? '常用工具' : 'Popular tools';
  return `<section id="popular-tools"><div class="section-heading"><h2>${heading}</h2></div><div class="tool-grid">${TOOLS.filter(tool => tool.popular).map(tool => renderTile(tool, language)).join('')}</div></section>`;
}

function renderCategories(language) {
  const heading = language === 'zh' ? '全部工具分类' : 'All tools by category';
  const cards = Object.entries(TOOL_CATEGORIES).map(([category, labels]) => {
    const links = TOOLS.filter(tool => tool.category === category)
      .map(tool => `<a href="${route(tool, language)}">${escapeHtml(tool.name[language])}</a>`)
      .join('');
    return `<section class="category-card" data-tool-category="${escapeHtml(category)}"><h3>${escapeHtml(labels[language])}</h3><div class="category-links">${links}</div></section>`;
  }).join('');
  return `<section id="categories"><div class="section-heading"><h2>${heading}</h2></div><div class="category-grid">${cards}</div></section>`;
}

function renderRelated(sourceId, language, labelledBy = '') {
  const heading = language === 'zh' ? '相关工具' : 'Related tools';
  const headingId = labelledBy ? ` id="${escapeHtml(labelledBy)}"` : '';
  const links = (RELATED_TOOLS[sourceId] || []).map(id => {
    const tool = TOOLS.find(item => item.id === id);
    if (!tool) throw new Error(`Unknown related tool '${id}' for '${sourceId}'.`);
    return `<a href="${route(tool, language)}"><strong>${escapeHtml(tool.name[language])}</strong><span>${escapeHtml(tool.description[language])}</span></a>`;
  }).join('');
  return `<h2${headingId}>${heading}</h2><div class="related-links">${links}</div>`;
}

function elementBounds(html, openingMatch) {
  const tag = openingMatch[1].toLowerCase();
  const tokenPattern = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
  tokenPattern.lastIndex = openingMatch.index;
  let depth = 0;
  let token;
  while ((token = tokenPattern.exec(html))) {
    if (/^<\//.test(token[0])) depth -= 1;
    else depth += 1;
    if (depth === 0) return { start: openingMatch.index, openEnd: openingMatch.index + openingMatch[0].length, end: tokenPattern.lastIndex, closeStart: token.index };
  }
  throw new Error(`Unclosed <${tag}> element.`);
}

function replaceWholeElement(html, pattern, replacement, label) {
  const match = pattern.exec(html);
  if (!match) throw new Error(`Could not find ${label}.`);
  const bounds = elementBounds(html, match);
  return `${html.slice(0, bounds.start)}${replacement}${html.slice(bounds.end)}`;
}

function replaceElementInner(html, pattern, render, label) {
  const match = pattern.exec(html);
  if (!match) throw new Error(`Could not find ${label}.`);
  const bounds = elementBounds(html, match);
  return `${html.slice(0, bounds.openEnd)}${render(match)}${html.slice(bounds.closeStart)}`;
}

function generatedFiles() {
  const files = new Map();
  for (const [relative, language] of [['index.html', 'en'], ['zh/index.html', 'zh']]) {
    const filename = path.join(ROOT, relative);
    let html = fs.readFileSync(filename, 'utf8');
    html = replaceWholeElement(html, /<(section)\b[^>]*\bid="popular-tools"[^>]*>/i, renderPopular(language), `${relative} popular tools`);
    html = replaceWholeElement(html, /<(section)\b[^>]*\bid="categories"[^>]*>/i, renderCategories(language), `${relative} categories`);
    files.set(filename, html);
  }

  for (const tool of TOOLS) {
    for (const language of ['en', 'zh']) {
      const relative = `${language === 'zh' ? 'zh/' : ''}${tool.id}/index.html`;
      const filename = path.join(ROOT, relative);
      let html = fs.readFileSync(filename, 'utf8');
      const pattern = new RegExp(`<(nav|div|section)\\b[^>]*\\bdata-related-tools="${tool.id}"[^>]*>`, 'i');
      html = replaceElementInner(html, pattern, match => {
        const labelledBy = match[0].match(/\baria-labelledby="([^"]+)"/i)?.[1] || '';
        return renderRelated(tool.id, language, labelledBy);
      }, `${relative} related tools`);
      files.set(filename, html);
    }
  }
  return files;
}

function run({ check = false } = {}) {
  const changed = [];
  for (const [filename, generated] of generatedFiles()) {
    const current = fs.readFileSync(filename, 'utf8');
    if (current === generated) continue;
    changed.push(path.relative(ROOT, filename));
    if (!check) fs.writeFileSync(filename, generated);
  }
  if (check && changed.length) {
    throw new Error(`Generated tool directory markup is stale: ${changed.join(', ')}. Run npm run generate:directory.`);
  }
  process.stdout.write(`${check ? 'Checked' : 'Generated'} centralized tool markup (${changed.length} ${check ? 'stale' : 'updated'} files).\n`);
  return changed;
}

module.exports = { escapeHtml, renderPopular, renderCategories, renderRelated, generatedFiles, run };

if (require.main === module) {
  try { run({ check: process.argv.includes('--check') }); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
