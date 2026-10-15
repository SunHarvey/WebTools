(function exposePdfPageEditorEngine(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PDFPageEditorEngine = api;
})(typeof globalThis === 'object' ? globalThis : self, function createPdfPageEditorEngine() {
  'use strict';

  const MIB = 1024 * 1024;
  const PDF_PAGE_EDITOR_LIMITS = Object.freeze({
    maxFileBytes: 25 * MIB,
    maxPages: 500,
    maxRanges: 20,
    maxRangeChars: 256,
    maxOutputBytes: 60 * MIB,
    taskTimeoutMs: 45_000,
  });
  const ERROR_CODES = new Set([
    'FILE_EMPTY', 'FILE_SIZE_LIMIT', 'INVALID_PDF', 'PASSWORD_PROTECTED', 'PAGE_LIMIT',
    'INVALID_RANGES', 'RANGE_LIMIT', 'PAGE_RANGE_OUT_OF_BOUNDS', 'OVERLAPPING_PAGES',
    'INVALID_ACTION', 'DELETE_ALL_PAGES', 'OUTPUT_SIZE_LIMIT', 'PROCESSING_FAILED',
  ]);
  const PDF_PAGE_EDITOR_ACTIONS = Object.freeze(['rotate-right', 'rotate-left', 'rotate-180', 'delete']);
  const ROTATION_DEGREES = Object.freeze({ 'rotate-right': 90, 'rotate-left': -90, 'rotate-180': 180 });

  function pdfPageEditorError(code) {
    const error = new Error('PDF pages could not be edited.');
    error.name = 'PdfPageEditorError';
    error.code = ERROR_CODES.has(code) ? code : 'PROCESSING_FAILED';
    return error;
  }

  function bytesOf(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return null;
  }

  function validatePdfPageEditorFile(file) {
    const size = Number(file?.size);
    if (!Number.isSafeInteger(size) || size <= 0) throw pdfPageEditorError('FILE_EMPTY');
    if (size > PDF_PAGE_EDITOR_LIMITS.maxFileBytes) throw pdfPageEditorError('FILE_SIZE_LIMIT');
    return { size };
  }

  function hasPdfHeader(value) {
    const bytes = bytesOf(value);
    if (!bytes || bytes.length < 5) return false;
    const lastOffset = Math.min(bytes.length - 5, 1024);
    for (let offset = 0; offset <= lastOffset; offset += 1) {
      if (bytes[offset] === 0x25 && bytes[offset + 1] === 0x50 && bytes[offset + 2] === 0x44 && bytes[offset + 3] === 0x46 && bytes[offset + 4] === 0x2d) return true;
    }
    return false;
  }

  function parsePageSelection(value, pageCount, limits = {}) {
    const maxChars = limits.maxRangeChars ?? PDF_PAGE_EDITOR_LIMITS.maxRangeChars;
    const maxRanges = limits.maxRanges ?? PDF_PAGE_EDITOR_LIMITS.maxRanges;
    const maxPages = limits.maxPages ?? PDF_PAGE_EDITOR_LIMITS.maxPages;
    const raw = typeof value === 'string' ? value : '';
    if (!Number.isSafeInteger(pageCount) || pageCount < 1 || pageCount > PDF_PAGE_EDITOR_LIMITS.maxPages) {
      throw pdfPageEditorError(pageCount > PDF_PAGE_EDITOR_LIMITS.maxPages ? 'PAGE_LIMIT' : 'INVALID_RANGES');
    }
    if (!raw.trim() || raw.length > maxChars) throw pdfPageEditorError('INVALID_RANGES');
    const source = raw.trim();
    if (source.toLowerCase() === 'all') return Array.from({ length: pageCount }, (_, index) => index);
    const parts = source.split(',');
    if (parts.length > maxRanges) throw pdfPageEditorError('RANGE_LIMIT');
    const selected = new Set();
    for (const rawPart of parts) {
      const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(rawPart.trim());
      if (!match) throw pdfPageEditorError('INVALID_RANGES');
      const first = Number(match[1]);
      const last = match[2] === undefined ? first : Number(match[2]);
      if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) throw pdfPageEditorError('INVALID_RANGES');
      if (first < 1 || last < first || last > pageCount) throw pdfPageEditorError('PAGE_RANGE_OUT_OF_BOUNDS');
      for (let page = first; page <= last; page += 1) {
        if (selected.has(page)) throw pdfPageEditorError('OVERLAPPING_PAGES');
        selected.add(page);
      }
      if (selected.size > maxPages) throw pdfPageEditorError('PAGE_LIMIT');
    }
    return Array.from(selected, page => page - 1);
  }

  function assertOutputByteCount(value) {
    const size = Number(value);
    if (!Number.isSafeInteger(size) || size < 1) throw pdfPageEditorError('PROCESSING_FAILED');
    if (size > PDF_PAGE_EDITOR_LIMITS.maxOutputBytes) throw pdfPageEditorError('OUTPUT_SIZE_LIMIT');
    return size;
  }

  function assertOutputSize(value) {
    const bytes = bytesOf(value);
    if (!bytes || bytes.byteLength === 0) throw pdfPageEditorError('PROCESSING_FAILED');
    assertOutputByteCount(bytes.byteLength);
    return bytes;
  }

  async function serializeWithinBudget(document, pdfLib) {
    try {
      await document.prepareForSave({ addDefaultPage: false, updateFieldAppearances: false });
      const writer = pdfLib.PDFWriter.forContext(document.context, 50);
      const layout = await writer.computeBufferSize();
      assertOutputByteCount(layout?.size);
      const bytes = bytesOf(await writer.serializeToBuffer());
      if (!bytes || bytes.byteLength !== layout.size) throw pdfPageEditorError('PROCESSING_FAILED');
      return assertOutputSize(bytes);
    } catch (error) {
      if (error?.code === 'OUTPUT_SIZE_LIMIT') throw error;
      throw pdfPageEditorError('PROCESSING_FAILED');
    }
  }

  function classifyPdfPageEditorError(error) {
    if (ERROR_CODES.has(error?.code)) return error.code;
    if (/encrypted|password/i.test(String(error?.name || ''))) return 'PASSWORD_PROTECTED';
    return 'INVALID_PDF';
  }

  async function processPdfBuffer(value, selection, action, pdfLib, onProgress) {
    const bytes = bytesOf(value);
    if (!bytes || bytes.byteLength === 0) throw pdfPageEditorError('FILE_EMPTY');
    if (bytes.byteLength > PDF_PAGE_EDITOR_LIMITS.maxFileBytes) throw pdfPageEditorError('FILE_SIZE_LIMIT');
    if (!hasPdfHeader(bytes)) throw pdfPageEditorError('INVALID_PDF');
    if (!ROTATION_DEGREES[action] && action !== 'delete') throw pdfPageEditorError('INVALID_ACTION');
    if (!pdfLib?.PDFDocument || typeof pdfLib.PDFDocument.load !== 'function' || typeof pdfLib.PDFWriter?.forContext !== 'function' || typeof pdfLib.degrees !== 'function') {
      throw pdfPageEditorError('PROCESSING_FAILED');
    }

    let document;
    try {
      document = await pdfLib.PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
    } catch (error) {
      throw pdfPageEditorError(classifyPdfPageEditorError(error));
    }
    let pageCount;
    try { pageCount = document.getPageCount(); }
    catch { throw pdfPageEditorError('INVALID_PDF'); }
    if (!Number.isSafeInteger(pageCount) || pageCount < 1) throw pdfPageEditorError('INVALID_PDF');
    if (pageCount > PDF_PAGE_EDITOR_LIMITS.maxPages) throw pdfPageEditorError('PAGE_LIMIT');
    const sourcePageCount = pageCount;

    const pageIndices = parsePageSelection(selection, pageCount);
    if (action === 'delete' && pageIndices.length === pageCount) throw pdfPageEditorError('DELETE_ALL_PAGES');
    try {
      if (action === 'delete') {
        for (const index of [...pageIndices].sort((left, right) => right - left)) document.removePage(index);
      } else {
        for (const index of pageIndices) {
          const page = document.getPage(index);
          const currentAngle = page.getRotation().angle;
          if (!Number.isFinite(currentAngle) || currentAngle % 90 !== 0) throw pdfPageEditorError('PROCESSING_FAILED');
          const angle = ((currentAngle + ROTATION_DEGREES[action]) % 360 + 360) % 360;
          page.setRotation(pdfLib.degrees(angle));
        }
      }
    } catch (error) {
      if (error?.code === 'PROCESSING_FAILED') throw error;
      throw pdfPageEditorError('PROCESSING_FAILED');
    }

    if (typeof onProgress === 'function') {
      try { onProgress({ action, changedPageCount: pageIndices.length, pageCount: document.getPageCount() }); }
      catch { /* Progress reporting must not affect PDF editing. */ }
    }
    const output = await serializeWithinBudget(document, pdfLib);
    if (!hasPdfHeader(output)) throw pdfPageEditorError('PROCESSING_FAILED');
    return { bytes: output, action, changedPageCount: pageIndices.length, sourcePageCount, pageCount: document.getPageCount() };
  }

  return Object.freeze({
    PDF_PAGE_EDITOR_LIMITS,
    PDF_PAGE_EDITOR_ACTIONS,
    pdfPageEditorError,
    validatePdfPageEditorFile,
    hasPdfHeader,
    parsePageSelection,
    assertOutputSize,
    classifyPdfPageEditorError,
    processPdfBuffer,
  });
});
