'use strict';

const assert = require('node:assert/strict');
const { before, test } = require('node:test');

let csv;
before(async () => {
  csv = await import('../csv/csv-engine.mjs');
});

test('accepts CSV and JSON at the exact raw input boundary', () => {
  const csvInput = 'x'.repeat(csv.CSV_MAX_INPUT_CHARS);
  assert.equal(csv.parseCsv(csvInput)[0][0].length, csv.CSV_MAX_INPUT_CHARS);
  const jsonInput = `${' '.repeat(csv.CSV_MAX_INPUT_CHARS - 2)}[]`;
  assert.equal(jsonInput.length, csv.CSV_MAX_INPUT_CHARS);
  assert.deepEqual(csv.jsonToCsv(jsonInput), { output: '', rowCount: 0, columnCount: 0 });
});

test('accepts the exact CSV record, column, and aggregate cell budgets', () => {
  assert.equal(csv.parseCsv(Array(csv.CSV_MAX_RECORDS).fill('x').join('\n')).length, csv.CSV_MAX_RECORDS);
  assert.equal(csv.parseCsv(Array(csv.CSV_MAX_COLUMNS).fill('x').join(','))[0].length, csv.CSV_MAX_COLUMNS);
  const fullRow = Array(csv.CSV_MAX_COLUMNS).fill('x').join(',');
  const fullRows = Array(Math.floor(csv.CSV_MAX_CELLS / csv.CSV_MAX_COLUMNS)).fill(fullRow);
  const remaining = csv.CSV_MAX_CELLS % csv.CSV_MAX_COLUMNS;
  if (remaining) fullRows.push(Array(remaining).fill('x').join(','));
  assert.equal(csv.parseCsv(fullRows.join('\n')).reduce((sum, row) => sum + row.length, 0), csv.CSV_MAX_CELLS);
});

test('allows output exactly at the separate serialization limit', () => {
  const baseLength = JSON.stringify([{ value: '' }], null, 2).length;
  const additionalLength = csv.CSV_MAX_OUTPUT_CHARS - baseLength;
  const controlCount = Math.floor(additionalLength / 6);
  const printableCount = additionalLength % 6;
  const value = '\u0001'.repeat(controlCount) + 'x'.repeat(printableCount);
  assert.equal(csv.csvToJson(`value\n${value}`).output.length, csv.CSV_MAX_OUTPUT_CHARS);
});

test('enforces the raw input cap before removing a UTF-8 BOM', () => {
  const input = `\uFEFF${'x'.repeat(csv.CSV_MAX_INPUT_CHARS)}`;
  assert.throws(() => csv.parseCsv(input), error => error.code === 'INPUT_TOO_LARGE');
});

test('enforces the CSV record-count budget before returning the table', () => {
  const input = Array.from({ length: 10_001 }, () => 'x').join('\n');
  assert.throws(() => csv.parseCsv(input), error => error.code === 'RECORD_LIMIT');
});

test('rejects a CSV record wider than the supported column budget', () => {
  const input = Array(257).fill('x').join(',');
  assert.throws(() => csv.parseCsv(input), error => error.code === 'COLUMN_LIMIT');
});

test('enforces an aggregate CSV cell budget across otherwise valid records', () => {
  const row = Array(256).fill('x').join(',');
  const input = Array(391).fill(row).join('\n');
  assert.throws(() => csv.parseCsv(input), error => error.code === 'CELL_LIMIT');
});

test('caps JSON source before parsing or constructing CSV output', () => {
  const input = JSON.stringify([{ value: 'x'.repeat(csv.CSV_MAX_INPUT_CHARS) }]);
  assert.ok(input.length > csv.CSV_MAX_INPUT_CHARS);
  assert.throws(() => csv.jsonToCsv(input), error => error.code === 'INPUT_TOO_LARGE');
});

test('enforces the aggregate cell budget for JSON-to-CSV output', () => {
  const rows = Array.from({ length: 6_667 }, () => ({ a: 'x', b: 'x', c: 'x' }));
  const input = JSON.stringify(rows);
  assert.ok(input.length < csv.CSV_MAX_INPUT_CHARS);
  assert.throws(() => csv.jsonToCsv(input), error => error.code === 'CELL_LIMIT');
});

test('enforces the record budget when converting JSON objects to CSV', () => {
  const input = JSON.stringify(Array.from({ length: csv.CSV_MAX_RECORDS }, () => ({ value: 'x' })));
  assert.ok(input.length < csv.CSV_MAX_INPUT_CHARS);
  assert.throws(() => csv.jsonToCsv(input), error => error.code === 'RECORD_LIMIT');
});

test('rejects JSON object arrays wider than the CSV column budget', () => {
  const record = Object.fromEntries(Array.from({ length: csv.CSV_MAX_COLUMNS + 1 }, (_, index) => [`field${index}`, 'x']));
  assert.throws(() => csv.jsonToCsv(JSON.stringify([record])), error => error.code === 'COLUMN_LIMIT');
});

test('accepts a leading UTF-8 BOM in JSON exported for conversion', () => {
  const input = String.fromCharCode(0xfeff) + '[{"name":"Ada"}]';
  assert.deepEqual(csv.jsonToCsv(input), {
    output: ['name', 'Ada'].join(String.fromCharCode(13, 10)), rowCount: 1, columnCount: 1,
  });
});

test('enforces JSON raw input size before removing a leading BOM', () => {
  const input = String.fromCharCode(0xfeff) + ' '.repeat(csv.CSV_MAX_INPUT_CHARS - 2) + '[]';
  assert.equal(input.length, csv.CSV_MAX_INPUT_CHARS + 1);
  assert.throws(() => csv.jsonToCsv(input), error => error.code === 'INPUT_TOO_LARGE');
});

test('rejects blank JSON source with the dedicated empty-input error', () => {
  assert.throws(() => csv.jsonToCsv(' \n\t'), error => error.code === 'EMPTY_INPUT');
});

test('counts JSON structure outside strings and preserves escaped JSON strings', () => {
  const value = 'quote " and [[[ { } ]]]';
  const result = csv.jsonToCsv(JSON.stringify([{ text: value }]));
  assert.deepEqual(csv.parseCsv(result.output), [['text'], [value]]);
});

test('rejects JSON nesting above the structural depth limit before parsing', () => {
  let nested = '"leaf"';
  for (let level = 0; level < 101; level += 1) nested = `[${nested}]`;
  assert.throws(() => csv.jsonToCsv(`[{"value":${nested}}]`), error => error.code === 'JSON_DEPTH_LIMIT');
});

test('rejects pretty JSON output above the independent output budget', () => {
  const input = `value\n${'\u0001'.repeat(100_000)}`;
  assert.throws(() => csv.csvToJson(input), error => error.code === 'OUTPUT_TOO_LARGE');
});

test('converts header rows to JSON objects without guessing cell types', () => {
  const result = csv.csvToJson('name,active,code\nAda,true,007', { firstRowIsHeader: true });
  assert.deepEqual(JSON.parse(result.output), [{ name: 'Ada', active: 'true', code: '007' }]);
  assert.equal(result.rowCount, 1);
  assert.equal(result.columnCount, 3);
});

test('serializes flat JSON rows as correctly escaped CSV records', () => {
  const input = JSON.stringify([{ name: 'Ada, Jr.', note: 'said "hello"\nfrom Paris' }]);
  const result = csv.jsonToCsv(input);
  assert.equal(result.output, 'name,note\r\n"Ada, Jr.","said ""hello""\nfrom Paris"');
  assert.equal(result.rowCount, 1);
  assert.equal(result.columnCount, 2);
});

test('preserves JSON numeric source text instead of rounding it through binary numbers', () => {
  const input = '[{"integer":9007199254740993,"decimal":1.234567890123456789,"exponent":1e400}]';
  const result = csv.jsonToCsv(input);
  assert.equal(result.output, 'integer,decimal,exponent\r\n9007199254740993,1.234567890123456789,1e400');
});

test('rejects duplicate JSON object names even when a key is escaped', () => {
  assert.throws(() => csv.jsonToCsv('[{"a":1,"a":2}]'), error => error.code === 'JSON_DUPLICATE_KEY');
  assert.throws(() => csv.jsonToCsv('[{"a":1,"\\u0061":2}]'), error => error.code === 'JSON_DUPLICATE_KEY');
});

test('preserves JSON member order for numeric-looking property names', () => {
  assert.equal(csv.jsonToCsv('[{"10":"ten","2":"two"}]').output, '10,2\r\nten,two');
});

test('converts JSON scalar cells to literal text without guessing types', () => {
  const input = '[{"flag":false,"number":42,"empty":"","nil":null}]';
  assert.equal(csv.jsonToCsv(input).output, 'flag,number,empty,nil\r\nfalse,42,,null');
});

test('rejects non-array JSON and hides raw parser details', () => {
  assert.throws(() => csv.jsonToCsv('{"name":"Ada"}'), error => error.code === 'JSON_ARRAY_REQUIRED');
  assert.throws(() => csv.jsonToCsv('[null]'), error => error.code === 'JSON_ROW_OBJECT_REQUIRED');
  assert.throws(() => csv.jsonToCsv('{"secret":'), error => error.code === 'JSON_INVALID' && !error.message.includes('secret'));
});

test('parses quoted delimiters, escaped quotes, and embedded record breaks', () => {
  const input = 'name,note\r\nAda,"said ""hello, world""\r\nfrom Paris"';
  assert.deepEqual(csv.parseCsv(input), [
    ['name', 'note'],
    ['Ada', 'said "hello, world"\r\nfrom Paris'],
  ]);
});

test('round-trips quoted CSV cells through JSON and back without changing values', () => {
  const newline = String.fromCharCode(10);
  const input = ['name,code,note', 'Ada,007,"said ""hello, world"""', 'Lin,042,"first' + newline + 'second"'].join(newline);
  const json = csv.csvToJson(input).output;
  const output = csv.jsonToCsv(json).output;
  assert.deepEqual(csv.parseCsv(output), csv.parseCsv(input));
});

test('parses a maximum-length quoted field with doubled quote escapes', () => {
  const input = '"' + '""'.repeat((csv.CSV_MAX_INPUT_CHARS - 2) / 2) + '"';
  const parsed = csv.parseCsv(input);
  assert.equal(input.length, csv.CSV_MAX_INPUT_CHARS);
  assert.equal(parsed[0][0].length, (csv.CSV_MAX_INPUT_CHARS - 2) / 2);
  assert.equal(parsed[0][0], '"'.repeat((csv.CSV_MAX_INPUT_CHARS - 2) / 2));
});

test('accepts CRLF, LF, and CR record endings without adding a trailing row', () => {
  assert.deepEqual(csv.parseCsv('a,b\r\n1,2\n3,4\r'), [['a', 'b'], ['1', '2'], ['3', '4']]);
});

test('preserves a tab inside a quoted TSV field', () => {
  const tab = String.fromCharCode(9);
  const newline = String.fromCharCode(10);
  const input = ['name' + tab + 'note', 'Ada' + tab + '"has' + tab + 'an embedded tab"'].join(newline);
  assert.deepEqual(csv.parseCsv(input, { delimiter: tab }), [['name', 'note'], ['Ada', 'has' + tab + 'an embedded tab']]);
});

test('converts tab-separated records when the user selects TSV', () => {
  const result = csv.csvToJson('name\tcode\nAda\t007', { delimiter: '\t' });
  assert.deepEqual(JSON.parse(result.output), [{ name: 'Ada', code: '007' }]);
});

test('keeps headerless CSV records as arrays of strings', () => {
  const result = csv.csvToJson('name,active\nAda,true', { firstRowIsHeader: false });
  assert.deepEqual(JSON.parse(result.output), [['name', 'active'], ['Ada', 'true']]);
});

test('rejects ragged records when CSV has no header row', () => {
  const input = ['a,b', '1'].join(String.fromCharCode(10));
  assert.throws(() => csv.csvToJson(input, { firstRowIsHeader: false }), error => error.code === 'ROW_WIDTH_MISMATCH' && error.row === 2);
});

test('parses a blank CSV record as one empty field', () => {
  assert.deepEqual(csv.parseCsv(String.fromCharCode(10)), [['']]);
});

test('rejects empty CSV input with the dedicated empty-input error', () => {
  assert.throws(() => csv.csvToJson(''), error => error.code === 'EMPTY_INPUT');
});

test('strips a leading UTF-8 BOM from the first CSV header', () => {
  const result = csv.csvToJson('\uFEFFname\nAda');
  assert.deepEqual(JSON.parse(result.output), [{ name: 'Ada' }]);
});

test('rejects ragged CSV rows rather than truncating or padding them', () => {
  assert.throws(() => csv.csvToJson('a,b\n1,2,3'), error => error.code === 'ROW_WIDTH_MISMATCH' && error.row === 2);
});

test('rejects empty or duplicate CSV headers', () => {
  assert.throws(() => csv.csvToJson(',b\n1,2'), error => error.code === 'HEADER_EMPTY');
  assert.throws(() => csv.csvToJson('a,a\n1,2'), error => error.code === 'HEADER_DUPLICATE');
});

test('reports malformed CSV quote placement with source coordinates', () => {
  assert.throws(() => csv.parseCsv('a"b'), error => error.code === 'QUOTE_IN_UNQUOTED_FIELD' && error.row === 1 && error.column === 2);
  assert.throws(() => csv.parseCsv('"a"x'), error => error.code === 'CHAR_AFTER_QUOTE' && error.row === 1 && error.column === 4);
  assert.throws(() => csv.parseCsv('a,"b'), error => error.code === 'UNCLOSED_QUOTE' && error.row === 1 && error.column === 3);
});

test('forms a stable union of JSON object keys and leaves missing cells blank', () => {
  const result = csv.jsonToCsv('[{"name":"Ada"},{"age":7}]');
  assert.equal(result.output, 'name,age\r\nAda,\r\n,7');
});

test('rejects nested JSON cell values instead of stringifying them silently', () => {
  assert.throws(() => csv.jsonToCsv('[{"profile":{"name":"Ada"}}]'), error => error.code === 'NESTED_VALUE_UNSUPPORTED');
});

test('registers CSV as a private local tool with bilingual related routes and syntax checks', () => {
  const { findTool, RELATED_TOOLS } = require('../shared/tools-data.js');
  const { routes } = require('../scripts/generate-sitemap.cjs');
  const tool = findTool('csv');
  assert.ok(tool);
  assert.equal(tool.category, 'developer');
  assert.equal(tool.recordRecent, false);
  assert.equal(tool.name.en, 'CSV / TSV ↔ JSON Converter');
  assert.equal(tool.name.zh, 'CSV / TSV 与 JSON 转换器');
  assert.deepEqual(RELATED_TOOLS.csv, ['json', 'yaml', 'xml']);
  assert.ok(routes.includes('/csv/'));
  assert.ok(routes.includes('/zh/csv/'));
  const packageJson = require('../package.json');
  for (const file of ['csv/csv-engine.mjs', 'csv/csv-tool.mjs', 'csv/csv-app.mjs']) {
    assert.ok(packageJson.scripts['check:js'].includes(`node --check ${file}`));
  }
});
