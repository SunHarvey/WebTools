'use strict';

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
  const input = document.getElementById('jsonInput');
  const output = document.getElementById('jsonOutput');
  const status = document.getElementById('jsonStatus');
  const indent = document.getElementById('jsonIndent');
  if (!input || !output || !status || !indent) return;

  const run = operation => {
    try {
      output.value = operation(input.value);
      status.textContent = 'Valid JSON';
      status.dataset.state = 'success';
    } catch (error) {
      output.value = '';
      status.textContent = error instanceof Error ? error.message : 'Invalid JSON.';
      status.dataset.state = 'error';
    }
  };

  document.getElementById('formatJson').addEventListener('click', () => run(value => formatJson(value, Number(indent.value))));
  document.getElementById('minifyJson').addEventListener('click', () => run(minifyJson));
  document.getElementById('validateJson').addEventListener('click', () => {
    const result = validateJson(input.value);
    status.textContent = result.valid ? 'Valid JSON' : result.error;
    status.dataset.state = result.valid ? 'success' : 'error';
  });
  document.getElementById('copyJson').addEventListener('click', async () => {
    try {
      await copyText(output.value);
      status.textContent = 'Copied';
      status.dataset.state = 'success';
    } catch {
      status.textContent = 'Copy failed';
      status.dataset.state = 'error';
    }
  });
  document.getElementById('clearJson').addEventListener('click', () => {
    input.value = '';
    output.value = '';
    status.textContent = 'Ready';
    status.dataset.state = '';
  });
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', attachJsonTool);
if (typeof module !== 'undefined' && module.exports) module.exports = { formatJson, minifyJson, validateJson };
