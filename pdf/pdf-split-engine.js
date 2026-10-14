(function exposePdfSplitEngine(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PDFSplitEngine = api;
})(typeof globalThis === 'object' ? globalThis : self, function createPdfSplitEngine() {
  'use strict';
  const MIB = 1024 * 1024;
  const PDF_SPLIT_LIMITS = Object.freeze({
    maxFileBytes: 25 * MIB,
    maxPages: 500,
    maxRanges: 20,
    maxRangeChars: 256,
    maxOutputPages: 500,
    maxOutputBytes: 60 * MIB,
    taskTimeoutMs: 45_000,
  });
  const ERROR_CODES = new Set([
    'NO_FILE', 'FILE_EMPTY', 'FILE_SIZE_LIMIT', 'INVALID_PDF', 'PASSWORD_PROTECTED',
    'PAGE_LIMIT', 'INVALID_RANGES', 'RANGE_LIMIT', 'PAGE_RANGE_OUT_OF_BOUNDS',
    'OVERLAPPING_PAGES', 'OUTPUT_SIZE_LIMIT', 'PROCESSING_FAILED',
  ]);

  function pdfSplitError(code) {
    const error = new Error('PDF pages could not be split.');
    error.name = 'PdfSplitError';
    error.code = ERROR_CODES.has(code) ? code : 'PROCESSING_FAILED';
    return error;
  }

  function bytesOf(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return null;
  }

  function validatePdfSplitInput(file) {
    const size = Number(file?.size);
    if (!Number.isSafeInteger(size) || size <= 0) throw pdfSplitError('FILE_EMPTY');
    if (size > PDF_SPLIT_LIMITS.maxFileBytes) throw pdfSplitError('FILE_SIZE_LIMIT');
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

  function parsePageRanges(value, pageCount, limits = {}) {
    const maxChars = limits.maxRangeChars ?? PDF_SPLIT_LIMITS.maxRangeChars;
    const maxRanges = limits.maxRanges ?? PDF_SPLIT_LIMITS.maxRanges;
    const maxPages = limits.maxOutputPages ?? PDF_SPLIT_LIMITS.maxOutputPages;
    const source = typeof value === 'string' ? value.trim() : '';
    if (!source || source.length > maxChars || !Number.isSafeInteger(pageCount) || pageCount < 1 || pageCount > PDF_SPLIT_LIMITS.maxPages) {
      throw pdfSplitError(pageCount > PDF_SPLIT_LIMITS.maxPages ? 'PAGE_LIMIT' : 'INVALID_RANGES');
    }
    const parts = source.split(',');
    if (parts.length > maxRanges) throw pdfSplitError('RANGE_LIMIT');
    const seenPages = new Set();
    const ranges = [];
    let totalPages = 0;
    for (const rawPart of parts) {
      const part = rawPart.trim();
      const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
      if (!match) throw pdfSplitError('INVALID_RANGES');
      const first = Number(match[1]);
      const last = match[2] === undefined ? first : Number(match[2]);
      if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) throw pdfSplitError('INVALID_RANGES');
      if (first < 1 || last < first || last > pageCount) throw pdfSplitError('PAGE_RANGE_OUT_OF_BOUNDS');
      const pageIndices = [];
      for (let page = first; page <= last; page += 1) {
        if (seenPages.has(page)) throw pdfSplitError('OVERLAPPING_PAGES');
        seenPages.add(page);
        pageIndices.push(page - 1);
      }
      totalPages += pageIndices.length;
      if (totalPages > maxPages) throw pdfSplitError('PAGE_LIMIT');
      ranges.push({ label: first === last ? `page-${first}` : `pages-${first}-${last}`, pageIndices });
    }
    return ranges;
  }

  function assertOutputSize(value) {
    const bytes = bytesOf(value);
    if (!bytes || bytes.byteLength === 0) throw pdfSplitError('PROCESSING_FAILED');
    if (bytes.byteLength > PDF_SPLIT_LIMITS.maxOutputBytes) throw pdfSplitError('OUTPUT_SIZE_LIMIT');
    return bytes;
  }

  async function serializePdfWithinBudget(output, pdfLib, remainingBytes) {
    try {
      await output.prepareForSave({ addDefaultPage: false, updateFieldAppearances: false });
      const writer = pdfLib.PDFWriter.forContext(output.context, 50);
      const layout = await writer.computeBufferSize();
      assertAggregateOutputSize(layout?.size, remainingBytes);
      const bytes = bytesOf(await writer.serializeToBuffer());
      if (!bytes || bytes.byteLength !== layout.size) throw pdfSplitError('PROCESSING_FAILED');
      return assertOutputSize(bytes);
    } catch (error) {
      if (error?.code === 'OUTPUT_SIZE_LIMIT') throw error;
      throw pdfSplitError('PROCESSING_FAILED');
    }
  }

  function assertAggregateOutputSize(value, limit = PDF_SPLIT_LIMITS.maxOutputBytes) {
    const size = Number(value);
    const ceiling = Number(limit);
    if (!Number.isSafeInteger(size) || size < 0 || !Number.isSafeInteger(ceiling) || ceiling < 0 || ceiling > PDF_SPLIT_LIMITS.maxOutputBytes) {
      throw pdfSplitError('PROCESSING_FAILED');
    }
    if (size > ceiling) throw pdfSplitError('OUTPUT_SIZE_LIMIT');
    return size;
  }

  function classifyPdfSplitError(error) {
    if (ERROR_CODES.has(error?.code)) return error.code;
    if (/encrypted|password/i.test(String(error?.name || ''))) return 'PASSWORD_PROTECTED';
    return 'INVALID_PDF';
  }

  async function splitPdfBuffer(value, rangeExpression, pdfLib, onProgress) {
    const bytes = bytesOf(value);
    if (!bytes || bytes.byteLength === 0) throw pdfSplitError('FILE_EMPTY');
    if (bytes.byteLength > PDF_SPLIT_LIMITS.maxFileBytes) throw pdfSplitError('FILE_SIZE_LIMIT');
    if (!hasPdfHeader(bytes)) throw pdfSplitError('INVALID_PDF');
    if (!pdfLib?.PDFDocument || typeof pdfLib.PDFDocument.load !== 'function' || typeof pdfLib.PDFDocument.create !== 'function') {
      throw pdfSplitError('PROCESSING_FAILED');
    }
    let source;
    try {
      source = await pdfLib.PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
    } catch (error) {
      throw pdfSplitError(classifyPdfSplitError(error));
    }
    let sourcePages;
    try { sourcePages = source.getPageCount(); }
    catch { throw pdfSplitError('INVALID_PDF'); }
    if (!Number.isSafeInteger(sourcePages) || sourcePages < 1) throw pdfSplitError('INVALID_PDF');
    if (sourcePages > PDF_SPLIT_LIMITS.maxPages) throw pdfSplitError('PAGE_LIMIT');
    const ranges = parsePageRanges(rangeExpression, sourcePages);
    const files = [];
    let totalOutputBytes = 0;
    let outputPageCount = 0;
    for (let index = 0; index < ranges.length; index += 1) {
      let output;
      try { output = await pdfLib.PDFDocument.create(); }
      catch { throw pdfSplitError('PROCESSING_FAILED'); }
      let copiedPages;
      try { copiedPages = await output.copyPages(source, ranges[index].pageIndices); }
      catch { throw pdfSplitError('PROCESSING_FAILED'); }
      for (const page of copiedPages) output.addPage(page);
      let outputBytes;
      try { outputBytes = await serializePdfWithinBudget(output, pdfLib, PDF_SPLIT_LIMITS.maxOutputBytes - totalOutputBytes); }
      catch (error) { if (error?.code === 'OUTPUT_SIZE_LIMIT') throw error; throw pdfSplitError('PROCESSING_FAILED'); }
      if (!outputBytes) throw pdfSplitError('PROCESSING_FAILED');
      totalOutputBytes += outputBytes.byteLength;
      assertAggregateOutputSize(totalOutputBytes);
      if (!hasPdfHeader(outputBytes)) throw pdfSplitError('PROCESSING_FAILED');
      outputPageCount += ranges[index].pageIndices.length;
      files.push({ name: `${ranges[index].label}.pdf`, bytes: outputBytes, pageCount: ranges[index].pageIndices.length });
      if (typeof onProgress === 'function') {
        try { onProgress({ completedRanges: index + 1, rangeCount: ranges.length, pageCount: outputPageCount }); }
        catch { /* Progress reporting must not affect the split. */ }
      }
    }
    return { files, rangeCount: ranges.length, pageCount: outputPageCount, totalOutputBytes };
  }

  return Object.freeze({ PDF_SPLIT_LIMITS, pdfSplitError, validatePdfSplitInput, hasPdfHeader, parsePageRanges, assertOutputSize, assertAggregateOutputSize, classifyPdfSplitError, splitPdfBuffer });
});