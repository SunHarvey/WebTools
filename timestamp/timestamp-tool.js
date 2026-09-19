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
  if (!['auto', 'seconds', 'milliseconds', 'microseconds', 'nanoseconds'].includes(unit)) throw new RangeError('Timestamp unit is invalid.');
  if (unit === 'microseconds' || unit === 'nanoseconds') {
    if (!/^-?\d+$/.test(text)) throw new TypeError('Microsecond and nanosecond timestamps must be integers.');
    const exact = BigInt(text);
    const scale = unit === 'microseconds' ? 1000n : 1_000_000n;
    const floorDivide = (number, divisor) => {
      const quotient = number / divisor;
      return number < 0n && number % divisor !== 0n ? quotient - 1n : quotient;
    };
    const millisecondsBigInt = floorDivide(exact, scale);
    const milliseconds = Number(millisecondsBigInt);
    const result = resultFromMilliseconds(milliseconds);
    const microseconds = unit === 'microseconds' ? exact : floorDivide(exact, 1000n);
    const nanoseconds = unit === 'nanoseconds' ? exact : exact * 1000n;
    return { ...result, microseconds: microseconds.toString(), nanoseconds: nanoseconds.toString() };
  }
  const numeric = Number(text);
  if (!Number.isFinite(numeric)) throw new TypeError('Timestamp must be numeric.');
  const isSeconds = unit === 'seconds' || (unit === 'auto' && Math.abs(numeric) < 100_000_000_000);
  return resultFromMilliseconds(isSeconds ? numeric * 1000 : numeric);
}

function formatInTimezone(milliseconds, timeZone = 'UTC', locales) {
  try {
    return new Intl.DateTimeFormat(locales, {
      timeZone,
      dateStyle: 'full',
      timeStyle: 'long',
      hourCycle: 'h23',
    }).format(new Date(milliseconds));
  } catch (error) {
    throw new RangeError(`Invalid timezone: ${timeZone}`);
  }
}

function dateToUnix(value) {
  const milliseconds = value instanceof Date ? value.getTime() : Date.parse(String(value));
  if (!Number.isFinite(milliseconds)) throw new TypeError('Enter a valid date and time.');
  return resultFromMilliseconds(milliseconds);
}

function utcMilliseconds(parts, millisecond = parts.millisecond || 0) {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, parts.second, millisecond);
  return date.getTime();
}

function parseDateTimeLocal(value) {
  const match = String(value).trim().match(/^(\d{4,6})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
  if (!match) throw new TypeError('Enter a valid local date and time.');
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0', fractionText = '0'] = match;
  const parts = {
    year: Number(yearText), month: Number(monthText), day: Number(dayText), hour: Number(hourText),
    minute: Number(minuteText), second: Number(secondText), millisecond: Number(fractionText.padEnd(3, '0')),
  };
  if (parts.year < 1) throw new TypeError('Enter a valid local date and time.');
  const check = new Date(utcMilliseconds(parts));
  if (check.getUTCFullYear() !== parts.year || check.getUTCMonth() + 1 !== parts.month || check.getUTCDate() !== parts.day ||
      check.getUTCHours() !== parts.hour || check.getUTCMinutes() !== parts.minute || check.getUTCSeconds() !== parts.second) {
    throw new TypeError('Enter a valid local date and time.');
  }
  return parts;
}

function timezoneParts(milliseconds, timeZone) {
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
  } catch {
    throw new RangeError(`Invalid timezone: ${timeZone}`);
  }
  const values = Object.fromEntries(formatter.formatToParts(new Date(milliseconds))
    .filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  return { year: values.year, month: values.month, day: values.day, hour: values.hour, minute: values.minute, second: values.second };
}

function dateTimeInZoneToUnix(value, timeZone) {
  const parts = parseDateTimeLocal(value);
  const zone = timeZone === 'local' ? (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC') : timeZone;
  const naive = utcMilliseconds(parts, 0);
  const offsets = new Set();
  for (let delta = -36; delta <= 36; delta += 6) {
    const sample = naive + delta * 3_600_000;
    const shown = timezoneParts(sample, zone);
    offsets.add(utcMilliseconds({ ...shown, millisecond: 0 }) - sample);
  }
  const matches = [...offsets].map(offset => naive - offset + parts.millisecond).filter(candidate => {
    const shown = timezoneParts(candidate, zone);
    return ['year', 'month', 'day', 'hour', 'minute', 'second'].every(key => shown[key] === parts[key]);
  }).sort((a, b) => a - b);
  if (!matches.length) throw new RangeError(`This local time does not exist in ${zone} because of a timezone transition.`);
  return resultFromMilliseconds(matches[0]);
}

function formatDateTimeInputInZone(milliseconds, timeZone) {
  const parts = timezoneParts(milliseconds, timeZone);
  const pad = value => String(value).padStart(2, '0');
  return `${String(parts.year).padStart(4, '0')}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

function attachTimestampTool() {
  const language = document.documentElement.lang;
  const unixInput = document.getElementById('unixInput');
  const unixUnit = document.getElementById('unixUnit');
  const dateInput = document.getElementById('dateInput');
  const timezoneSelect = document.getElementById('timezoneSelect');
  const status = document.getElementById('timestampStatus');
  if (!unixInput || !unixUnit || !dateInput || !timezoneSelect || !status) return;
  let currentResult = null;
  const selectedZone = () => timezoneSelect.value === 'local' ? (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC') : timezoneSelect.value;

  const render = result => {
    currentResult = result;
    const milliseconds = BigInt(result.milliseconds);
    document.getElementById('resultSeconds').textContent = String(result.seconds);
    document.getElementById('resultMilliseconds').textContent = String(result.milliseconds);
    document.getElementById('resultMicroseconds').textContent = result.microseconds || String(milliseconds * 1000n);
    document.getElementById('resultNanoseconds').textContent = result.nanoseconds || String(milliseconds * 1_000_000n);
    document.getElementById('resultIso').textContent = result.iso;
    document.getElementById('resultLocal').textContent = formatInTimezone(result.milliseconds, selectedZone());
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
  document.getElementById('convertDate').addEventListener('click', () => run(() => dateTimeInZoneToUnix(dateInput.value, selectedZone())));
  document.getElementById('useCurrentTime').addEventListener('click', () => {
    const now = new Date();
    unixInput.value = String(now.getTime());
    dateInput.value = formatDateTimeInputInZone(now.getTime(), selectedZone());
    render(resultFromMilliseconds(now.getTime()));
  });
  document.querySelectorAll('[data-copy-target]').forEach(button => button.addEventListener('click', async () => {
    const value = document.getElementById(button.dataset.copyTarget)?.textContent || '';
    try { await navigator.clipboard.writeText(value); status.textContent = timestampMessage('copied', language); }
    catch { status.textContent = timestampMessage('copyFailed', language); status.dataset.state = 'error'; }
  }));
  timezoneSelect.addEventListener('change', () => {
    if (currentResult) render(currentResult);
  });
  document.getElementById('useCurrentTime').click();
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', attachTimestampTool);
if (typeof module !== 'undefined' && module.exports) module.exports = {
  parseUnixTimestamp,
  dateToUnix,
  dateTimeInZoneToUnix,
  formatDateTimeInputInZone,
  timestampMessage,
  formatInTimezone,
};
