'use strict';

const TEXT_MESSAGES = {
  ready: { en: 'Ready', zh: '就绪' },
  copied: { en: 'Copied', zh: '已复制' },
  copyFailed: { en: 'Copy failed', zh: '复制失败' },
};

function textMessage(key, language) {
  const locale = String(language).toLowerCase().startsWith('zh') ? 'zh' : 'en';
  return TEXT_MESSAGES[key][locale];
}

function textStats(text) {
  const value = String(text ?? '');
  const wordMatches = value.match(/[\p{L}\p{N}]+/gu) || [];
  const latinWords = wordMatches.filter(token => !/^\p{Script=Han}+$/u.test(token)).length;
  const chineseCharacters = (value.match(/\p{Script=Han}/gu) || []).length;
  const paragraphs = value.trim() ? value.trim().split(/\n\s*\n/u).filter(Boolean).length : 0;
  return {
    characters: [...value].length,
    charactersNoSpaces: [...value.replace(/\s/gu, '')].length,
    words: latinWords,
    chineseCharacters,
    lines: value === '' ? 0 : value.split(/\r?\n/u).length,
    paragraphs,
  };
}

function removeBlankLines(text) {
  return String(text).split(/\r?\n/u).filter(line => line.trim() !== '').join('\n');
}

function deduplicateLines(text) {
  const seen = new Set();
  return String(text).split(/\r?\n/u).filter(line => {
    if (seen.has(line)) return false;
    seen.add(line);
    return true;
  }).join('\n');
}

function sortLines(text) {
  return String(text).split(/\r?\n/u).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })).join('\n');
}

function trimLines(text) {
  return String(text).split(/\r?\n/u).map(line => line.trim()).join('\n');
}

function toTitleCase(text) {
  return String(text).toLocaleLowerCase().replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_, prefix, letter) => prefix + letter.toLocaleUpperCase());
}

function attachTextTool() {
  const language = document.documentElement.lang;
  const area = document.getElementById('textInput');
  if (!area) return;
  const statElements = Object.fromEntries(['characters', 'charactersNoSpaces', 'words', 'chineseCharacters', 'lines', 'paragraphs'].map(key => [key, document.querySelector(`[data-stat="${key}"]`)]));
  const status = document.getElementById('textStatus');

  const refresh = () => {
    const stats = textStats(area.value);
    for (const [key, element] of Object.entries(statElements)) if (element) element.textContent = String(stats[key]);
  };
  const apply = transform => { area.value = transform(area.value); refresh(); };
  const actions = {
    trim: trimLines,
    blanks: removeBlankLines,
    dedupe: deduplicateLines,
    sort: sortLines,
    upper: value => value.toLocaleUpperCase(),
    lower: value => value.toLocaleLowerCase(),
    title: toTitleCase,
  };

  document.querySelectorAll('[data-text-action]').forEach(button => button.addEventListener('click', () => apply(actions[button.dataset.textAction])));
  document.getElementById('clearText').addEventListener('click', () => { area.value = ''; status.textContent = textMessage('ready', language); refresh(); });
  document.getElementById('copyText').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(area.value); status.textContent = textMessage('copied', language); }
    catch { status.textContent = textMessage('copyFailed', language); }
  });
  area.addEventListener('input', refresh);
  refresh();
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', attachTextTool);
if (typeof module !== 'undefined' && module.exports) module.exports = { textStats, removeBlankLines, deduplicateLines, sortLines, trimLines, toTitleCase, textMessage };
