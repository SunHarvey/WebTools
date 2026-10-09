'use strict';

const assert = require('node:assert/strict');
const { before, test } = require('node:test');

let sql;
before(async () => {
  sql = await import('../sql/sql-engine.mjs');
});

test('formats common SQL clauses and operators without changing the statement', () => {
  const output = sql.formatSql("select id,name from users where active=true and name like 'A%' order by id desc;", {
    keywordCase: 'upper',
    indent: 2,
  });
  assert.equal(output, "SELECT id,\n  name\nFROM users\nWHERE active = TRUE\n  AND name LIKE 'A%'\nORDER BY id DESC;");
});

test('keeps multiword clauses together while breaking before join and DML clauses', () => {
  const join = sql.formatSql('select * from a left join b on a.id=b.id;', { keywordCase: 'upper' });
  assert.ok(join.includes('LEFT JOIN b'));
  assert.ok(join.includes('ON a.id = b.id'));
  const deletion = sql.formatSql('delete from items where expired=true;', { keywordCase: 'upper' });
  assert.ok(deletion.startsWith('DELETE FROM items'));
  assert.ok(deletion.includes('WHERE expired = TRUE'));
});

test('minifies whitespace but keeps token boundaries and line-comment semantics', () => {
  const output = sql.minifySql('SELECT a, b\nFROM t -- keep comment\nWHERE x = 1;');
  assert.equal(output, 'SELECT a,b FROM t -- keep comment\nWHERE x = 1;');
  assert.doesNotMatch(sql.minifySql('SELECT a - -b;'), /a--b/);
});

test('does not rewrite keyword-like content inside strings, quoted identifiers, or comments', () => {
  const input = `select 'from where, ORDER BY', "select", /* from where */ value from source;`;
  const output = sql.formatSql(input, { dialect: 'postgres', keywordCase: 'upper' });
  assert.match(output, /'from where, ORDER BY'/);
  assert.match(output, /"select"/);
  assert.match(output, /\/\* from where \*\//);
  assert.match(output, /^SELECT/m);
  assert.match(output, /^FROM source/m);
});

test('keeps PostgreSQL JSON path and containment operators grouped as operators', () => {
  const output = sql.formatSql("select payload#>'{a}' from records;", { dialect: 'postgres' });
  assert.ok(output.includes("payload #> '{a}'"));
  const containment = sql.minifySql('SELECT x @> y, tags ?& keys FROM t;', { dialect: 'postgres' });
  assert.equal(containment, 'SELECT x @> y,tags ?& keys FROM t;');
});

test('preserves source whitespace around PostgreSQL parenthesized expressions', () => {
  assert.equal(sql.minifySql('SELECT (a)::int FROM t;', { dialect: 'postgres' }), 'SELECT (a) :: int FROM t;');
  assert.equal(sql.minifySql('SELECT(a)::int FROM t;', { dialect: 'postgres' }), 'SELECT(a) :: int FROM t;');
});

test('preserves PostgreSQL dollar-quoted strings and E-string escapes', () => {
  const input = "select $body$from, where; ' quoted$body$, E'line\\nfrom';";
  const output = sql.formatSql(input, { dialect: 'postgres', keywordCase: 'upper' });
  assert.ok(output.includes('$body$from, where; \' quoted$body$'));
  assert.ok(output.includes("E'line\\nfrom'"));
});

test('preserves Unicode PostgreSQL dollar-quote tags and their keyword-like body', () => {
  const input = 'select $étiquette$from where$étiquette$ from t;';
  const output = sql.formatSql(input, { dialect: 'postgres', keywordCase: 'upper' });
  assert.ok(output.includes('$étiquette$from where$étiquette$'));
  assert.match(output, /^FROM t/m);
});

test('preserves MySQL backticks, backslash-escaped quotes, and hash comments', () => {
  const input = "select `from`, 'it\\'s where' # comment with ORDER BY\nfrom t;";
  const output = sql.formatSql(input, { dialect: 'mysql', keywordCase: 'upper' });
  assert.ok(output.includes('`from`'));
  assert.ok(output.includes("'it\\'s where'"));
  assert.ok(output.includes('# comment with ORDER BY\n'));
  assert.match(output, /^FROM t/m);
});

test('does not mistake MySQL double minus without required spacing for a comment', () => {
  const input = 'SELECT 1--2, 3 -- actual comment' + String.fromCharCode(10) + 'FROM t;';
  const output = sql.minifySql(input, { dialect: 'mysql' });
  assert.match(output, /1 - - 2/);
  assert.ok(output.includes('-- actual comment' + String.fromCharCode(10) + 'FROM t'));
});

test('treats PostgreSQL double hyphen as a comment without requiring following whitespace', () => {
  assert.equal(sql.minifySql('SELECT a--b FROM t;', { dialect: 'postgres' }), 'SELECT a --b FROM t;\n');
});

test('preserves MySQL function-name spacing that can affect parsing', () => {
  for (const input of ['SELECT COUNT(*) FROM t;', 'SELECT COUNT (*) FROM t;']) {
    const expected = input.includes('COUNT (') ? 'COUNT (*)' : 'COUNT(*)';
    assert.ok(sql.formatSql(input, { dialect: 'mysql' }).includes(expected));
    assert.ok(sql.minifySql(input, { dialect: 'mysql' }).includes(expected));
  }
});

test('keeps MySQL system variables intact during formatting and minification', () => {
  const input = 'select @@session.sql_mode from t;';
  assert.ok(sql.formatSql(input, { dialect: 'mysql' }).includes('@@session.sql_mode'));
  assert.ok(sql.minifySql(input, { dialect: 'mysql' }).includes('@@session.sql_mode'));
});

test('uses dialect-appropriate nesting for block comments', () => {
  const postgres = sql.formatSql('SELECT 1 /* outer /* nested */ still outer */ FROM t;', { dialect: 'postgres' });
  assert.ok(postgres.includes('/* outer /* nested */ still outer */'));
  const mysql = sql.formatSql('SELECT 1 /* outer /* closes here */ + 2 FROM t;', { dialect: 'mysql' });
  assert.ok(mysql.includes('/* outer /* closes here */'));
  assert.ok(mysql.includes('+ 2'));
});

test('preserves SQLite bracket identifiers and escaped closing brackets', () => {
  const output = sql.formatSql('select [from], [a]]b] from [table];', { dialect: 'sqlite', keywordCase: 'upper' });
  assert.ok(output.includes('[from]'));
  assert.ok(output.includes('[a]]b]'));
  assert.match(output, /^FROM \[table\]/m);
});

test('preserves SQLite named and numbered parameter tokens', () => {
  const input = 'SELECT $name, @name, :name, ?1, ? FROM t;';
  const output = sql.formatSql(input, { dialect: 'sqlite' });
  for (const parameter of ['$name', '@name', ':name', '?1', '?']) assert.ok(output.includes(parameter), `${parameter} was split`);
  const extended = sql.formatSql('SELECT $name::tail(suffix) FROM t;', { dialect: 'sqlite' });
  assert.ok(extended.includes('$name::tail(suffix)'), 'SQLite dollar-parameter suffix was split');
});

test('supports keyword case and indentation options with explicit validation', () => {
  assert.equal(sql.formatSql('select a from t', { keywordCase: 'lower', indent: 4 }), 'select a\nfrom t');
  assert.equal(sql.formatSql('select a from t', { keywordCase: 'preserve' }), 'select a\nfrom t');
  assert.throws(() => sql.formatSql('select 1', { keywordCase: 'mixed' }), error => error.code === 'OPTION_INVALID');
  assert.throws(() => sql.formatSql('select 1', { dialect: 'oracle' }), error => error.code === 'DIALECT_INVALID');
  assert.throws(() => sql.formatSql('select 1', { indent: 3 }), error => error.code === 'OPTION_INVALID');
});

test('rejects empty input and never includes submitted SQL in errors', () => {
  assert.throws(() => sql.formatSql('  \n\t'), error => error.code === 'EMPTY_INPUT');
  const marker = 'sensitive_table_name';
  assert.throws(() => sql.formatSql(`select '${marker}`), error => error.code === 'UNCLOSED_STRING' && !error.message.includes(marker));
});

test('rejects unterminated block and line-sensitive quoted constructs safely', () => {
  assert.throws(() => sql.formatSql('select 1 /* private marker'), error => error.code === 'UNCLOSED_COMMENT');
  assert.throws(() => sql.formatSql('select $tag$private'), error => error.code === 'UNCLOSED_STRING');
});

test('enforces raw input size before tokenization', () => {
  assert.equal(sql.formatSql('x'.repeat(sql.SQL_MAX_INPUT_CHARS)), 'x'.repeat(sql.SQL_MAX_INPUT_CHARS));
  assert.throws(() => sql.formatSql('x'.repeat(sql.SQL_MAX_INPUT_CHARS + 1)), error => error.code === 'INPUT_TOO_LARGE');
});

test('bounds token count before formatting or minification', () => {
  const input = Array(sql.SQL_MAX_TOKENS + 1).fill('x').join(' ');
  assert.throws(() => sql.formatSql(input), error => error.code === 'TOKEN_LIMIT');
  assert.throws(() => sql.minifySql(input), error => error.code === 'TOKEN_LIMIT');
});

test('bounds parenthesis nesting before producing formatted output', () => {
  assert.doesNotThrow(() => sql.formatSql(`${'('.repeat(sql.SQL_MAX_DEPTH)}1${')'.repeat(sql.SQL_MAX_DEPTH)}`));
  assert.throws(() => sql.formatSql(`${'('.repeat(sql.SQL_MAX_DEPTH + 1)}1${')'.repeat(sql.SQL_MAX_DEPTH + 1)}`), error => error.code === 'DEPTH_LIMIT');
});

test('aborts when formatted indentation would exceed the output budget', () => {
  const depth = Math.min(90, sql.SQL_MAX_DEPTH - 1);
  const columns = Array(5_000).fill('x').join(',');
  const input = `${'('.repeat(depth)}SELECT ${columns}${')'.repeat(depth)}`;
  assert.ok(input.length < sql.SQL_MAX_INPUT_CHARS);
  assert.throws(() => sql.formatSql(input), error => error.code === 'OUTPUT_TOO_LARGE');
});

test('rejects unknown dialects and non-string inputs without leaking values', () => {
  assert.throws(() => sql.minifySql('select 1', { dialect: 'oracle' }), error => error.code === 'DIALECT_INVALID');
  assert.throws(() => sql.minifySql({ password: 'not-to-echo' }), error => error.code === 'INPUT_INVALID' && !error.message.includes('not-to-echo'));
});
