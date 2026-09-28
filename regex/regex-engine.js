'use strict';

const MAX_REGEX_PATTERN = 2_000;
const MAX_REGEX_TEXT = 200_000;
const MAX_REGEX_REPLACEMENT = 2_000;
const MAX_REGEX_MATCHES = 1_000;
const MAX_REGEX_CAPTURES = 50;
const MAX_REGEX_OUTPUT = 500_000;
const MAX_REGEX_RESULT = 500_000;
const ALLOWED_REGEX_FLAGS = 'gimsuy';

function regexError(message, code) {
  const error = new RangeError(message);
  error.code = code;
  return error;
}

function validateRegexRequest({ pattern, text, flags = '', replacement = '' }) {
  const values = {
    pattern: String(pattern ?? ''),
    text: String(text ?? ''),
    flags: String(flags ?? ''),
    replacement: String(replacement ?? ''),
  };
  if (values.pattern.length > MAX_REGEX_PATTERN) throw regexError('The regex pattern is too large.', 'pattern-too-large');
  if (values.text.length > MAX_REGEX_TEXT) throw regexError('The test text is too large.', 'text-too-large');
  if (values.replacement.length > MAX_REGEX_REPLACEMENT) throw regexError('The replacement text is too large.', 'replacement-too-large');
  if (![...values.flags].every(flag => ALLOWED_REGEX_FLAGS.includes(flag)) || new Set(values.flags).size !== values.flags.length) throw regexError('The regex flags are invalid.', 'invalid-flags');
  return values;
}

function advanceStringIndex(text, index, unicode) {
  if (!unicode || index + 1 >= text.length) return index + 1;
  const first = text.charCodeAt(index);
  if (first < 0xD800 || first > 0xDBFF) return index + 1;
  const second = text.charCodeAt(index + 1);
  return second >= 0xDC00 && second <= 0xDFFF ? index + 2 : index + 1;
}

function resultUnits(match) {
  let total = match[0].length + 32;
  for (const value of match.slice(1)) total += value === undefined ? 1 : value.length;
  for (const [name, value] of Object.entries(match.groups || {})) total += name.length + (value === undefined ? 1 : value.length);
  return total;
}

function countCaptureGroups(pattern, flags) {
  const probe = new RegExp(`(?:)|(?:${pattern})`, flags);
  return probe.exec('').length - 1;
}

function appendBounded(parts, value, state) {
  const text = String(value);
  state.length += text.length;
  if (state.length > MAX_REGEX_OUTPUT) throw regexError('The replacement output is too large.', 'output-too-large');
  parts.push(text);
}

function expandReplacement(replacement, match, text, parts, state) {
  for (let index = 0; index < replacement.length; index += 1) {
    if (replacement[index] !== '$' || index + 1 >= replacement.length) {
      appendBounded(parts, replacement[index], state);
      continue;
    }
    const next = replacement[index + 1];
    if (next === '$') { appendBounded(parts, '$', state); index += 1; continue; }
    if (next === '&') { appendBounded(parts, match.value, state); index += 1; continue; }
    if (next === '`') { appendBounded(parts, text.slice(0, match.index), state); index += 1; continue; }
    if (next === "'") { appendBounded(parts, text.slice(match.end), state); index += 1; continue; }
    if (next === '<' && match.hasNamedGroups) {
      const close = replacement.indexOf('>', index + 2);
      if (close !== -1) {
        const name = replacement.slice(index + 2, close);
        appendBounded(parts, match.groups[name] ?? '', state);
        index = close;
        continue;
      }
    }
    if (next === '0' && /[1-9]/u.test(replacement[index + 2] || '')) {
      const captureIndex = Number(replacement[index + 2]);
      if (captureIndex <= match.captures.length) {
        appendBounded(parts, match.captures[captureIndex - 1] ?? '', state);
        index += 2;
        continue;
      }
    }
    if (/\d/u.test(next) && next !== '0') {
      const secondDigit = replacement[index + 2];
      const twoDigit = /\d/u.test(secondDigit || '') ? Number(next + secondDigit) : 0;
      const oneDigit = Number(next);
      if (twoDigit > 0 && twoDigit <= match.captures.length) {
        appendBounded(parts, match.captures[twoDigit - 1] ?? '', state);
        index += 2;
        continue;
      }
      if (oneDigit <= match.captures.length) {
        appendBounded(parts, match.captures[oneDigit - 1] ?? '', state);
        index += 1;
        continue;
      }
    }
    appendBounded(parts, '$', state);
  }
}

function buildReplacement(text, replacement, matches) {
  const parts = [];
  const state = { length: 0 };
  let cursor = 0;
  for (const match of matches) {
    appendBounded(parts, text.slice(cursor, match.index), state);
    expandReplacement(replacement, match, text, parts, state);
    cursor = match.end;
  }
  appendBounded(parts, text.slice(cursor), state);
  return parts.join('');
}

function analyzeRegex(request) {
  const { pattern, text, flags, replacement } = validateRegexRequest(request);
  const regex = new RegExp(pattern, flags);
  if (countCaptureGroups(pattern, flags) > MAX_REGEX_CAPTURES) throw regexError('The pattern has too many capture groups.', 'too-many-captures');
  const matches = [];
  const replacementMatches = [];
  let aggregateUnits = 0;
  let truncated = false;
  let match;

  while ((match = regex.exec(text)) !== null) {
    aggregateUnits += resultUnits(match);
    if (aggregateUnits > MAX_REGEX_RESULT) throw regexError('The regex result payload is too large.', 'result-too-large');
    const storedMatch = { value: match[0], index: match.index, end: match.index + match[0].length, captures: match.slice(1), groups: match.groups ? { ...match.groups } : {} };
    matches.push(storedMatch);
    replacementMatches.push({ ...storedMatch, hasNamedGroups: match.groups !== undefined });
    if (!regex.global) break;
    if (match[0] === '') regex.lastIndex = advanceStringIndex(text, regex.lastIndex, regex.unicode);
    if (matches.length >= MAX_REGEX_MATCHES) {
      truncated = regex.exec(text) !== null;
      break;
    }
  }

  const replacementResult = truncated ? null : buildReplacement(text, replacement, replacementMatches);
  return { matches, replacement: replacementResult, truncated };
}

const RegexEngine = {
  ALLOWED_REGEX_FLAGS,
  MAX_REGEX_CAPTURES,
  MAX_REGEX_MATCHES,
  MAX_REGEX_OUTPUT,
  MAX_REGEX_PATTERN,
  MAX_REGEX_REPLACEMENT,
  MAX_REGEX_RESULT,
  MAX_REGEX_TEXT,
  advanceStringIndex,
  analyzeRegex,
  validateRegexRequest,
};

if (typeof globalThis !== 'undefined') globalThis.RegexEngine = RegexEngine;
if (typeof module !== 'undefined' && module.exports) module.exports = RegexEngine;
