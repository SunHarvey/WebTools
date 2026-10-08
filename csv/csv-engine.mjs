'use strict';

export const CSV_MAX_INPUT_CHARS = 250_000;
export const CSV_MAX_RECORDS = 10_000;
export const CSV_MAX_COLUMNS = 256;
export const CSV_MAX_CELLS = 20_000;
export const CSV_MAX_OUTPUT_CHARS = 500_000;
export const CSV_MAX_JSON_DEPTH = 100;

export class CsvToolError extends Error {
  constructor(code, message, row = null, column = null) {
    super(message);
    this.name = 'CsvToolError';
    this.code = code;
    this.row = row;
    this.column = column;
  }
}

function lineBreakLength(source, index) {
  return source[index] === '\r' && source[index + 1] === '\n' ? 2 : 1;
}

export function parseCsv(input, { delimiter = ',' } = {}) {
  if (typeof input !== 'string') throw new CsvToolError('INPUT_INVALID', 'Input must be CSV text.');
  if (input.length > CSV_MAX_INPUT_CHARS) throw new CsvToolError('INPUT_TOO_LARGE', `Input exceeds ${CSV_MAX_INPUT_CHARS.toLocaleString('en-US')} characters.`);
  if (delimiter !== ',' && delimiter !== '\t') throw new CsvToolError('DELIMITER_INVALID', 'Choose comma or tab as the delimiter.');
  const source = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows = [];
  let row = [];
  let field = '';
  let state = 'field-start';
  let hasRecordContent = false;
  let cells = 0;
  let line = 1;
  let column = 1;
  let quoteStart = null;

  const advanceOrdinary = () => { column += 1; };
  const advanceLineBreak = (length) => {
    line += 1;
    column = 1;
    return length;
  };
  const finishField = () => {
    if (row.length >= CSV_MAX_COLUMNS) {
      throw new CsvToolError('COLUMN_LIMIT', `CSV records may contain at most ${CSV_MAX_COLUMNS} columns.`, line, column);
    }
    if (cells >= CSV_MAX_CELLS) {
      throw new CsvToolError('CELL_LIMIT', `CSV input may contain at most ${CSV_MAX_CELLS.toLocaleString('en-US')} cells.`, line, column);
    }
    cells += 1;
    row.push(field);
    field = '';
    state = 'field-start';
  };
  const finishRecord = () => {
    finishField();
    if (rows.length >= CSV_MAX_RECORDS) {
      throw new CsvToolError('RECORD_LIMIT', `CSV input exceeds ${CSV_MAX_RECORDS.toLocaleString('en-US')} records.`, rows.length + 1, column);
    }
    rows.push(row);
    row = [];
    hasRecordContent = false;
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const currentLine = line;
    const currentColumn = column;

    if (state === 'quoted') {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
          column += 2;
        } else {
          state = 'after-quote';
          advanceOrdinary();
        }
      } else if (character === '\r' || character === '\n') {
        const length = lineBreakLength(source, index);
        field += source.slice(index, index + length);
        index += length - 1;
        advanceLineBreak(length);
      } else {
        field += character;
        advanceOrdinary();
      }
      continue;
    }

    if (character === '\r' || character === '\n') {
      const length = lineBreakLength(source, index);
      finishRecord();
      index += length - 1;
      advanceLineBreak(length);
      continue;
    }

    if (state === 'field-start') {
      if (character === delimiter) {
        finishField();
        hasRecordContent = true;
        advanceOrdinary();
      } else if (character === '"') {
        quoteStart = { row: currentLine, column: currentColumn };
        state = 'quoted';
        hasRecordContent = true;
        advanceOrdinary();
      } else {
        field += character;
        state = 'unquoted';
        hasRecordContent = true;
        advanceOrdinary();
      }
      continue;
    }

    if (state === 'unquoted') {
      if (character === delimiter) {
        finishField();
        hasRecordContent = true;
        advanceOrdinary();
      } else if (character === '"') {
        throw new CsvToolError('QUOTE_IN_UNQUOTED_FIELD', 'A quote must begin at the start of a field.', currentLine, currentColumn);
      } else {
        field += character;
        advanceOrdinary();
      }
      continue;
    }

    if (character === delimiter) {
      finishField();
      hasRecordContent = true;
      advanceOrdinary();
    } else {
      throw new CsvToolError('CHAR_AFTER_QUOTE', 'Only a delimiter or record break may follow a closing quote.', currentLine, currentColumn);
    }
  }

  if (state === 'quoted') {
    throw new CsvToolError('UNCLOSED_QUOTE', 'A quoted field was not closed.', quoteStart?.row ?? line, quoteStart?.column ?? column);
  }
  if (hasRecordContent || row.length > 0 || state !== 'field-start') {
    finishRecord();
  }
  return rows;
}

export function csvToJson(input, { delimiter = ',', firstRowIsHeader = true } = {}) {
  const rows = parseCsv(input, { delimiter });
  if (rows.length === 0) throw new CsvToolError('EMPTY_INPUT', 'Enter CSV data first.');

  let headers = null;
  let dataRows = rows;
  if (firstRowIsHeader) {
    headers = rows[0];
    dataRows = rows.slice(1);
    if (headers.some(header => header === '')) throw new CsvToolError('HEADER_EMPTY', 'CSV headers must not be empty.');
    if (new Set(headers).size !== headers.length) throw new CsvToolError('HEADER_DUPLICATE', 'CSV headers must be unique.');
  }

  const columnCount = headers?.length ?? rows[0].length;
  for (let index = firstRowIsHeader ? 1 : 0; index < rows.length; index += 1) {
    if (rows[index].length !== columnCount) {
      throw new CsvToolError('ROW_WIDTH_MISMATCH', 'Each CSV record must have the same number of fields.', index + 1, null);
    }
  }

  const values = firstRowIsHeader
    ? dataRows.map(record => Object.fromEntries(headers.map((header, index) => [header, record[index]])))
    : dataRows;
  const output = JSON.stringify(values, null, 2);
  if (output.length > CSV_MAX_OUTPUT_CHARS) {
    throw new CsvToolError('OUTPUT_TOO_LARGE', `Formatted output exceeds ${CSV_MAX_OUTPUT_CHARS.toLocaleString('en-US')} characters.`);
  }
  return { output, rowCount: dataRows.length, columnCount };
}

function assertJsonDepth(source) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const character of source) {
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === '[' || character === '{') {
      depth += 1;
      if (depth > CSV_MAX_JSON_DEPTH) {
        throw new CsvToolError('JSON_DEPTH_LIMIT', `JSON nesting may not exceed ${CSV_MAX_JSON_DEPTH} levels.`);
      }
    } else if ((character === ']' || character === '}') && depth > 0) {
      depth -= 1;
    }
  }
}

function escapeCsvField(value, delimiter) {
  const text = String(value);
  if (!text.includes(delimiter) && !/["\r\n]/u.test(text) && text.trim() === text) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function skipJsonWhitespace(source, cursor) {
  while ([' ', '\t', '\r', '\n'].includes(source[cursor.index])) cursor.index += 1;
}

function readJsonString(source, cursor) {
  const start = cursor.index;
  cursor.index += 1;
  while (cursor.index < source.length) {
    const character = source[cursor.index];
    if (character === '\\') {
      cursor.index += 2;
    } else if (character === '"') {
      cursor.index += 1;
      return JSON.parse(source.slice(start, cursor.index));
    } else {
      cursor.index += 1;
    }
  }
  throw new CsvToolError('JSON_INVALID', 'Enter valid JSON.');
}

function readJsonScalar(source, cursor, rowIndex) {
  skipJsonWhitespace(source, cursor);
  const character = source[cursor.index];
  if (character === '"') return readJsonString(source, cursor);
  if (character === '{' || character === '[') {
    throw new CsvToolError('NESTED_VALUE_UNSUPPORTED', 'Nested JSON values cannot be converted to CSV cells.', rowIndex, null);
  }
  for (const [literal, value] of [['true', 'true'], ['false', 'false'], ['null', 'null']]) {
    if (source.startsWith(literal, cursor.index)) {
      cursor.index += literal.length;
      return value;
    }
  }
  const start = cursor.index;
  while (cursor.index < source.length && '-+0123456789.eE'.includes(source[cursor.index])) cursor.index += 1;
  if (cursor.index === start) throw new CsvToolError('JSON_INVALID', 'Enter valid JSON.');
  return source.slice(start, cursor.index);
}

function readJsonObject(source, cursor, rowIndex) {
  cursor.index += 1;
  skipJsonWhitespace(source, cursor);
  const entries = [];
  const seen = new Set();
  if (source[cursor.index] === '}') {
    cursor.index += 1;
    return entries;
  }
  while (cursor.index < source.length) {
    skipJsonWhitespace(source, cursor);
    const key = readJsonString(source, cursor);
    if (seen.has(key)) throw new CsvToolError('JSON_DUPLICATE_KEY', 'JSON object property names must be unique.', rowIndex, null);
    seen.add(key);
    skipJsonWhitespace(source, cursor);
    cursor.index += 1;
    const value = readJsonScalar(source, cursor, rowIndex);
    entries.push([key, value]);
    skipJsonWhitespace(source, cursor);
    if (source[cursor.index] === '}') {
      cursor.index += 1;
      return entries;
    }
    cursor.index += 1;
  }
  throw new CsvToolError('JSON_INVALID', 'Enter valid JSON.');
}

function parseFlatJsonArray(source) {
  const cursor = { index: 0 };
  skipJsonWhitespace(source, cursor);
  cursor.index += 1;
  skipJsonWhitespace(source, cursor);
  const records = [];
  if (source[cursor.index] === ']') return records;
  while (cursor.index < source.length) {
    skipJsonWhitespace(source, cursor);
    if (source[cursor.index] !== '{') {
      throw new CsvToolError('JSON_ROW_OBJECT_REQUIRED', 'Every JSON array item must be an object.', records.length + 1, null);
    }
    records.push(readJsonObject(source, cursor, records.length + 1));
    skipJsonWhitespace(source, cursor);
    if (source[cursor.index] === ']') return records;
    cursor.index += 1;
  }
  throw new CsvToolError('JSON_INVALID', 'Enter valid JSON.');
}

export function jsonToCsv(input, { delimiter = ',' } = {}) {
  if (typeof input !== 'string') throw new CsvToolError('INPUT_INVALID', 'Input must be JSON text.');
  if (input.length > CSV_MAX_INPUT_CHARS) throw new CsvToolError('INPUT_TOO_LARGE', `Input exceeds ${CSV_MAX_INPUT_CHARS.toLocaleString('en-US')} characters.`);
  const source = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  if (source.trim() === '') throw new CsvToolError('EMPTY_INPUT', 'Enter JSON data first.');
  if (delimiter !== ',' && delimiter !== '\t') throw new CsvToolError('DELIMITER_INVALID', 'Choose comma or tab as the delimiter.');
  assertJsonDepth(source);

  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new CsvToolError('JSON_INVALID', 'Enter valid JSON.');
  }
  if (!Array.isArray(parsed)) throw new CsvToolError('JSON_ARRAY_REQUIRED', 'JSON input must be an array of objects.');
  if (parsed.length + 1 > CSV_MAX_RECORDS) {
    throw new CsvToolError('RECORD_LIMIT', `CSV output may contain at most ${CSV_MAX_RECORDS.toLocaleString('en-US')} records.`);
  }
  if (parsed.length === 0) return { output: '', rowCount: 0, columnCount: 0 };
  for (let rowIndex = 0; rowIndex < parsed.length; rowIndex += 1) {
    const record = parsed[rowIndex];
    if (record === null || typeof record !== 'object' || Array.isArray(record)) {
      throw new CsvToolError('JSON_ROW_OBJECT_REQUIRED', 'Every JSON array item must be an object.', rowIndex + 1, null);
    }
  }

  const sourceRecords = parseFlatJsonArray(source);
  const headers = [];
  const seen = new Set();
  for (let rowIndex = 0; rowIndex < sourceRecords.length; rowIndex += 1) {
    for (const [key] of sourceRecords[rowIndex]) {
      if (key === '') throw new CsvToolError('HEADER_EMPTY', 'JSON property names used as CSV headers must not be empty.', rowIndex + 1, null);
      if (!seen.has(key)) {
        if (headers.length >= CSV_MAX_COLUMNS) {
          throw new CsvToolError('COLUMN_LIMIT', `CSV output may contain at most ${CSV_MAX_COLUMNS} columns.`, rowIndex + 1, headers.length + 1);
        }
        seen.add(key);
        headers.push(key);
      }
    }
  }
  if (headers.length === 0) throw new CsvToolError('JSON_NO_COLUMNS', 'JSON objects must contain at least one property.');
  if ((sourceRecords.length + 1) * headers.length > CSV_MAX_CELLS) {
    throw new CsvToolError('CELL_LIMIT', `CSV output may contain at most ${CSV_MAX_CELLS.toLocaleString('en-US')} cells.`);
  }

  const records = [headers, ...sourceRecords.map(entries => {
    const values = new Map(entries);
    return headers.map(header => values.has(header) ? values.get(header) : '');
  })];
  const output = records.map(record => record.map(value => escapeCsvField(value, delimiter)).join(delimiter)).join('\r\n');
  if (output.length > CSV_MAX_OUTPUT_CHARS) {
    throw new CsvToolError('OUTPUT_TOO_LARGE', `CSV output exceeds ${CSV_MAX_OUTPUT_CHARS.toLocaleString('en-US')} characters.`);
  }
  return { output, rowCount: sourceRecords.length, columnCount: headers.length };
}
