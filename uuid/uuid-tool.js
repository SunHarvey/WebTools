'use strict';

function uuidFromBytes(source, { uppercase = false, hyphens = true } = {}) {
  if (!(source instanceof Uint8Array) || source.length !== 16) throw new TypeError('UUID requires exactly 16 random bytes.');
  const bytes = new Uint8Array(source);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  const value = hyphens ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` : hex;
  return uppercase ? value.toUpperCase() : value;
}

function generateUuid({ cryptoApi = globalThis.crypto, uppercase = false, hyphens = true } = {}) {
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') throw new Error('Secure random generation is unavailable.');
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  return uuidFromBytes(bytes, { uppercase, hyphens });
}

function generateUuids(count, options = {}) {
  const amount = Number(count);
  if (!Number.isInteger(amount) || amount < 1 || amount > 100) throw new RangeError('UUID count must be an integer from 1 to 100.');
  return Array.from({ length: amount }, () => generateUuid(options));
}

function attachUuidTool() {
  const count = document.getElementById('uuidCount');
  const output = document.getElementById('uuidOutput');
  const status = document.getElementById('uuidStatus');
  if (!count || !output || !status) return;
  const generate = () => {
    try {
      const values = generateUuids(Number(count.value), {
        uppercase: document.getElementById('uuidUppercase').checked,
        hyphens: document.getElementById('uuidHyphens').checked,
      });
      output.value = values.join('\n');
      status.textContent = `${values.length} UUID${values.length === 1 ? '' : 's'} generated`;
      status.dataset.state = 'success';
    } catch (error) {
      output.value = '';
      status.textContent = error instanceof Error ? error.message : 'Generation failed';
      status.dataset.state = 'error';
    }
  };
  document.getElementById('generateUuid').addEventListener('click', generate);
  document.getElementById('copyUuid').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(output.value); status.textContent = 'Copied'; }
    catch { status.textContent = 'Copy failed'; status.dataset.state = 'error'; }
  });
  document.getElementById('clearUuid').addEventListener('click', () => { output.value = ''; status.textContent = 'Ready'; });
  generate();
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', attachUuidTool);
if (typeof module !== 'undefined' && module.exports) module.exports = { uuidFromBytes, generateUuid, generateUuids };
