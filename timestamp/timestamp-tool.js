'use strict';

const TIMESTAMP_MESSAGES = {
  converted: { en: 'Converted', zh: '转换完成' },
  failed: { en: 'Conversion failed', zh: '转换失败' },
  copied: { en: 'Copied', zh: '已复制' },
  copyFailed: { en: 'Copy failed', zh: '复制失败' },
  localTime: { en: 'Local time', zh: '本地时间' },
};

function timestampMessage(key, language) {
  const locale = String(language).toLowerCase().startsWith('zh') ? 'zh' : 'en';
  return TIMESTAMP_MESSAGES[key][locale];
}

function resultFromMilliseconds(milliseconds) {
  const date = new Date(milliseconds);
  const normalizedMilliseconds = date.getTime();
  if (!Number.isFinite(milliseconds) || Number.isNaN(normalizedMilliseconds)) throw new RangeError('Timestamp is outside the supported date range.');
  return { seconds: Math.floor(normalizedMilliseconds / 1000), milliseconds: normalizedMilliseconds, iso: date.toISOString() };
}

function parseUnixTimestamp(value, unit = 'auto') {
  const text = String(value).trim();
  if (text === '') throw new TypeError('Enter a Unix timestamp.');
  const numeric = Number(text);
  if (!Number.isFinite(numeric)) throw new TypeError('Timestamp must be numeric.');
  if (!['auto', 'seconds', 'milliseconds'].includes(unit)) throw new RangeError('Timestamp unit is invalid.');
  const isSeconds = unit === 'seconds' || (unit === 'auto' && Math.abs(numeric) < 100_000_000_000);
  return resultFromMilliseconds(isSeconds ? numeric * 1000 : numeric);
}

function dateToUnix(value) {
  const milliseconds = value instanceof Date ? value.getTime() : Date.parse(String(value));
  if (!Number.isFinite(milliseconds)) throw new TypeError('Enter a valid date and time.');
  return resultFromMilliseconds(milliseconds);
}

function attachTimestampTool() {
  const language = document.documentElement.lang;
  const unixInput = document.getElementById('unixInput');
  const unixUnit = document.getElementById('unixUnit');
  const dateInput = document.getElementById('dateInput');
  const status = document.getElementById('timestampStatus');
  if (!unixInput || !unixUnit || !dateInput || !status) return;

  const render = result => {
    document.getElementById('resultSeconds').textContent = String(result.seconds);
    document.getElementById('resultMilliseconds').textContent = String(result.milliseconds);
    document.getElementById('resultIso').textContent = result.iso;
    document.getElementById('resultLocal').textContent = new Date(result.milliseconds).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' });
    status.textContent = timestampMessage('converted', language);
    status.dataset.state = 'success';
  };
  const run = operation => {
    try { render(operation()); }
    catch (error) {
      status.textContent = String(language).toLowerCase().startsWith('zh') ? timestampMessage('failed', language) : (error instanceof Error ? error.message : timestampMessage('failed', language));
      status.dataset.state = 'error';
    }
  };

  document.getElementById('convertUnix').addEventListener('click', () => run(() => parseUnixTimestamp(unixInput.value, unixUnit.value)));
  document.getElementById('convertDate').addEventListener('click', () => run(() => dateToUnix(dateInput.value)));
  document.getElementById('useCurrentTime').addEventListener('click', () => {
    const now = new Date();
    unixInput.value = String(now.getTime());
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    dateInput.value = local;
    render(resultFromMilliseconds(now.getTime()));
  });
  document.querySelectorAll('[data-copy-target]').forEach(button => button.addEventListener('click', async () => {
    const value = document.getElementById(button.dataset.copyTarget)?.textContent || '';
    try { await navigator.clipboard.writeText(value); status.textContent = timestampMessage('copied', language); }
    catch { status.textContent = timestampMessage('copyFailed', language); status.dataset.state = 'error'; }
  }));
  document.getElementById('currentTimezone').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || timestampMessage('localTime', language);
  document.getElementById('useCurrentTime').click();
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', attachTimestampTool);
if (typeof module !== 'undefined' && module.exports) module.exports = { parseUnixTimestamp, dateToUnix, timestampMessage };
