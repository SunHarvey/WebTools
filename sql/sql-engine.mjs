'use strict';

export const SQL_MAX_INPUT_CHARS = 250_000;
export const SQL_MAX_OUTPUT_CHARS = 500_000;
export const SQL_MAX_TOKENS = 50_000;
export const SQL_MAX_DEPTH = 100;

const DIALECTS = new Set(['postgres', 'mysql', 'sqlite']);
const KEYWORDS = new Set(`
  ALL ALTER AND ANY AS ASC BETWEEN BY CASE CAST CHECK COLLATE COLUMN CONSTRAINT CREATE CROSS CURRENT_DATE CURRENT_TIME CURRENT_TIMESTAMP DATABASE DEFAULT DELETE DESC DISTINCT DROP ELSE END EXCEPT EXISTS FALSE FETCH FILTER FIRST FOLLOWING FOR FOREIGN FROM FULL GROUP HAVING IF IN INDEX INNER INSERT INTERSECT INTO IS JOIN KEY LATERAL LEFT LIKE LIMIT MATERIALIZED NATURAL NOT NULL NULLS OFFSET ON ONLY OR ORDER OUTER OVER PARTITION PRECEDING PRIMARY RANGE RECURSIVE REFERENCES RETURNING RIGHT ROW ROWS SCHEMA SELECT SET SOME TABLE THEN TIES TRUE UNION UNIQUE UPDATE USING VALUES WHEN WHERE WINDOW WITH WITHOUT
`.trim().split(/\s+/u));

const CLAUSES = [
  ['ON', 'DUPLICATE', 'KEY', 'UPDATE'],
  ['LEFT', 'OUTER', 'JOIN'], ['RIGHT', 'OUTER', 'JOIN'], ['FULL', 'OUTER', 'JOIN'],
  ['UNION', 'DISTINCT'], ['INSERT', 'INTO'], ['DELETE', 'FROM'], ['CREATE', 'TABLE'],
  ['ALTER', 'TABLE'], ['DROP', 'TABLE'], ['GROUP', 'BY'], ['ORDER', 'BY'],
  ['PARTITION', 'BY'], ['UNION', 'ALL'], ['ON', 'CONFLICT'], ['DO', 'UPDATE'],
  ['INNER', 'JOIN'], ['CROSS', 'JOIN'], ['NATURAL', 'JOIN'], ['LEFT', 'JOIN'],
  ['RIGHT', 'JOIN'], ['FULL', 'JOIN'], ['UNION'], ['EXCEPT'], ['INTERSECT'],
  ['SELECT'], ['WITH'], ['FROM'], ['WHERE'], ['HAVING'], ['LIMIT'], ['OFFSET'],
  ['JOIN'], ['ON'], ['SET'], ['VALUES'], ['RETURNING'], ['UPDATE'], ['USING'],
].sort((left, right) => right.length - left.length);

const WORD_START = /^[\p{L}_]$/u;
const WORD_PART = /^[\p{L}\p{M}\p{N}_$]$/u;
const OPERATOR_CHAR = /^[=<>!~+*/%|&^:#-]$/u;
const POSTGRES_OPERATOR_CHAR = /^[=<>!~+*/%|&^:#@?`-]$/u;
const SQLITE_PARAMETER_PART = /^[\p{L}\p{M}\p{N}_]$/u;

function isOperatorCharacter(character, dialect) {
  return (dialect === 'postgres' ? POSTGRES_OPERATOR_CHAR : OPERATOR_CHAR).test(character);
}

export class SqlToolError extends Error {
  constructor(code, message, line = null, column = null) {
    super(message);
    this.name = 'SqlToolError';
    this.code = code;
    this.line = line;
    this.column = column;
  }
}

function pointAt(source, index) {
  return String.fromCodePoint(source.codePointAt(index));
}

function pointWidth(source, index) {
  return source.codePointAt(index) > 0xffff ? 2 : 1;
}

function isWordStartAt(source, index) {
  if (index >= source.length) return false;
  return WORD_START.test(pointAt(source, index));
}

function isWordPartAt(source, index) {
  if (index >= source.length) return false;
  return WORD_PART.test(pointAt(source, index));
}

function coordinates(source, index) {
  let line = 1;
  let column = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (source[cursor] === '\r') {
      if (source[cursor + 1] === '\n') cursor += 1;
      line += 1;
      column = 1;
    } else if (source[cursor] === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

function syntaxError(source, code, message, index) {
  const { line, column } = coordinates(source, index);
  return new SqlToolError(code, message, line, column);
}

function scanQuoted(source, quoteIndex, quote, { backslashEscapes = false, bracketEscapes = false } = {}) {
  for (let cursor = quoteIndex + 1; cursor < source.length;) {
    const character = source[cursor];
    if (backslashEscapes && character === '\\') {
      cursor += Math.min(2, source.length - cursor);
      continue;
    }
    if (character === quote) {
      if (bracketEscapes && source[cursor + 1] === quote) {
        cursor += 2;
        continue;
      }
      if (!bracketEscapes && source[cursor + 1] === quote) {
        cursor += 2;
        continue;
      }
      return cursor + 1;
    }
    cursor += pointWidth(source, cursor);
  }
  return -1;
}

function prefixedQuote(source, index, dialect) {
  if (index > 0 && isWordPartAt(source, index - 1)) return null;
  const next = source[index + 1];
  if (dialect === 'postgres') {
    if ((source[index] === 'e' || source[index] === 'E') && next === "'") {
      return { prefixLength: 1, quote: "'", backslashEscapes: true };
    }
    if ((source[index] === 'b' || source[index] === 'B' || source[index] === 'x' || source[index] === 'X' || source[index] === 'n' || source[index] === 'N') && next === "'") {
      return { prefixLength: 1, quote: "'", backslashEscapes: false };
    }
    if ((source[index] === 'u' || source[index] === 'U') && next === '&' && (source[index + 2] === "'" || source[index + 2] === '"')) {
      return { prefixLength: 2, quote: source[index + 2], backslashEscapes: false };
    }
  }
  if (dialect === 'mysql') {
    if ((/[nNeExXbB]/u.test(source[index]) && (next === "'" || next === '"'))) {
      return { prefixLength: 1, quote: next, backslashEscapes: true };
    }
    if (source[index] === '_' && isWordStartAt(source, index + 1)) {
      let cursor = index + 1;
      while (isWordPartAt(source, cursor)) cursor += pointWidth(source, cursor);
      if (source[cursor] === "'" || source[cursor] === '"') {
        return { prefixLength: cursor - index, quote: source[cursor], backslashEscapes: true };
      }
    }
  }
  if (dialect === 'sqlite' && (source[index] === 'x' || source[index] === 'X') && next === "'") {
    return { prefixLength: 1, quote: "'", backslashEscapes: false };
  }
  return null;
}

function readWord(source, index) {
  let cursor = index;
  while (isWordPartAt(source, cursor)) cursor += pointWidth(source, cursor);
  return cursor;
}

function readSqliteDollarParameter(source, index) {
  let cursor = index + 1;
  if (!isWordStartAt(source, cursor)) return null;
  while (cursor < source.length && SQLITE_PARAMETER_PART.test(pointAt(source, cursor))) cursor += pointWidth(source, cursor);
  while (source.startsWith('::', cursor) && isWordStartAt(source, cursor + 2)) {
    cursor += 2;
    while (cursor < source.length && SQLITE_PARAMETER_PART.test(pointAt(source, cursor))) cursor += pointWidth(source, cursor);
  }
  if (source[cursor] === '(') {
    const end = source.indexOf(')', cursor + 1);
    if (end >= 0 && !/\s/u.test(source.slice(cursor + 1, end))) cursor = end + 1;
  }
  return cursor;
}

function readDollarString(source, index) {
  const delimiterEnd = source.indexOf('$', index + 1);
  if (delimiterEnd < 0) return null;
  const tag = source.slice(index + 1, delimiterEnd);
  if (tag !== '' && !/^[\p{L}_][\p{L}\p{M}\p{N}_]*$/u.test(tag)) return null;
  const delimiter = source.slice(index, delimiterEnd + 1);
  const closing = source.indexOf(delimiter, delimiterEnd + 1);
  if (closing < 0) return { end: -1 };
  return { end: closing + delimiter.length };
}

function tokenizeSql(input, dialect) {
  const source = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const tokens = [];
  let depth = 0;
  let whitespaceBefore = false;

  const push = (raw, type, index, tokenDepth = depth) => {
    tokens.push({ raw, type, depth: tokenDepth, index, whitespaceBefore });
    whitespaceBefore = false;
    if (tokens.length > SQL_MAX_TOKENS) {
      throw new SqlToolError('TOKEN_LIMIT', `SQL input exceeds the ${SQL_MAX_TOKENS.toLocaleString('en-US')}-token limit.`);
    }
  };

  for (let index = 0; index < source.length;) {
    const character = source[index];
    if (/\s/u.test(pointAt(source, index))) {
      whitespaceBefore = true;
      index += pointWidth(source, index);
      continue;
    }

    const dashComment = source.startsWith('--', index)
      && (dialect !== 'mysql' || index + 2 < source.length && /\s/u.test(pointAt(source, index + 2)));
    if (dashComment || (dialect === 'mysql' && character === '#')) {
      const start = index;
      while (index < source.length && source[index] !== '\r' && source[index] !== '\n') index += pointWidth(source, index);
      push(source.slice(start, index), 'line-comment', start);
      continue;
    }

    if (source.startsWith('/*', index)) {
      const start = index;
      if (dialect !== 'postgres') {
        const end = source.indexOf('*/', index + 2);
        if (end < 0) throw syntaxError(source, 'UNCLOSED_COMMENT', 'A block comment was not closed.', start);
        index = end + 2;
      } else {
        let commentDepth = 1;
        index += 2;
        while (index < source.length && commentDepth > 0) {
          if (source.startsWith('/*', index)) {
            commentDepth += 1;
            index += 2;
          } else if (source.startsWith('*/', index)) {
            commentDepth -= 1;
            index += 2;
          } else {
            index += pointWidth(source, index);
          }
        }
        if (commentDepth !== 0) throw syntaxError(source, 'UNCLOSED_COMMENT', 'A block comment was not closed.', start);
      }
      push(source.slice(start, index), 'block-comment', start);
      continue;
    }

    const prefix = prefixedQuote(source, index, dialect);
    if (prefix) {
      const start = index;
      const quoteIndex = index + prefix.prefixLength;
      const end = scanQuoted(source, quoteIndex, prefix.quote, prefix);
      if (end < 0) throw syntaxError(source, 'UNCLOSED_STRING', 'A quoted SQL value or identifier was not closed.', start);
      index = end;
      push(source.slice(start, index), 'literal', start);
      continue;
    }

    if (character === "'" || character === '"' || dialect !== 'postgres' && character === '`' || dialect === 'sqlite' && character === '[') {
      const start = index;
      const quote = character === '[' ? ']' : character;
      const backslashEscapes = dialect === 'mysql' && (character === "'" || character === '"' || character === '`');
      const end = scanQuoted(source, index, quote, { backslashEscapes, bracketEscapes: character === '[' });
      if (end < 0) throw syntaxError(source, 'UNCLOSED_STRING', 'A quoted SQL value or identifier was not closed.', start);
      index = end;
      push(source.slice(start, index), character === "'" ? 'literal' : 'identifier', start);
      continue;
    }

    if (dialect === 'sqlite' && character === '$') {
      const end = readSqliteDollarParameter(source, index);
      if (end !== null) {
        const start = index;
        index = end;
        push(source.slice(start, index), 'parameter', start);
        continue;
      }
    }

    if (dialect === 'sqlite' && character === '?') {
      const start = index++;
      while (/\d/u.test(source[index] || '')) index += 1;
      push(source.slice(start, index), 'parameter', start);
      continue;
    }

    if (dialect === 'postgres' && character === '$') {
      const dollarString = readDollarString(source, index);
      if (dollarString?.end === -1) throw syntaxError(source, 'UNCLOSED_STRING', 'A dollar-quoted SQL value was not closed.', index);
      if (dollarString) {
        const start = index;
        index = dollarString.end;
        push(source.slice(start, index), 'literal', start);
        continue;
      }
      if (/\d/u.test(source[index + 1] || '')) {
        const start = index++;
        while (/\d/u.test(source[index] || '')) index += 1;
        push(source.slice(start, index), 'parameter', start);
        continue;
      }
    }

    if (dialect === 'mysql' && source.startsWith('@@', index) && isWordStartAt(source, index + 2)) {
      const start = index;
      index = readWord(source, index + 2);
      while (source[index] === '.' && isWordStartAt(source, index + 1)) index = readWord(source, index + 1);
      push(source.slice(start, index), 'parameter', start);
      continue;
    }

    if ((character === ':' && source[index + 1] !== ':' && isWordStartAt(source, index + 1))
      || (dialect !== 'postgres' && character === '@' && isWordStartAt(source, index + 1))) {
      const start = index;
      index += 1;
      index = readWord(source, index);
      push(source.slice(start, index), 'parameter', start);
      continue;
    }

    if (isWordStartAt(source, index)) {
      const start = index;
      index = readWord(source, index);
      push(source.slice(start, index), 'word', start);
      continue;
    }

    if (/\d/u.test(character) || character === '.' && /\d/u.test(source[index + 1] || '')) {
      const start = index;
      const match = source.slice(index).match(/^(?:0[xX][0-9a-fA-F]+|0[bB][01]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(?:[A-Za-z_][A-Za-z0-9_]*)?/u);
      if (match) index += match[0].length;
      else index += 1;
      push(source.slice(start, index), 'number', start);
      continue;
    }

    if (character === '(') {
      if (depth >= SQL_MAX_DEPTH) throw syntaxError(source, 'DEPTH_LIMIT', `SQL nesting exceeds the ${SQL_MAX_DEPTH}-level limit.`, index);
      push(character, 'punctuation', index, depth);
      depth += 1;
      index += 1;
      continue;
    }
    if (character === ')') {
      push(character, 'punctuation', index, depth);
      depth = Math.max(0, depth - 1);
      index += 1;
      continue;
    }

    if (dialect === 'mysql' && character === '-' && source[index + 1] === '-') {
      push('-', 'operator', index);
      index += 1;
      continue;
    }

    if (isOperatorCharacter(character, dialect)) {
      const start = index;
      while (index < source.length && isOperatorCharacter(source[index], dialect)) index += 1;
      push(source.slice(start, index), 'operator', start);
      continue;
    }

    push(character, 'punctuation', index);
    index += pointWidth(source, index);
  }

  return tokens;
}

function validate(input, options) {
  if (typeof input !== 'string') throw new SqlToolError('INPUT_INVALID', 'Input must be SQL text.');
  if (input.length > SQL_MAX_INPUT_CHARS) throw new SqlToolError('INPUT_TOO_LARGE', `SQL input exceeds the ${SQL_MAX_INPUT_CHARS.toLocaleString('en-US')}-character limit.`);
  const dialect = options.dialect ?? 'postgres';
  if (!DIALECTS.has(dialect)) throw new SqlToolError('DIALECT_INVALID', 'Choose PostgreSQL, MySQL, or SQLite.');
  const keywordCase = options.keywordCase ?? 'upper';
  if (!['upper', 'lower', 'preserve'].includes(keywordCase)) throw new SqlToolError('OPTION_INVALID', 'Choose uppercase, lowercase, or preserve keyword case.');
  const indent = options.indent ?? 2;
  if (![2, 4].includes(indent)) throw new SqlToolError('OPTION_INVALID', 'Indentation must be two or four spaces.');
  const source = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  if (source.trim() === '') throw new SqlToolError('EMPTY_INPUT', 'Enter SQL text first.');
  return { tokens: tokenizeSql(input, dialect), keywordCase, indent };
}

function renderToken(token, keywordCase) {
  if (token.type !== 'word' || !KEYWORDS.has(token.raw.toUpperCase())) return token.raw;
  if (keywordCase === 'upper') return token.raw.toUpperCase();
  if (keywordCase === 'lower') return token.raw.toLowerCase();
  return token.raw;
}

function phraseAt(tokens, index) {
  for (const phrase of CLAUSES) {
    if (phrase.every((word, offset) => tokens[index + offset]?.type === 'word' && tokens[index + offset].raw.toUpperCase() === word)) return phrase.length;
  }
  return 0;
}

function clauseContinuations(tokens) {
  const continuations = new Set();
  for (let index = 0; index < tokens.length; index += 1) {
    const length = phraseAt(tokens, index);
    for (let offset = 1; offset < length; offset += 1) continuations.add(index + offset);
  }
  return continuations;
}

function boundedPush(parts, value, lengthState) {
  lengthState.value += value.length;
  if (lengthState.value > SQL_MAX_OUTPUT_CHARS) {
    throw new SqlToolError('OUTPUT_TOO_LARGE', `SQL output exceeds the ${SQL_MAX_OUTPUT_CHARS.toLocaleString('en-US')}-character limit.`);
  }
  parts.push(value);
}

function needsSpace(previous, current) {
  if (!previous) return false;
  if (current.raw === ',' || current.raw === ';' || current.raw === '.' || current.raw === ')') return false;
  if (previous.raw === '.' || previous.raw === '(') return false;
  if (previous.type === 'block-comment' || current.type === 'block-comment' || current.type === 'line-comment') return true;
  if (current.raw === '(') return current.whitespaceBefore;
  if (previous.type === 'operator' || current.type === 'operator') return true;
  if (previous.raw === ',') return false;
  return true;
}

export function formatSql(input, options = {}) {
  const { tokens, keywordCase, indent } = validate(input, options);
  const lines = [];
  const lengthState = { value: 0 };
  let lineParts = [];
  let lineLength = 0;
  let lineIndent = 0;
  let previous = null;
  let caseDepth = 0;
  const subqueryStack = [];
  const continuations = clauseContinuations(tokens);

  const append = (value) => {
    lineParts.push(value);
    lineLength += value.length;
    const separatorLength = lines.length > 0 ? 1 : 0;
    if (lengthState.value + separatorLength + lineIndent * indent + lineLength > SQL_MAX_OUTPUT_CHARS) {
      throw new SqlToolError('OUTPUT_TOO_LARGE', `SQL output exceeds the ${SQL_MAX_OUTPUT_CHARS.toLocaleString('en-US')}-character limit.`);
    }
  };
  const flush = () => {
    if (lineLength === 0) return;
    if (lines.length > 0) {
      lengthState.value += 1;
      if (lengthState.value > SQL_MAX_OUTPUT_CHARS) {
        throw new SqlToolError('OUTPUT_TOO_LARGE', `SQL output exceeds the ${SQL_MAX_OUTPUT_CHARS.toLocaleString('en-US')}-character limit.`);
      }
    }
    const renderedLine = `${' '.repeat(lineIndent * indent)}${lineParts.join('')}`;
    boundedPush(lines, renderedLine, lengthState);
    lineParts = [];
    lineLength = 0;
  };
  const newline = (level = 0) => {
    flush();
    lineIndent = Math.max(0, level);
  };
  const appendToken = (token, position) => {
    if (needsSpace(previous, token) && lineLength > 0) append(' ');
    append(renderToken(token, keywordCase));
    previous = token;
    if (token.type === 'line-comment') newline(token.depth);
    if (position === 'comma') newline(token.depth + 1);
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const upper = token.type === 'word' ? token.raw.toUpperCase() : '';
    const clauseLength = continuations.has(index) ? 0 : phraseAt(tokens, index);
    if (clauseLength > 0) newline(token.depth);
    else if ((upper === 'AND' || upper === 'OR') && previous) newline(token.depth + 1);
    else if ((upper === 'WHEN' || upper === 'ELSE') && caseDepth > 0) newline(token.depth + 1);
    else if (upper === 'END' && caseDepth > 0) newline(token.depth);

    if (token.raw === '(') {
      const next = tokens[index + 1];
      const subquery = next?.type === 'word' && ['SELECT', 'WITH'].includes(next.raw.toUpperCase());
      subqueryStack.push(subquery);
      appendToken(token);
      if (subquery) newline(token.depth + 1);
      continue;
    }

    if (token.raw === ')') {
      const subquery = subqueryStack.pop() === true;
      if (subquery) newline(Math.max(0, token.depth - 1));
      appendToken(token);
      continue;
    }

    if (upper === 'END' && caseDepth > 0) caseDepth -= 1;
    appendToken(token, token.raw === ',' ? 'comma' : undefined);
    if (upper === 'CASE') caseDepth += 1;
    if (token.raw === ';' && index < tokens.length - 1) {
      newline(0);
      previous = null;
    }
  }

  flush(0);
  return lines.join('\n');
}

function compactNeedsSpace(previous, current) {
  if (!previous) return false;
  if (current.raw === ',' || current.raw === ';' || current.raw === '.' || current.raw === ')') return false;
  if (previous.raw === '.' || previous.raw === '(') return false;
  if (previous.type === 'block-comment' || current.type === 'block-comment' || current.type === 'line-comment') return true;
  if (current.raw === '(') return current.whitespaceBefore;
  if (previous.type === 'operator' || current.type === 'operator') return true;
  if (previous.raw === ',') return false;
  if (['word', 'number', 'parameter', 'literal', 'identifier'].includes(previous.type) && ['word', 'number', 'parameter', 'literal', 'identifier'].includes(current.type)) return true;
  if (previous.type === 'line-comment') return false;
  return false;
}

export function minifySql(input, options = {}) {
  const { tokens, keywordCase } = validate(input, { ...options, keywordCase: options.keywordCase ?? 'preserve' });
  const parts = [];
  const lengthState = { value: 0 };
  let previous = null;
  for (const token of tokens) {
    if (token.type === 'line-comment') {
      if (previous && compactNeedsSpace(previous, token)) boundedPush(parts, ' ', lengthState);
      boundedPush(parts, renderToken(token, keywordCase), lengthState);
      boundedPush(parts, '\n', lengthState);
      previous = null;
      continue;
    }
    if (compactNeedsSpace(previous, token)) boundedPush(parts, ' ', lengthState);
    boundedPush(parts, renderToken(token, keywordCase), lengthState);
    previous = token;
  }
  return parts.join('');
}

export { DIALECTS, KEYWORDS };
