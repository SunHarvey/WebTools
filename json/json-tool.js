'use strict';

const JSON_MESSAGES = {
  valid: { en: 'Valid JSON', zh: 'JSON 有效' },
  invalid: { en: 'Invalid JSON.', zh: 'JSON 无效。' },
  copied: { en: 'Copied', zh: '已复制' },
  copyFailed: { en: 'Copy failed', zh: '复制失败' },
  ready: { en: 'Ready', zh: '就绪' },
};

function jsonMessage(key, language) {
  const locale = String(language).toLowerCase().startsWith('zh') ? 'zh' : 'en';
  return JSON_MESSAGES[key][locale];
}

function parseJson(input) {
  if (typeof input !== 'string') throw new TypeError('JSON input must be text.');
  return JSON.parse(input);
}

function formatJson(input, indent = 2) {
  const spacing = Number(indent);
  if (![2, 4].includes(spacing)) throw new RangeError('Indentation must be 2 or 4 spaces.');
  return JSON.stringify(parseJson(input), null, spacing);
}

function minifyJson(input) {
  return JSON.stringify(parseJson(input));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function highlightJson(input) {
  const source = String(input);
  const tokenPattern = /"(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(?=\s*:)|"(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b/g;
  let result = '';
  let cursor = 0;
  for (const match of source.matchAll(tokenPattern)) {
    result += escapeHtml(source.slice(cursor, match.index));
    const token = match[0];
    const following = source.slice(match.index + token.length);
    const type = token.startsWith('"') ? (/^\s*:/.test(following) ? 'key' : 'string') : token === 'null' ? 'null' : /^(true|false)$/.test(token) ? 'boolean' : 'number';
    result += `<span class="json-${type}">${escapeHtml(token)}</span>`;
    cursor = match.index + token.length;
  }
  return result + escapeHtml(source.slice(cursor));
}

function lineColumnAt(source, position) {
  const prefix = String(source).slice(0, Math.max(0, position));
  const lines = prefix.split('\n');
  return { line: lines.length, column: lines.at(-1).length + 1 };
}

function locateJsonError(input, suppliedError) {
  const source = String(input);
  let error = suppliedError;
  if (!error) {
    try { JSON.parse(source); return null; }
    catch (caught) { error = caught; }
  }
  const reason = error instanceof Error ? error.message : 'Invalid JSON.';
  const explicit = reason.match(/line\s+(\d+)[^\d]+column\s+(\d+)/i);
  if (explicit) return { reason, line: Number(explicit[1]), column: Number(explicit[2]) };
  const position = reason.match(/position\s+(\d+)/i);
  if (position) return { reason, ...lineColumnAt(source, Number(position[1])) };
  const unexpected = reason.match(/Unexpected token\s+['"]?(.?)['"]?/i);
  const offset = unexpected?.[1] ? source.indexOf(unexpected[1]) : source.length;
  return { reason, ...lineColumnAt(source, offset < 0 ? source.length : offset) };
}

function buildJsonTree(value) {
  if (Array.isArray(value)) return { type: 'array', children: value.map((item, index) => ({ key: String(index), node: buildJsonTree(item) })) };
  if (value !== null && typeof value === 'object') return { type: 'object', children: Object.entries(value).map(([key, item]) => ({ key, node: buildJsonTree(item) })) };
  return { type: value === null ? 'null' : typeof value, value };
}

function tabIndexForKey(currentIndex, key, length) {
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  if (key === 'ArrowRight') return (currentIndex + 1) % length;
  if (key === 'ArrowLeft') return (currentIndex - 1 + length) % length;
  return null;
}

function validateJson(input) {
  try {
    return { valid: true, value: parseJson(input) };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Invalid JSON.', ...locateJsonError(input, error) };
  }
}

async function copyText(value) {
  if (!navigator.clipboard?.writeText) throw new Error('Clipboard API is unavailable.');
  await navigator.clipboard.writeText(value);
}

function renderTreeNode(model, depth = 0) {
  if (!model.children) {
    const value = document.createElement('span');
    value.className = `json-${model.type}`;
    value.textContent = model.type === 'string' ? `"${model.value}"` : String(model.value);
    return value;
  }
  const details = document.createElement('details');
  details.open = depth < 2;
  const summary = document.createElement('summary');
  summary.textContent = `${model.type === 'array' ? '[' : '{'} ${model.children.length} ${model.children.length === 1 ? 'item' : 'items'} ${model.type === 'array' ? ']' : '}'}`;
  details.appendChild(summary);
  const list = document.createElement('ul');
  model.children.forEach(child => {
    const item = document.createElement('li');
    const key = document.createElement('span');
    key.className = 'json-key';
    key.textContent = `${child.key}: `;
    item.append(key, renderTreeNode(child.node, depth + 1));
    list.appendChild(item);
  });
  details.appendChild(list);
  return details;
}

function attachJsonTool() {
  const language = document.documentElement.lang;
  const input = document.getElementById('jsonInput');
  const output = document.getElementById('jsonOutput');
  const highlighted = document.getElementById('jsonHighlighted');
  const textView = document.getElementById('jsonTextView');
  const treeView = document.getElementById('jsonTreeView');
  const showText = document.getElementById('showJsonText');
  const showTree = document.getElementById('showJsonTree');
  const status = document.getElementById('jsonStatus');
  const indent = document.getElementById('jsonIndent');
  if (!input || !output || !highlighted || !treeView || !status || !indent) return;

  const selectView = tree => {
    textView.hidden = tree;
    treeView.hidden = !tree;
    showText.setAttribute('aria-selected', String(!tree));
    showTree.setAttribute('aria-selected', String(tree));
    showText.tabIndex = tree ? -1 : 0;
    showTree.tabIndex = tree ? 0 : -1;
  };
  const renderResult = value => {
    output.value = value;
    highlighted.innerHTML = highlightJson(value);
    const parsed = parseJson(value);
    treeView.replaceChildren(renderTreeNode(buildJsonTree(parsed)));
  };
  const run = operation => {
    try {
      renderResult(operation(input.value));
      status.textContent = jsonMessage('valid', language);
      status.dataset.state = 'success';
    } catch (error) {
      output.value = '';
      highlighted.textContent = '';
      treeView.replaceChildren();
      const location = locateJsonError(input.value, error);
      const prefix = String(language).toLowerCase().startsWith('zh') ? `第 ${location.line} 行，第 ${location.column} 列：` : `Line ${location.line}, column ${location.column}: `;
      status.textContent = `${prefix}${location.reason}`;
      status.dataset.state = 'error';
    }
  };

  document.getElementById('formatJson').addEventListener('click', () => run(value => formatJson(value, Number(indent.value))));
  document.getElementById('minifyJson').addEventListener('click', () => run(minifyJson));
  showText.addEventListener('click', () => selectView(false));
  showTree.addEventListener('click', () => selectView(true));
  const tabs = [showText, showTree];
  tabs.forEach((tab, index) => tab.addEventListener('keydown', event => {
    const nextIndex = tabIndexForKey(index, event.key, tabs.length);
    if (nextIndex === null) return;
    event.preventDefault();
    selectView(nextIndex === 1);
    tabs[nextIndex].focus();
  }));
  document.getElementById('validateJson').addEventListener('click', () => {
    const result = validateJson(input.value);
    status.textContent = result.valid ? jsonMessage('valid', language) : (String(language).toLowerCase().startsWith('zh') ? `第 ${result.line} 行，第 ${result.column} 列：${result.reason}` : `Line ${result.line}, column ${result.column}: ${result.reason}`);
    status.dataset.state = result.valid ? 'success' : 'error';
  });
  document.getElementById('copyJson').addEventListener('click', async () => {
    try {
      await copyText(output.value);
      status.textContent = jsonMessage('copied', language);
      status.dataset.state = 'success';
    } catch {
      status.textContent = jsonMessage('copyFailed', language);
      status.dataset.state = 'error';
    }
  });
  document.getElementById('clearJson').addEventListener('click', () => {
    input.value = '';
    output.value = '';
    highlighted.textContent = '';
    treeView.replaceChildren();
    selectView(false);
    status.textContent = jsonMessage('ready', language);
    status.dataset.state = '';
  });
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', attachJsonTool);
if (typeof module !== 'undefined' && module.exports) module.exports = { formatJson, minifyJson, validateJson, jsonMessage, highlightJson, locateJsonError, buildJsonTree, tabIndexForKey };
