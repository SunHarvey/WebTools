'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const engine = require('../pdf/pdf-engine.js');
const PDFLib = require('../pdf/vendor/pdf-lib.min.js');

async function makePdf(sizes) {
  const document = await PDFLib.PDFDocument.create();
  for (const size of sizes) document.addPage(size);
  return new Uint8Array(await document.save());
}

test('defines conservative PDF merge resource limits', () => {
  assert.deepEqual(engine.PDF_LIMITS, {
    maxFiles: 20,
    maxFileBytes: 25 * 1024 * 1024,
    maxTotalBytes: 40 * 1024 * 1024,
    maxPages: 500,
    maxOutputBytes: 60 * 1024 * 1024,
    taskTimeoutMs: 45_000,
  });
});

test('validates file count, per-file size and aggregate bytes before reads', () => {
  const { maxFiles, maxFileBytes, maxTotalBytes } = engine.PDF_LIMITS;
  assert.deepEqual(engine.validatePdfFileList([{ size: maxFileBytes }]), { fileCount: 1, totalBytes: maxFileBytes });
  assert.throws(() => engine.validatePdfFileList([]), { code: 'NO_FILES' });
  assert.throws(() => engine.validatePdfFileList(Array(maxFiles + 1).fill({ size: 1 })), { code: 'FILE_COUNT_LIMIT' });
  assert.throws(() => engine.validatePdfFileList([{ size: maxFileBytes + 1 }]), { code: 'FILE_SIZE_LIMIT' });
  assert.throws(() => engine.validatePdfFileList([{ size: 0 }]), { code: 'FILE_EMPTY' });
  assert.deepEqual(engine.validatePdfFileList([{ size: maxTotalBytes / 2 }, { size: maxTotalBytes / 2 }]), {
    fileCount: 2, totalBytes: maxTotalBytes,
  });
  assert.throws(() => engine.validatePdfFileList([{ size: maxTotalBytes / 2 }, { size: maxTotalBytes / 2 + 1 }]), { code: 'TOTAL_SIZE_LIMIT' });
});

test('recognizes PDF headers only within the format allowance', () => {
  const direct = new TextEncoder().encode('%PDF-1.7\n');
  assert.equal(engine.hasPdfHeader(direct), true);
  const leading = new Uint8Array(1024);
  leading.set(new TextEncoder().encode('%PDF-1.4'), 1016);
  assert.equal(engine.hasPdfHeader(leading), true);
  const outside = new Uint8Array(1040);
  outside.set(new TextEncoder().encode('%PDF-1.4'), 1025);
  assert.equal(engine.hasPdfHeader(outside), false);
  assert.equal(engine.hasPdfHeader(new TextEncoder().encode('not a PDF')), false);
});

test('merges pages in selected order and produces a readable PDF', async () => {
  const first = await makePdf([[200, 300], [210, 310]]);
  const second = await makePdf([[400, 500]]);
  const result = await engine.mergePdfBuffers([first, second], PDFLib);
  assert.equal(result.fileCount, 2);
  assert.equal(result.pageCount, 3);
  assert.ok(result.bytes instanceof Uint8Array);
  assert.equal(engine.hasPdfHeader(result.bytes), true);
  const merged = await PDFLib.PDFDocument.load(result.bytes);
  assert.equal(merged.getPageCount(), 3);
  assert.deepEqual(merged.getPages().map(page => page.getSize()), [
    { width: 200, height: 300 }, { width: 210, height: 310 }, { width: 400, height: 500 },
  ]);
});

test('rejects a single-file merge and invalid PDF bytes with safe error codes', async () => {
  await assert.rejects(engine.mergePdfBuffers([new Uint8Array([37, 80, 68, 70, 45])], PDFLib), { code: 'NEED_MULTIPLE_FILES' });
  await assert.rejects(
    engine.mergePdfBuffers([new TextEncoder().encode('%PDF-1.7 private-marker-001'), new TextEncoder().encode('%PDF-1.7')], PDFLib),
    error => error.code === 'INVALID_PDF' && !error.message.includes('private-marker-001'),
  );
});

test('rejects a merged page count beyond the documented limit', async () => {
  let added = 0;
  const fakeLibrary = {
    PDFDocument: {
      create: async () => ({
        copyPages: async (_source, indices) => indices.map(() => ({})),
        addPage: () => { added += 1; },
        save: async () => new Uint8Array([37, 80, 68, 70, 45]),
      }),
      load: async () => ({ getPageIndices: () => Array.from({ length: engine.PDF_LIMITS.maxPages + 1 }, (_, index) => index) }),
    },
  };
  const input = new TextEncoder().encode('%PDF-1.7');
  await assert.rejects(engine.mergePdfBuffers([input, input], fakeLibrary), { code: 'PAGE_LIMIT' });
  assert.equal(added, 0);
});

test('enforces output cap and never forwards raw parser messages', () => {
  assert.throws(() => engine.assertOutputSize(new Uint8Array(11), 10), { code: 'OUTPUT_SIZE_LIMIT' });
  assert.doesNotThrow(() => engine.assertOutputSize(new Uint8Array(10), 10));
  assert.equal(engine.classifyPdfError(Object.assign(new Error('private-marker-002'), { name: 'EncryptedPDFError' })), 'PASSWORD_PROTECTED');
  assert.equal(engine.classifyPdfError(new Error('private-marker-002')), 'INVALID_PDF');
});
