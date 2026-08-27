'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const cjk = /[\u3400-\u9fff]/;

test('unit labels and statuses resolve to one language', () => {
  const { localizeUnitLabel, unitMessage } = require('../unit/unit-tool.js');
  assert.equal(localizeUnitLabel('Length · 长度', 'en'), 'Length');
  assert.equal(localizeUnitLabel('Length · 长度', 'zh'), '长度');
  assert.doesNotMatch(unitMessage('converted', 'en'), cjk);
  assert.match(unitMessage('converted', 'zh'), cjk);
});

test('color statuses resolve to one language', () => {
  const { colorMessage } = require('../color/color-tool.js');
  assert.doesNotMatch(colorMessage('converted', 'en'), cjk);
  assert.match(colorMessage('converted', 'zh'), cjk);
  assert.equal(colorMessage('pass', 'en'), 'Pass');
  assert.equal(colorMessage('pass', 'zh'), '通过');
});

test('image statuses resolve to one language', () => {
  const { imageMessage, imageSelectedFileName } = require('../image/image-tool.js');
  assert.doesNotMatch(imageMessage('noResult', 'en'), cjk);
  assert.match(imageMessage('noResult', 'zh'), cjk);
  assert.doesNotMatch(imageMessage('processing', 'en'), cjk);
  assert.match(imageMessage('processing', 'zh'), cjk);
  assert.equal(imageSelectedFileName({ name: 'photo.png' }, 'en'), 'photo.png');
  assert.equal(imageSelectedFileName(null, 'en'), 'No image selected');
  assert.equal(imageSelectedFileName(null, 'zh-CN'), '尚未选择图片');
});

test('hash file-name display resolves to one language', () => {
  const { hashSelectedFileName } = require('../hash/hash-tool.js');
  assert.equal(hashSelectedFileName({ name: 'archive.zip' }, 'en'), 'archive.zip');
  assert.equal(hashSelectedFileName(null, 'en'), 'No file selected');
  assert.equal(hashSelectedFileName(null, 'zh-CN'), '尚未选择文件');
});

test('calculator error display resolves to one language', () => {
  const { calculatorMessage } = require('../calculator/calculator.js');
  assert.equal(calculatorMessage('error', 'en'), 'Error');
  assert.equal(calculatorMessage('error', 'zh'), '错误');
});

for (const [name, modulePath, exportName, key] of [
  ['JSON', '../json/json-tool.js', 'jsonMessage', 'valid'],
  ['text', '../text/text-tool.js', 'textMessage', 'ready'],
  ['encode', '../encode/encode-tool.js', 'encodeMessage', 'done'],
  ['timestamp', '../timestamp/timestamp-tool.js', 'timestampMessage', 'converted'],
  ['UUID', '../uuid/uuid-tool.js', 'uuidMessage', 'copied'],
  ['hash', '../hash/hash-tool.js', 'hashMessage', 'calculating'],
  ['QR', '../qr/qr-tool.js', 'qrMessage', 'failed'],
]) {
  test(`${name} dynamic statuses resolve to one language`, () => {
    const message = require(modulePath)[exportName];
    assert.doesNotMatch(message(key, 'en'), cjk);
    assert.match(message(key, 'zh'), cjk);
  });
}
