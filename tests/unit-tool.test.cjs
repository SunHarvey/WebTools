'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  UNIT_CATEGORIES,
  convertValue,
  formatResult,
} = require('../unit/unit-tool.js');

test('defines at least six complete conversion categories', () => {
  for (const category of ['length', 'mass', 'temperature', 'area', 'volume', 'data']) {
    assert.ok(UNIT_CATEGORIES[category], `missing ${category}`);
    assert.ok(Object.keys(UNIT_CATEGORIES[category].units).length >= 3);
  }
});

test('converts between arbitrary length units in either direction', () => {
  assert.equal(convertValue('length', 1, 'kilometer', 'meter'), 1000);
  assert.equal(convertValue('length', 12, 'inch', 'foot'), 1);
});

test('converts mass, area, volume and binary data sizes', () => {
  assert.equal(convertValue('mass', 1, 'kilogram', 'gram'), 1000);
  assert.equal(convertValue('area', 1, 'hectare', 'squareMeter'), 10000);
  assert.equal(convertValue('volume', 1, 'liter', 'milliliter'), 1000);
  assert.equal(convertValue('data', 1, 'gibibyte', 'mebibyte'), 1024);
});

test('uses affine conversions for temperature', () => {
  assert.equal(convertValue('temperature', 0, 'celsius', 'fahrenheit'), 32);
  assert.equal(convertValue('temperature', 212, 'fahrenheit', 'celsius'), 100);
  assert.equal(convertValue('temperature', 0, 'celsius', 'kelvin'), 273.15);
});

test('rejects empty, non-finite, unknown and cross-category input', () => {
  assert.throws(() => convertValue('length', '', 'meter', 'foot'), /number/i);
  assert.throws(() => convertValue('length', 'Infinity', 'meter', 'foot'), /finite|number/i);
  assert.throws(() => convertValue('unknown', 1, 'meter', 'foot'), /category/i);
  assert.throws(() => convertValue('length', 1, 'meter', 'kilogram'), /unit/i);
});

test('formats useful precision without floating-point noise', () => {
  assert.equal(formatResult(0.1 + 0.2), '0.3');
  assert.equal(formatResult(1 / 3), '0.333333333333');
  assert.equal(formatResult(123456789012345), '123456789012345');
  assert.equal(formatResult(1e-10), '0.0000000001');
});
