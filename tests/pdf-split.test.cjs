'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const engine = require('../pdf/pdf-split-engine.js');
const PDFLib = require('../pdf/vendor/pdf-lib.min.js');

async function makePdf(pageCount) {
  const document = await PDFLib.PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) document.addPage([200 + index, 300 + index]);
  return new Uint8Array(await document.save());
}

test('parses page selections into separate ordered output ranges', () => {
  assert.deepEqual(engine.parsePageRanges('1-3, 5, 8-10', 10), [
    { label: 'pages-1-3', pageIndices: [0, 1, 2] },
    { label: 'page-5', pageIndices: [4] },
    { label: 'pages-8-10', pageIndices: [7, 8, 9] },
  ]);
});

test('rejects malformed, reversed, overlapping, out-of-bounds, and excessive page selections', () => {
  for (const value of ['', '1,,2', '0', '1-0', '3-2', '1-2,2-4', '1-11']) {
    assert.throws(() => engine.parsePageRanges(value, 10));
  }
  assert.throws(() => engine.parsePageRanges('1,2,3,4', 10, { maxRanges: 3 }), { code: 'RANGE_LIMIT' });
  assert.throws(() => engine.parsePageRanges('1'.repeat(300), 10), { code: 'INVALID_RANGES' });
});

test('splits a local PDF into readable PDFs preserving selected page order and dimensions', async () => {
  const source = await makePdf(5);
  const result = await engine.splitPdfBuffer(source, '4-5, 1, 3', PDFLib);
  assert.equal(result.pageCount, 4);
  assert.equal(result.rangeCount, 3);
  assert.deepEqual(result.files.map(file => file.name), ['pages-4-5.pdf', 'page-1.pdf', 'page-3.pdf']);
  const outputs = await Promise.all(result.files.map(file => PDFLib.PDFDocument.load(file.bytes)));
  assert.deepEqual(outputs.map(document => document.getPageCount()), [2, 1, 1]);
  assert.deepEqual(outputs.flatMap(document => document.getPages().map(page => page.getSize())), [
    { width: 203, height: 303 }, { width: 204, height: 304 },
    { width: 200, height: 300 }, { width: 202, height: 302 },
  ]);
});

test('rejects an output above the remaining byte budget before allocating its serialized buffer', async () => {
  const source = await makePdf(1);
  let serialized = false;
  const boundedLibrary = {
    ...PDFLib,
    PDFWriter: {
      forContext: () => ({
        computeBufferSize: async () => ({ size: engine.PDF_SPLIT_LIMITS.maxOutputBytes + 1 }),
        serializeToBuffer: async () => { serialized = true; return new Uint8Array([37, 80, 68, 70, 45]); },
      }),
    },
  };
  await assert.rejects(engine.splitPdfBuffer(source, '1', boundedLibrary), { code: 'OUTPUT_SIZE_LIMIT' });
  assert.equal(serialized, false, 'oversized PDF serialization was attempted');
});

test('enforces input, page, range, and aggregate output bounds with safe errors', async () => {
  const valid = await makePdf(2);
  await assert.rejects(engine.splitPdfBuffer(new TextEncoder().encode('private-marker'), '1', PDFLib), { code: 'INVALID_PDF' });
  await assert.rejects(engine.splitPdfBuffer(valid, '1-3', PDFLib), { code: 'PAGE_RANGE_OUT_OF_BOUNDS' });
  assert.throws(() => engine.validatePdfSplitInput({ size: engine.PDF_SPLIT_LIMITS.maxFileBytes + 1 }), { code: 'FILE_SIZE_LIMIT' });
  assert.throws(() => engine.assertAggregateOutputSize(61, 60), { code: 'OUTPUT_SIZE_LIMIT' });
  assert.doesNotThrow(() => engine.assertAggregateOutputSize(60, 60));
  assert.equal(engine.assertOutputSize(valid).byteLength, valid.byteLength);
  assert.throws(() => engine.assertOutputSize(new Uint8Array(0)), { code: 'PROCESSING_FAILED' });
  const error = engine.pdfSplitError('INVALID_PDF');
  assert.doesNotMatch(error.message, /private-marker|secret\.pdf/);
});
