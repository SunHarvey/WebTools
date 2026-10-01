'use strict';

const { before, test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
let yaml;

before(async () => {
  yaml = await import('../yaml/yaml-engine.mjs');
});

const example = 'name: UtilCover\nenabled: true\nitems:\n  - one\n  - two\n';

test('formats one YAML 1.2 document without changing JSON-compatible values', () => {
  const output = yaml.formatYaml(example);
  assert.match(output, /name: UtilCover/);
  assert.match(output, /enabled: true/);
  assert.deepEqual(JSON.parse(yaml.yamlToJson(output)), {
    name: 'UtilCover', enabled: true, items: ['one', 'two']
  });
});

test('converts YAML to readable JSON using JSON-compatible scalar rules', () => {
  const output = yaml.yamlToJson('enabled: true\nversion: "1.0"\ncount: 2\n');
  assert.equal(output, '{\n  "enabled": true,\n  "version": "1.0",\n  "count": 2\n}');
});

test('converts JSON to YAML and preserves string values that resemble YAML scalars', () => {
  const output = yaml.jsonToYaml('{"enabled":true,"version":"1.0","label":"on"}');
  assert.deepEqual(JSON.parse(yaml.yamlToJson(output)), {
    enabled: true, version: '1.0', label: 'on'
  });
});

test('rejects non-finite YAML and JSON numbers instead of silently converting them to null', () => {
  for (const source of ['!!float .inf\n', 'value: !!float -.inf\n', 'value: !!float .nan\n']) {
    assert.throws(() => yaml.yamlToJson(source), error => error.code === 'NON_FINITE_NUMBER');
    assert.throws(() => yaml.formatYaml(source), error => error.code === 'NON_FINITE_NUMBER');
  }
  assert.throws(() => yaml.jsonToYaml('1e400'), error => error.code === 'NON_FINITE_NUMBER');
});

test('reports duplicate-key YAML errors with one-based line and column', () => {
  assert.throws(() => yaml.formatYaml('name: first\nname: second\n'), error => {
    assert.equal(error.code, 'YAML_PARSE_ERROR');
    assert.equal(error.line, 2);
    assert.ok(Number.isInteger(error.column) && error.column >= 1);
    assert.match(error.message, /duplicate|already defined/i);
    return true;
  });
});

test('rejects multi-document streams and non-JSON custom tags', () => {
  for (const source of ['---\na: 1\n---\nb: 2\n', 'value: !!binary SGVsbG8=\n']) {
    assert.throws(() => yaml.formatYaml(source), error => error.code === 'YAML_PARSE_ERROR');
  }
});

test('rejects oversized input before parsing and exposes the documented bound', () => {
  assert.ok(yaml.YAML_MAX_INPUT_CHARS > 0);
  assert.throws(() => yaml.formatYaml('a'.repeat(yaml.YAML_MAX_INPUT_CHARS + 1)), error => {
    assert.equal(error.code, 'INPUT_TOO_LARGE');
    return true;
  });
});

test('rejects oversized object graphs before producing output', () => {
  const items = Array.from({ length: yaml.YAML_MAX_NODES }, () => '  - x').join('\n');
  assert.throws(() => yaml.yamlToJson(`items:\n${items}\n`), error => error.code === 'NODE_LIMIT');
});

test('bounds alias expansion and cyclic YAML graphs before serialization', () => {
  assert.throws(() => yaml.formatYaml('base: &base [1]\n' + Array.from({ length: 70 }, (_, i) => `copy${i}: *base`).join('\n')), error => {
    assert.equal(error.code, 'YAML_PARSE_ERROR');
    return true;
  });
  assert.throws(() => yaml.yamlToJson('loop: &loop [*loop]\n'), error => {
    assert.equal(error.code, 'DEPTH_LIMIT');
    return true;
  });
});

test('rejects excessive nesting before formatting', () => {
  const depth = yaml.YAML_MAX_DEPTH + 1;
  const source = `${'['.repeat(depth)}0${']'.repeat(depth)}`;
  assert.throws(() => yaml.formatYaml(source), error => ['YAML_PARSE_ERROR', 'DEPTH_LIMIT'].includes(error.code));
});

test('rejects deep JSON before YAML serialization', () => {
  const depth = yaml.YAML_MAX_DEPTH + 1;
  const source = `${'['.repeat(depth)}0${']'.repeat(depth)}`;
  assert.throws(() => yaml.jsonToYaml(source), error => error.code === 'DEPTH_LIMIT');
});

test('YAML serialization preserves strings that resemble YAML 1.1 scalars and numbers', () => {
  const source = 'switch: "on"\ncode: "0_30"\nleading: "01234"\ndate: "2026-10-01"\n';
  const formatted = yaml.formatYaml(source);
  assert.deepEqual(JSON.parse(yaml.yamlToJson(formatted)), {
    switch: 'on', code: '0_30', leading: '01234', date: '2026-10-01'
  });
});

test('converts non-string YAML keys to JSON property names explicitly', () => {
  assert.deepEqual(JSON.parse(yaml.yamlToJson('1: one\n')), { '1': 'one' });
});

test('registers YAML as a private local tool and includes its local MIT notice', () => {
  const { findTool, RELATED_TOOLS } = require('../shared/tools-data.js');
  const tool = findTool('yaml');
  assert.equal(tool.recordRecent, false);
  assert.equal(tool.name.en, 'YAML Formatter');
  assert.equal(tool.name.zh, 'YAML 格式化工具');
  assert.deepEqual(RELATED_TOOLS.yaml, ['json', 'text-diff', 'encode']);
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.match(packageJson.scripts['check:js'], /yaml\/yaml-engine\.mjs/);
  assert.match(packageJson.scripts['check:js'], /yaml\/yaml-tool\.mjs/);
  assert.match(packageJson.scripts['check:js'], /yaml\/yaml-app\.mjs/);
  const notice = fs.readFileSync(path.join(__dirname, '..', 'yaml/vendor/LICENSE-js-yaml.txt'), 'utf8');
  assert.match(notice, /MIT License/);
  const upstream = fs.readFileSync(path.join(__dirname, '..', 'yaml/vendor/UPSTREAM.md'), 'utf8');
  assert.match(upstream, /js-yaml` 5\.4\.2/);
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'yaml/yaml-app.mjs'), 'utf8');
  const engineSource = fs.readFileSync(path.join(__dirname, '..', 'yaml/yaml-engine.mjs'), 'utf8');
  assert.match(appSource, /from '\.\/yaml-engine\.mjs'/);
  assert.match(engineSource, /from '\.\/vendor\/js-yaml-5\.4\.2\.mjs'/);
  assert.equal(
    crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', 'yaml/vendor/js-yaml-5.4.2.mjs'))).digest('hex'),
    '86ac62558d7cd103ff5f5a10a885ebecc04c23ca2f1487522864b49221edc25c'
  );
  for (const page of ['yaml/index.html', 'zh/yaml/index.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
    assert.match(html, /yaml-app\.mjs/);
    assert.doesNotMatch(html, /js-yaml-5\.4\.2\.umd\.min\.js/);
    assert.match(html, /never uploaded|不会上传/);
    assert.doesNotMatch(html, /<script[^>]+src="https?:\/\//i);
  }
});

test('reports malformed JSON without echoing the submitted text', () => {
  const source = '{"token": }';
  assert.throws(() => yaml.jsonToYaml(source), error => {
    assert.equal(error.code, 'JSON_PARSE_ERROR');
    assert.equal(error.message.includes(source), false);
    return true;
  });
});