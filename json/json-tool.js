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

function validateJson(input) {
  try {
    return { valid: true, value: parseJson(input) };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Invalid JSON.' };
  }
}

async function copyText(value) {
  if (!navigator.clipboard?.writeText) throw new Error('Clipboard API is unavailable.');
  await navigator.clipboard.writeText(value);
}

function attachJsonTool() {
  const language = document.documentElement.lang;
  const input = document.getElementById('jsonInput');
  const output = document.getElementById('jsonOutput');
  const status = document.getElementById('jsonStatus');
  const indent = document.getElementById('jsonIndent');
  if (!input || !output || !status || !indent) return;

  const run = operation => {
    try {
      output.value = operation(input.value);
      status.textContent = jsonMessage('valid', language);
      status.dataset.state = 'success';
    } catch (error) {
      output.value = '';
      status.textContent = String(language).toLowerCase().startsWith('zh')
        ? jsonMessage('invalid', language)
        : (error instanceof Error ? error.message : jsonMessage('invalid', language));
      status.dataset.state = 'error';
    }
  };

  document.getElementById('formatJson').addEventListener('click', () => run(value => formatJson(value, Number(indent.value))));
  document.getElementById('minifyJson').addEventListener('click', () => run(minifyJson));
  document.getElementById('validateJson').addEventListener('click', () => {
    const result = validateJson(input.value);
    status.textContent = result.valid ? jsonMessage('valid', language) : (String(language).toLowerCase().startsWith('zh') ? jsonMessage('invalid', language) : result.error);
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
    status.textContent = jsonMessage('ready', language);
    status.dataset.state = '';
  });
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', attachJsonTool);
if (typeof module !== 'undefined' && module.exports) module.exports = { formatJson, minifyJson, validateJson, jsonMessage };
