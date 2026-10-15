'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const PDFLib = require('../pdf/vendor/pdf-lib.min.js');
const engine = require('../pdf/pdf-page-editor-engine.js');

async function makePdf(rotations = [0, 0, 0]) {
  const document = await PDFLib.PDFDocument.create();
  rotations.forEach((angle, index) => {
    const page = document.addPage([300 + index * 10, 400 + index * 10]);
    if (angle) page.setRotation(PDFLib.degrees(angle));
  });
  return new Uint8Array(await document.save());
}

async function inspectPdf(bytes) {
  const document = await PDFLib.PDFDocument.load(bytes);
  return document.getPages().map(page => ({
    rotation: page.getRotation().angle,
    width: page.getWidth(),
    height: page.getHeight(),
  }));
}

test('parses all pages, individual pages and non-overlapping page ranges', () => {
  assert.deepEqual(engine.parsePageSelection('all', 4), [0, 1, 2, 3]);
  assert.deepEqual(engine.parsePageSelection('1, 3-4', 4), [0, 2, 3]);
  assert.deepEqual(engine.parsePageSelection('2 - 3', 4), [1, 2]);
});

test('rejects malformed, overlapping, out-of-range and excessive page selections', () => {
  for (const [selection, code] of [
    ['', 'INVALID_RANGES'], ['all, 1', 'INVALID_RANGES'], ['1,,2', 'INVALID_RANGES'],
    ['3-2', 'PAGE_RANGE_OUT_OF_BOUNDS'], ['0', 'PAGE_RANGE_OUT_OF_BOUNDS'],
    ['1-3, 3-4', 'OVERLAPPING_PAGES'], ['5', 'PAGE_RANGE_OUT_OF_BOUNDS'],
    ['1,'.padEnd(258, ' '), 'INVALID_RANGES'],
  ]) {
    assert.throws(() => engine.parsePageSelection(selection, 4), { code });
  }
  assert.throws(() => engine.parsePageSelection('1', 501), { code: 'PAGE_LIMIT' });
});

test('rotates selected pages while preserving page count, size and existing orientation', async () => {
  const source = await makePdf([0, 90, 180]);
  const result = await engine.processPdfBuffer(source, '2', 'rotate-right', PDFLib);
  assert.equal(result.pageCount, 3);
  assert.equal(result.sourcePageCount, 3);
  assert.equal(result.changedPageCount, 1);
  assert.equal(result.action, 'rotate-right');
  assert.deepEqual((await inspectPdf(result.bytes)).map(page => page.rotation), [0, 180, 180]);
  assert.deepEqual((await inspectPdf(result.bytes)).map(page => page.width), [300, 310, 320]);
});

test('normalizes counterclockwise rotation for every page', async () => {
  const source = await makePdf([0, 90, 270]);
  const result = await engine.processPdfBuffer(source, 'all', 'rotate-left', PDFLib);
  assert.deepEqual((await inspectPdf(result.bytes)).map(page => page.rotation), [270, 0, 180]);
  assert.equal(result.changedPageCount, 3);
});

test('deletes selected pages and retains the remaining pages in source order', async () => {
  const source = await makePdf([0, 90, 180, 270]);
  const result = await engine.processPdfBuffer(source, '2, 4', 'delete', PDFLib);
  const pages = await inspectPdf(result.bytes);
  assert.equal(result.pageCount, 2);
  assert.equal(result.sourcePageCount, 4);
  assert.equal(result.changedPageCount, 2);
  assert.deepEqual(pages.map(page => page.width), [300, 320]);
  assert.deepEqual(pages.map(page => page.rotation), [0, 180]);
});

test('rejects deleting every page and unsupported operations', async () => {
  const source = await makePdf([0, 0]);
  await assert.rejects(engine.processPdfBuffer(source, 'all', 'delete', PDFLib), { code: 'DELETE_ALL_PAGES' });
  await assert.rejects(engine.processPdfBuffer(source, '1', 'compress', PDFLib), { code: 'INVALID_ACTION' });
});

test('rejects an output above the byte budget before serializing its buffer', async () => {
  const source = await makePdf([0]);
  let serialized = false;
  const boundedLibrary = {
    ...PDFLib,
    PDFWriter: {
      forContext: () => ({
        computeBufferSize: async () => ({ size: engine.PDF_PAGE_EDITOR_LIMITS.maxOutputBytes + 1 }),
        serializeToBuffer: async () => { serialized = true; return new Uint8Array([37, 80, 68, 70, 45]); },
      }),
    },
  };
  await assert.rejects(engine.processPdfBuffer(source, '1', 'rotate-right', boundedLibrary), { code: 'OUTPUT_SIZE_LIMIT' });
  assert.equal(serialized, false);
});

test('rejects malformed and over-limit PDFs with safe error codes', async () => {
  await assert.rejects(engine.processPdfBuffer(new TextEncoder().encode('not a PDF'), '1', 'rotate-right', PDFLib), { code: 'INVALID_PDF' });
  await assert.rejects(engine.processPdfBuffer(new Uint8Array(engine.PDF_PAGE_EDITOR_LIMITS.maxFileBytes + 1), '1', 'rotate-right', PDFLib), { code: 'FILE_SIZE_LIMIT' });
});
