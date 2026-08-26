'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  parseHex,
  normalizeRgb,
  rgbToHex,
  normalizeHsl,
  rgbToHsl,
  hslToRgb,
  formatHsl,
  contrastRatio,
  formatContrastRatio,
  getWcagCompliance,
  attachColorTool,
} = require('../color/color-tool.js');

test('parses three and six digit HEX colors', () => {
  assert.deepEqual(parseHex('#0f8'), { r: 0, g: 255, b: 136 });
  assert.deepEqual(parseHex('336699'), { r: 51, g: 102, b: 153 });
});

test('rejects malformed HEX and normalizes RGB boundaries', () => {
  for (const value of ['', '#12', '#abcd', '#gggggg', '1234567']) {
    assert.throws(() => parseHex(value), /HEX/i);
  }
  assert.deepEqual(normalizeRgb({ r: -4.4, g: 127.6, b: 999 }), { r: 0, g: 128, b: 255 });
  assert.equal(rgbToHex({ r: 0, g: 128, b: 255 }), '#0080FF');
  assert.throws(() => normalizeRgb({ r: 'red', g: 0, b: 0 }), /RGB/i);
  assert.throws(() => normalizeRgb(null), /RGB/i);
  assert.throws(() => normalizeRgb({ r: '', g: 0, b: 0 }), /RGB/i);
});

test('converts RGB and HSL while wrapping hue and clamping saturation/lightness', () => {
  assert.deepEqual(rgbToHsl({ r: 51, g: 102, b: 153 }), { h: 210, s: 50, l: 40 });
  assert.deepEqual(hslToRgb({ h: 120, s: 100, l: 50 }), { r: 0, g: 255, b: 0 });
  assert.deepEqual(normalizeHsl({ h: -30, s: 120, l: -10 }), { h: 330, s: 100, l: 0 });
  assert.equal(formatHsl({ h: 210, s: 50, l: 40 }), 'hsl(210, 50%, 40%)');
  assert.throws(() => normalizeHsl({ h: Infinity, s: 50, l: 50 }), /HSL/i);
  assert.throws(() => normalizeHsl(null), /HSL/i);
  assert.throws(() => normalizeHsl({ h: '', s: 50, l: 50 }), /HSL/i);
});

test('calculates WCAG contrast and AA/AAA compliance for normal and large text', () => {
  assert.equal(contrastRatio(parseHex('#000'), parseHex('#fff')), 21);
  assert.ok(Math.abs(contrastRatio(parseHex('#777'), parseHex('#fff')) - 4.478) < 0.001);
  assert.deepEqual(getWcagCompliance(7), {
    aaNormal: true,
    aaLarge: true,
    aaaNormal: true,
    aaaLarge: true,
  });
  assert.deepEqual(getWcagCompliance(4.5), {
    aaNormal: true,
    aaLarge: true,
    aaaNormal: false,
    aaaLarge: true,
  });
  assert.deepEqual(getWcagCompliance(3), {
    aaNormal: false,
    aaLarge: true,
    aaaNormal: false,
    aaaLarge: false,
  });
});

test('formats contrast ratios conservatively without overstating a failing value', () => {
  assert.equal(formatContrastRatio(4.499888), '4.49');
  assert.equal(formatContrastRatio(4.5), '4.50');
  assert.equal(getWcagCompliance(4.499888).aaNormal, false);
  assert.equal(getWcagCompliance(4.5).aaNormal, true);
});

test('browser UI exposes conversion, preview, contrast and copy controls safely', () => {
  const html = fs.readFileSync(path.join(__dirname, '../color/index.html'), 'utf8');
  const script = fs.readFileSync(path.join(__dirname, '../color/color-tool.js'), 'utf8');
  for (const id of ['hexInput', 'rgbR', 'hslH', 'colorPreview', 'contrastA', 'contrastB', 'contrastRatio', 'copyResults']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(script, /\.innerHTML\s*=|\.outerHTML\s*=/);
  assert.match(script, /textContent\s*=/);
  assert.match(script, /\.value\s*=/);
});

test('browser initializer binds HEX conversion and updates results', () => {
  const ids = ['hexInput', 'rgbR', 'rgbG', 'rgbB', 'hslH', 'hslS', 'hslL', 'colorPreview', 'hexResult', 'rgbResult', 'hslResult', 'fromHex', 'fromRgb', 'fromHsl', 'copyResults', 'convertStatus', 'contrastA', 'contrastB', 'pickerA', 'pickerB', 'checkContrast', 'copyContrast', 'contrastSample', 'contrastRatio', 'aaNormal', 'aaLarge', 'aaaNormal', 'aaaLarge', 'contrastStatus'];
  const elements = Object.fromEntries(ids.map(id => [id, {
    id, value: '', textContent: '', style: {}, dataset: {}, listeners: {},
    addEventListener(type, handler) { this.listeners[type] = handler; },
  }]));
  elements.hexInput.value = '#ff0000';
  elements.contrastA.value = '#000000';
  elements.contrastB.value = '#ffffff';
  const documentStub = { getElementById: id => elements[id] || null };
  assert.equal(attachColorTool(documentStub, { clipboard: { writeText: async () => {} } }), true);
  elements.fromHex.listeners.click();
  assert.equal(elements.rgbResult.textContent, 'rgb(255, 0, 0)');
  assert.equal(elements.hslResult.textContent, 'hsl(0, 100%, 50%)');
  elements.contrastA.value = '#777';
  elements.contrastB.value = '#fff';
  elements.checkContrast.listeners.click();
  assert.equal(elements.aaNormal.dataset.pass, 'false');
  assert.equal(elements.aaLarge.dataset.pass, 'true');
});
