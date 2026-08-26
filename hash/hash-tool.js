'use strict';

const SUPPORTED_ALGORITHMS = new Set(['SHA-256', 'SHA-384', 'SHA-512']);
const MAX_FILE_BYTES = 32 * 1024 * 1024;

function normalizeAlgorithm(algorithm) {
  const value = String(algorithm).toUpperCase();
  if (!SUPPORTED_ALGORITHMS.has(value)) throw new RangeError('Unsupported hash algorithm.');
  return value;
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function hashBuffer(value, algorithm = 'SHA-256', cryptoApi = globalThis.crypto) {
  const name = normalizeAlgorithm(algorithm);
  if (!cryptoApi?.subtle?.digest) throw new Error('Web Crypto digest is unavailable.');
  const data = value instanceof ArrayBuffer
    ? value
    : ArrayBuffer.isView(value)
      ? value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
      : new Uint8Array(value).buffer;
  return toHex(await cryptoApi.subtle.digest(name, data));
}

async function hashText(value, algorithm = 'SHA-256', cryptoApi = globalThis.crypto) {
  return hashBuffer(new TextEncoder().encode(String(value)), algorithm, cryptoApi);
}

function compareHash(actual, expected) {
  return String(actual).trim().toLowerCase() === String(expected).trim().toLowerCase();
}

function validateFileSize(size) {
  if (!Number.isFinite(size) || size < 0) throw new TypeError('File size is invalid.');
  if (size > MAX_FILE_BYTES) throw new RangeError('Files larger than 32 MiB are not supported.');
}

function createLatestTaskRunner({ onStart = () => {}, onSuccess = () => {}, onError = () => {} } = {}) {
  let latestTask = 0;
  return async operation => {
    const task = ++latestTask;
    onStart();
    try {
      const value = await operation();
      if (task === latestTask) onSuccess(value);
      return value;
    } catch (error) {
      if (task === latestTask) onError(error);
      return undefined;
    }
  };
}

function attachHashTool() {
  const text = document.getElementById('hashText');
  const file = document.getElementById('hashFile');
  const algorithm = document.getElementById('hashAlgorithm');
  const output = document.getElementById('hashOutput');
  const expected = document.getElementById('expectedHash');
  const status = document.getElementById('hashStatus');
  if (!text || !file || !algorithm || !output || !expected || !status) return;

  const run = createLatestTaskRunner({
    onStart: () => {
      status.textContent = 'Calculating…';
      status.dataset.state = '';
    },
    onSuccess: value => {
      output.value = value;
      status.textContent = 'Hash calculated locally';
      status.dataset.state = 'success';
    },
    onError: error => {
      output.value = '';
      status.textContent = error instanceof Error ? error.message : 'Hashing failed';
      status.dataset.state = 'error';
    },
  });

  document.getElementById('hashTextButton').addEventListener('click', () => run(() => hashText(text.value, algorithm.value)));
  document.getElementById('hashFileButton').addEventListener('click', () => run(async () => {
    const selected = file.files[0];
    if (!selected) throw new Error('Choose a file first.');
    validateFileSize(selected.size);
    return hashBuffer(await selected.arrayBuffer(), algorithm.value);
  }));
  document.getElementById('compareHash').addEventListener('click', () => {
    if (!output.value || !expected.value.trim()) { status.textContent = 'Calculate and enter both hashes first'; status.dataset.state = 'error'; return; }
    const matches = compareHash(output.value, expected.value);
    status.textContent = matches ? 'Hashes match' : 'Hashes do not match';
    status.dataset.state = matches ? 'success' : 'error';
  });
  document.getElementById('copyHash').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(output.value); status.textContent = 'Copied'; }
    catch { status.textContent = 'Copy failed'; status.dataset.state = 'error'; }
  });
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', attachHashTool);
if (typeof module !== 'undefined' && module.exports) module.exports = { hashText, hashBuffer, compareHash, validateFileSize, createLatestTaskRunner };
