'use strict';

const FAVORITES_KEY = 'utilcover.favorites';
const RECENT_KEY = 'utilcover.recent';

function pageLanguage() {
  return typeof document !== 'undefined' && document.documentElement.lang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function searchTools(query, language = 'en', tools = globalThis.UTILCOVER_TOOLS || []) {
  const needle = String(query).trim().toLocaleLowerCase(language === 'zh' ? 'zh-CN' : 'en');
  if (!needle) return tools;
  return tools.filter(tool => [tool.name[language], tool.description[language], ...tool.keywords]
    .join(' ').toLocaleLowerCase(language === 'zh' ? 'zh-CN' : 'en').includes(needle));
}

function readStoredIds(storage, key) {
  try {
    const parsed = JSON.parse(storage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string') : [];
  } catch { return []; }
}

function writeStoredIds(storage, key, ids) {
  try { storage.setItem(key, JSON.stringify(ids)); } catch { /* Storage may be disabled. */ }
  return ids;
}

function toggleFavorite(storage, id) {
  const ids = readStoredIds(storage, FAVORITES_KEY);
  const next = ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id];
  return writeStoredIds(storage, FAVORITES_KEY, next);
}

function recordRecent(storage, id, limit = 7) {
  const next = [id, ...readStoredIds(storage, RECENT_KEY).filter(item => item !== id)].slice(0, limit);
  return writeStoredIds(storage, RECENT_KEY, next);
}

function toolHref(tool, language) { return `${language === 'zh' ? '/zh' : ''}/${tool.id}/`; }

function renderRelatedTools(root = document) {
  const language = pageLanguage();
  root.querySelectorAll('[data-related-tools]').forEach(container => {
    const ids = globalThis.UTILCOVER_RELATED?.[container.dataset.relatedTools] || [];
    const heading = document.createElement('h2');
    const labelledBy = container.getAttribute('aria-labelledby');
    if (labelledBy) heading.id = labelledBy;
    heading.textContent = language === 'zh' ? '相关工具' : 'Related tools';
    const links = document.createElement('div');
    links.className = 'related-links';
    ids.forEach(id => {
      const tool = globalThis.UTILCOVER_TOOLS?.find(item => item.id === id);
      if (!tool) return;
      const link = document.createElement('a');
      link.href = toolHref(tool, language);
      link.textContent = tool.name[language];
      links.appendChild(link);
    });
    container.replaceChildren(heading, links);
  });
}

function createToolLink(tool, language) {
  const link = document.createElement('a');
  link.className = 'saved-tool-link';
  link.href = toolHref(tool, language);
  link.textContent = tool.name[language];
  return link;
}

function renderSavedTools() {
  if (!globalThis.localStorage) return;
  const language = pageLanguage();
  for (const [elementId, key] of [['favorite-tools', FAVORITES_KEY], ['recent-tools', RECENT_KEY]]) {
    const region = document.getElementById(elementId);
    if (!region) continue;
    const ids = readStoredIds(localStorage, key);
    const links = ids.map(id => globalThis.UTILCOVER_TOOLS.find(tool => tool.id === id)).filter(Boolean).map(tool => createToolLink(tool, language));
    region.hidden = links.length === 0;
    const list = region.querySelector('.saved-tool-list');
    if (list) list.replaceChildren(...links);
  }
}

function createSearchDialog() {
  const language = pageLanguage();
  const dialog = document.createElement('dialog');
  dialog.className = 'tool-search-dialog';
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'toolSearchTitle');
  const title = document.createElement('h2');
  title.id = 'toolSearchTitle';
  title.textContent = language === 'zh' ? '搜索工具' : 'Search tools';
  const input = document.createElement('input');
  input.type = 'search';
  input.id = 'toolSearchInput';
  input.placeholder = language === 'zh' ? '搜索 JSON、图片、UUID…' : 'Search JSON, image, UUID…';
  input.setAttribute('aria-label', title.textContent);
  const results = document.createElement('div');
  results.className = 'search-results';
  results.setAttribute('role', 'list');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'secondary search-close';
  close.textContent = language === 'zh' ? '关闭' : 'Close';

  const render = () => {
    const favorites = readStoredIds(localStorage, FAVORITES_KEY);
    const items = searchTools(input.value, language).map(tool => {
      const row = document.createElement('div');
      row.className = 'search-result';
      row.setAttribute('role', 'listitem');
      const link = document.createElement('a');
      link.href = toolHref(tool, language);
      const name = document.createElement('strong');
      name.textContent = tool.name[language];
      const description = document.createElement('span');
      description.textContent = tool.description[language];
      link.append(name, description);
      const favorite = document.createElement('button');
      favorite.type = 'button';
      favorite.className = 'favorite-button secondary';
      favorite.setAttribute('aria-label', `${favorites.includes(tool.id) ? (language === 'zh' ? '取消收藏' : 'Remove favorite') : (language === 'zh' ? '收藏' : 'Add favorite')} ${tool.name[language]}`);
      favorite.textContent = favorites.includes(tool.id) ? '★' : '☆';
      favorite.addEventListener('click', () => { toggleFavorite(localStorage, tool.id); render(); renderSavedTools(); });
      row.append(link, favorite);
      return row;
    });
    results.replaceChildren(...items);
  };
  input.addEventListener('input', render);
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.append(title, input, results, close);
  document.body.appendChild(dialog);
  render();
  return { dialog, input, render };
}

function attachNavigation(search) {
  const nav = document.querySelector('.nav-shell');
  const links = nav?.querySelector('.platform-nav, .nav-links');
  if (!nav || !links) return;
  let toggle = nav.querySelector('.mobile-nav-toggle');
  if (!toggle) {
    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'mobile-nav-toggle secondary';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'primaryNavLinks');
    toggle.setAttribute('aria-label', pageLanguage() === 'zh' ? '打开导航菜单' : 'Open navigation menu');
    toggle.textContent = '☰';
    links.id = 'primaryNavLinks';
    nav.insertBefore(toggle, links);
    toggle.addEventListener('click', () => {
      const open = links.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  }
  nav.querySelectorAll('.search-trigger').forEach(button => button.addEventListener('click', () => {
    search.render();
    search.dialog.showModal();
    search.input.focus();
  }));
}

function attachSite() {
  renderRelatedTools();
  const search = createSearchDialog();
  attachNavigation(search);
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      search.render();
      search.dialog.showModal();
      search.input.focus();
    }
    if (event.key === 'Escape' && search.dialog.open) search.dialog.close();
  });
  const match = location.pathname.match(/^\/(?:zh\/)?([^/]+)\/$/);
  if (match && globalThis.UTILCOVER_TOOLS?.some(tool => tool.id === match[1])) recordRecent(localStorage, match[1]);
  renderSavedTools();
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', attachSite);
if (typeof module !== 'undefined' && module.exports) module.exports = { renderRelatedTools, searchTools, readStoredIds, toggleFavorite, recordRecent };
