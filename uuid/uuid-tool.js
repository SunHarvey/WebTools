'use strict';

const UUID_MESSAGES = {
  copied: { en: 'Copied', zh: '已复制' },
  copyFailed: { en: 'Copy failed', zh: '复制失败' },
  ready: { en: 'Ready', zh: '就绪' },
  failed: { en: 'Generation failed', zh: '生成失败' },
};

function uuidMessage(key, language, parameters = {}) {
  const locale = String(language).toLowerCase().startsWith('zh') ? 'zh' : 'en';
  if (key === 'generated') return locale === 'zh' ? `已生成 ${parameters.count} 个 UUID` : `${parameters.count} UUID${parameters.count === 1 ? '' : 's'} generated`;
  return UUID_MESSAGES[key][locale];
}

function formatUuidBytes(bytes, { uppercase = false, hyphens = true } = {}) {
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  const value = hyphens ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` : hex;
  return uppercase ? value.toUpperCase() : value;
}

function uuidFromBytes(source, { uppercase = false, hyphens = true } = {}) {
  if (!(source instanceof Uint8Array) || source.length !== 16) throw new TypeError('UUID requires exactly 16 random bytes.');
  const bytes = new Uint8Array(source);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return formatUuidBytes(bytes, { uppercase, hyphens });
}

function generateUuid({ cryptoApi = globalThis.crypto, uppercase = false, hyphens = true } = {}) {
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') throw new Error('Secure random generation is unavailable.');
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  return uuidFromBytes(bytes, { uppercase, hyphens });
}

function generateUuidV7({ cryptoApi = globalThis.crypto, timestamp = Date.now(), uppercase = false, hyphens = true } = {}) {
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') throw new Error('Secure random generation is unavailable.');
  const time = Number(timestamp);
  if (!Number.isSafeInteger(time) || time < 0 || time > 0xffffffffffff) throw new RangeError('UUID v7 timestamp must fit in 48 bits.');
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  let remaining = BigInt(time);
  for (let index = 5; index >= 0; index -= 1) { bytes[index] = Number(remaining & 0xffn); remaining >>= 8n; }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return formatUuidBytes(bytes, { uppercase, hyphens });
}

function generateUuids(count, options = {}) {
  const amount = Number(count);
  if (!Number.isInteger(amount) || amount < 1 || amount > 1000) throw new RangeError('UUID count must be an integer from 1 to 1000.');
  const generator = options.version === 'v7' ? generateUuidV7 : generateUuid;
  return Array.from({ length: amount }, () => generator(options));
}

function attachUuidTool() {
  const language = document.documentElement.lang;
  const count = document.getElementById('uuidCount');
  const version = document.getElementById('uuidVersion');
  const output = document.getElementById('uuidOutput');
  const status = document.getElementById('uuidStatus');
  if (!count || !version || !output || !status) return;
  const generate = () => {
    try {
      const values = generateUuids(Number(count.value), {
        version: version.value,
        uppercase: document.getElementById('uuidUppercase').checked,
        hyphens: document.getElementById('uuidHyphens').checked,
      });
      output.value = values.join('\n');
      status.textContent = uuidMessage('generated', language, { count: values.length });
      status.dataset.state = 'success';
    } catch (error) {
      output.value = '';
      status.textContent = String(language).toLowerCase().startsWith('zh') ? uuidMessage('failed', language) : (error instanceof Error ? error.message : uuidMessage('failed', language));
      status.dataset.state = 'error';
    }
  };
  document.getElementById('generateUuid').addEventListener('click', generate);
  document.getElementById('copyUuid').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(output.value); status.textContent = uuidMessage('copied', language); }
    catch { status.textContent = uuidMessage('copyFailed', language); status.dataset.state = 'error'; }
  });
  document.getElementById('downloadUuid').addEventListener('click', () => {
    if (!output.value) return;
    const url = URL.createObjectURL(new Blob([`${output.value}\n`], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `utilcover-uuid-${version.value}.txt`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });
  document.getElementById('clearUuid').addEventListener('click', () => { output.value = ''; status.textContent = uuidMessage('ready', language); });
  generate();
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', attachUuidTool);
if (typeof module !== 'undefined' && module.exports) module.exports = { uuidFromBytes, generateUuid, generateUuidV7, generateUuids, uuidMessage };
