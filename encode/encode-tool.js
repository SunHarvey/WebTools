'use strict';

const ENCODE_MESSAGES = {
  done: { en: 'Done', zh: '完成' },
  failed: { en: 'Conversion failed', zh: '转换失败' },
  swapped: { en: 'Swapped', zh: '已交换' },
  ready: { en: 'Ready', zh: '就绪' },
  copied: { en: 'Copied', zh: '已复制' },
  copyFailed: { en: 'Copy failed', zh: '复制失败' },
};

function encodeMessage(key, language) {
  const locale = String(language).toLowerCase().startsWith('zh') ? 'zh' : 'en';
  return ENCODE_MESSAGES[key][locale];
}

function bytesToBinary(bytes) {
  let binary = '';
  const size = 0x8000;
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode(...bytes.subarray(index, index + size));
  }
  return binary;
}

function encodeBase64(value) {
  return btoa(bytesToBinary(new TextEncoder().encode(String(value))));
}

function decodeBase64(value) {
  let input = String(value).replace(/\s/gu, '');
  if (input.length === 0) return '';
  if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(input) || input.length % 4 === 1) throw new Error('Invalid Base64 input.');
  if (input.length % 4 !== 0) input += '='.repeat(4 - (input.length % 4));
  let binary;
  try { binary = atob(input); } catch { throw new Error('Invalid Base64 input.'); }
  if (btoa(binary) !== input) throw new Error('Invalid Base64 input.');
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('Base64 data is not valid UTF-8 text.'); }
}

function encodeUrl(value) {
  return encodeURIComponent(String(value));
}

function decodeUrl(value) {
  return decodeURIComponent(String(value));
}

function attachEncodeTool() {
  const language = document.documentElement.lang;
  const input = document.getElementById('encodeInput');
  const output = document.getElementById('encodeOutput');
  const status = document.getElementById('encodeStatus');
  if (!input || !output || !status) return;
  const run = operation => {
    try { output.value = operation(input.value); status.textContent = encodeMessage('done', language); status.dataset.state = 'success'; }
    catch (error) {
      output.value = '';
      status.textContent = String(language).toLowerCase().startsWith('zh') ? encodeMessage('failed', language) : (error instanceof Error ? error.message : encodeMessage('failed', language));
      status.dataset.state = 'error';
    }
  };
  document.getElementById('base64Encode').addEventListener('click', () => run(encodeBase64));
  document.getElementById('base64Decode').addEventListener('click', () => run(decodeBase64));
  document.getElementById('urlEncode').addEventListener('click', () => run(encodeUrl));
  document.getElementById('urlDecode').addEventListener('click', () => run(decodeUrl));
  document.getElementById('swapEncode').addEventListener('click', () => { [input.value, output.value] = [output.value, input.value]; status.textContent = encodeMessage('swapped', language); });
  document.getElementById('clearEncode').addEventListener('click', () => { input.value = ''; output.value = ''; status.textContent = encodeMessage('ready', language); });
  document.getElementById('copyEncode').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(output.value); status.textContent = encodeMessage('copied', language); }
    catch { status.textContent = encodeMessage('copyFailed', language); status.dataset.state = 'error'; }
  });
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', attachEncodeTool);
if (typeof module !== 'undefined' && module.exports) module.exports = { encodeBase64, decodeBase64, encodeUrl, decodeUrl, encodeMessage };
