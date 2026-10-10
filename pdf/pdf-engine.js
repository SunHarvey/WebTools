(function exposePdfMergeEngine(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PDFMergeEngine = api;
})(typeof globalThis === 'object' ? globalThis : self, function createPdfMergeEngine() {
  'use strict';
  const MIB = 1024 * 1024;
  const PDF_LIMITS = Object.freeze({ maxFiles: 20, maxFileBytes: 25 * MIB, maxTotalBytes: 40 * MIB, maxPages: 500, maxOutputBytes: 60 * MIB, taskTimeoutMs: 45_000 });
  const ERROR_CODES = new Set(['NO_FILES', 'NEED_MULTIPLE_FILES', 'FILE_COUNT_LIMIT', 'FILE_SIZE_LIMIT', 'TOTAL_SIZE_LIMIT', 'FILE_EMPTY', 'INVALID_PDF', 'PASSWORD_PROTECTED', 'PAGE_LIMIT', 'OUTPUT_SIZE_LIMIT', 'PROCESSING_FAILED']);

  function pdfError(code) {
    const error = new Error('PDF files could not be merged.');
    error.name = 'PdfMergeError';
    error.code = ERROR_CODES.has(code) ? code : 'PROCESSING_FAILED';
    return error;
  }

  function validatePdfFileList(files) {
    if (!Array.isArray(files) || files.length === 0) throw pdfError('NO_FILES');
    if (files.length > PDF_LIMITS.maxFiles) throw pdfError('FILE_COUNT_LIMIT');
    let totalBytes = 0;
    for (const file of files) {
      const size = Number(file?.size);
      if (!Number.isSafeInteger(size) || size <= 0) throw pdfError('FILE_EMPTY');
      if (size > PDF_LIMITS.maxFileBytes) throw pdfError('FILE_SIZE_LIMIT');
      totalBytes += size;
      if (totalBytes > PDF_LIMITS.maxTotalBytes) throw pdfError('TOTAL_SIZE_LIMIT');
    }
    return { fileCount: files.length, totalBytes };
  }

  function bytesOf(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return null;
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

  function assertOutputSize(value, limit = PDF_LIMITS.maxOutputBytes) {
    const bytes = bytesOf(value);
    const ceiling = Number(limit);
    if (!bytes || !Number.isSafeInteger(ceiling) || ceiling < 0 || ceiling > PDF_LIMITS.maxOutputBytes) throw pdfError('PROCESSING_FAILED');
    if (bytes.byteLength > ceiling) throw pdfError('OUTPUT_SIZE_LIMIT');
    return bytes;
  }

  function classifyPdfError(error) {
    if (ERROR_CODES.has(error?.code)) return error.code;
    if (/encrypted|password/i.test(String(error?.name || ''))) return 'PASSWORD_PROTECTED';
    return 'INVALID_PDF';
  }

  async function mergePdfBuffers(values, pdfLib, onProgress) {
    if (!Array.isArray(values) || values.length === 0) throw pdfError('NO_FILES');
    if (values.length < 2) throw pdfError('NEED_MULTIPLE_FILES');
    if (values.length > PDF_LIMITS.maxFiles) throw pdfError('FILE_COUNT_LIMIT');
    const inputs = values.map(bytesOf);
    if (inputs.some(bytes => !bytes || bytes.byteLength === 0)) throw pdfError('FILE_EMPTY');
    validatePdfFileList(inputs.map(bytes => ({ size: bytes.byteLength })));
    if (inputs.some(bytes => !hasPdfHeader(bytes))) throw pdfError('INVALID_PDF');
    if (!pdfLib?.PDFDocument || typeof pdfLib.PDFDocument.create !== 'function') throw pdfError('PROCESSING_FAILED');

    let merged;
    try { merged = await pdfLib.PDFDocument.create(); }
    catch { throw pdfError('PROCESSING_FAILED'); }

    let pageCount = 0;
    for (let fileIndex = 0; fileIndex < inputs.length; fileIndex += 1) {
      let source;
      try {
        source = await pdfLib.PDFDocument.load(inputs[fileIndex], { updateMetadata: false, throwOnInvalidObject: true });
      } catch (error) { throw pdfError(classifyPdfError(error)); }
      let pageIndices;
      try { pageIndices = source.getPageIndices(); }
      catch { throw pdfError('INVALID_PDF'); }
      if (!Array.isArray(pageIndices) || pageIndices.length === 0) throw pdfError('INVALID_PDF');
      if (pageCount + pageIndices.length > PDF_LIMITS.maxPages) throw pdfError('PAGE_LIMIT');
      let copiedPages;
      try { copiedPages = await merged.copyPages(source, pageIndices); }
      catch { throw pdfError('PROCESSING_FAILED'); }
      for (const page of copiedPages) merged.addPage(page);
      pageCount += copiedPages.length;
      if (typeof onProgress === 'function') {
        try { onProgress({ completedFiles: fileIndex + 1, fileCount: inputs.length, pageCount }); }
        catch { /* Progress reporting must not affect the merge. */ }
      }
    }

    let output;
    try { output = await merged.save(); }
    catch { throw pdfError('PROCESSING_FAILED'); }
    const bytes = assertOutputSize(output);
    if (!hasPdfHeader(bytes)) throw pdfError('PROCESSING_FAILED');
    return { bytes, fileCount: inputs.length, pageCount };
  }

  return Object.freeze({ PDF_LIMITS, validatePdfFileList, hasPdfHeader, assertOutputSize, classifyPdfError, mergePdfBuffers });
});
