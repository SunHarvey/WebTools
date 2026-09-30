'use strict';

const FIELD_SPECS = [
  ['minute', 0, 59], ['hour', 0, 23], ['dayOfMonth', 1, 31], ['month', 1, 12], ['dayOfWeek', 0, 7],
];
const DAY_MS = 86_400_000;
const MAX_EXPRESSION_LENGTH = 200;
const MAX_NEXT_COUNT = 10;
const SEARCH_DAYS = 366 * 6;

function parseField(source, name, minimum, maximum) {
  if (!source || source.length > 64) throw new TypeError(`Invalid ${name} field.`);
  const values = new Set();
  for (const item of source.split(',')) {
    if (!item) throw new TypeError(`Invalid ${name} field.`);
    const pieces = item.split('/');
    if (pieces.length > 2 || (pieces.length === 2 && !/^\d+$/.test(pieces[1]))) throw new TypeError(`Invalid ${name} field.`);
    const step = pieces.length === 2 ? Number(pieces[1]) : 1;
    if (!Number.isSafeInteger(step) || step < 1) throw new TypeError(`Invalid ${name} step.`);
    const base = pieces[0];
    let start; let end;
    if (base === '*') { start = minimum; end = maximum; }
    else if (/^\d+$/.test(base)) {
      if (pieces.length === 2) throw new TypeError(`A ${name} step must follow a wildcard or ascending range.`);
      start = Number(base);
      if (start < minimum || start > maximum) throw new RangeError(`${name} must be between ${minimum} and ${maximum}.`);
      end = start;
    } else {
      const range = base.match(/^(\d+)-(\d+)$/);
      if (!range) throw new TypeError(`Invalid ${name} field.`);
      start = Number(range[1]); end = Number(range[2]);
      if (start < minimum || end > maximum || start > end) throw new RangeError(`Invalid ${name} range.`);
    }
    for (let value = start; value <= end; value += step) values.add(name === 'dayOfWeek' && value === 7 ? 0 : value);
  }
  return { values, wildcard: source.startsWith('*') };
}

function parseCron(expression) {
  if (typeof expression !== 'string' || expression.length > MAX_EXPRESSION_LENGTH) throw new TypeError('Enter a cron expression of at most 200 characters.');
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5 || fields.some(field => !field)) throw new TypeError('Use exactly five fields: minute hour day-of-month month day-of-week.');
  const parsed = Object.fromEntries(fields.map((field, index) => {
    const [name, minimum, maximum] = FIELD_SPECS[index];
    return [name, parseField(field, name, minimum, maximum)];
  }));
  return { ...parsed, expression: expression.trim() };
}

function makeUtc(parts) {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour || 0, parts.minute || 0, 0, 0);
  return date.getTime();
}

function createZoneFormatter(timeZone) {
  try {
    return new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
  } catch {
    throw new RangeError(`Unknown timezone: ${timeZone}`);
  }
}

function partsAt(formatter, milliseconds) {
  const fields = Object.fromEntries(formatter.formatToParts(new Date(milliseconds))
    .filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  return { year: fields.year, month: fields.month, day: fields.day, hour: fields.hour, minute: fields.minute };
}

function resolveWallMinute(parts, formatter, offsets) {
  const wall = makeUtc(parts);
  const matches = [];
  for (const offset of offsets) {
    const candidate = wall - offset;
    const shown = partsAt(formatter, candidate);
    if (shown.year === parts.year && shown.month === parts.month && shown.day === parts.day && shown.hour === parts.hour && shown.minute === parts.minute) matches.push(candidate);
  }
  return [...new Set(matches)].sort((a, b) => a - b);
}

function offsetsForLocalDate(dateUtc, formatter) {
  const offsets = new Set();
  for (let hour = -36; hour <= 36; hour += 6) {
    const sample = dateUtc + hour * 3_600_000;
    const local = partsAt(formatter, sample);
    offsets.add(makeUtc(local) - sample);
  }
  return offsets;
}

function dayMatches(schedule, date) {
  if (!schedule.month.values.has(date.getUTCMonth() + 1)) return false;
  const dom = schedule.dayOfMonth.values.has(date.getUTCDate());
  const dow = schedule.dayOfWeek.values.has(date.getUTCDay());
  if (!schedule.dayOfMonth.wildcard && !schedule.dayOfWeek.wildcard) return dom || dow;
  return dom && dow;
}

function nextCronOccurrences(expression, { from = Date.now(), timeZone = 'UTC', count = 5 } = {}) {
  const schedule = parseCron(expression);
  const start = from instanceof Date ? from.getTime() : Number(from);
  if (!Number.isFinite(start)) throw new TypeError('Start time must be a valid date.');
  if (!Number.isInteger(count) || count < 1 || count > MAX_NEXT_COUNT) throw new RangeError(`Count must be between 1 and ${MAX_NEXT_COUNT}.`);
  const formatter = createZoneFormatter(timeZone);
  const startParts = partsAt(formatter, start);
  const startDate = makeUtc({ year: startParts.year, month: startParts.month, day: startParts.day });
  const startWall = makeUtc(startParts);
  const occurrences = [];
  const offsetCache = new Map();
  for (let day = 0; day < SEARCH_DAYS && occurrences.length < count; day += 1) {
    const dateUtc = startDate + day * DAY_MS;
    const date = new Date(dateUtc);
    if (!dayMatches(schedule, date)) continue;
    const dateKey = `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
    let offsets = offsetCache.get(dateKey);
    if (!offsets) { offsets = offsetsForLocalDate(dateUtc, formatter); offsetCache.set(dateKey, offsets); }
    for (const hour of [...schedule.hour.values].sort((a, b) => a - b)) {
      for (const minute of [...schedule.minute.values].sort((a, b) => a - b)) {
        const local = { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour, minute };
        if (day === 0 && makeUtc(local) < startWall - 2 * 3_600_000) continue;
        for (const instant of resolveWallMinute(local, formatter, offsets)) {
          if (instant > start && !occurrences.includes(instant)) occurrences.push(instant);
        }
      }
    }
    occurrences.sort((a, b) => a - b);
  }
  if (occurrences.length < count) throw new RangeError('No further occurrences found within the six-year search limit.');
  return occurrences.slice(0, count).map(milliseconds => ({ milliseconds, iso: new Date(milliseconds).toISOString(), local: formatter.format(new Date(milliseconds)) }));
}

if (typeof module !== 'undefined' && module.exports) module.exports = { parseCron, nextCronOccurrences, MAX_EXPRESSION_LENGTH, MAX_NEXT_COUNT };
if (typeof globalThis !== 'undefined') globalThis.UtilCoverCron = { parseCron, nextCronOccurrences };
