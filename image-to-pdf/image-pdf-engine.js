(function exposeImagePdfEngine(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ImagePdfEngine = api;
})(typeof globalThis === 'object' ? globalThis : self, function createImagePdfEngine() {
  'use strict';
  const MIB = 1024 * 1024;
  const IMAGE_PDF_LIMITS = Object.freeze({ maxFiles: 20, maxFileBytes: 16 * MIB, maxTotalBytes: 40 * MIB, maxPixelsPerImage: 12_000_000, maxTotalPixels: 40_000_000, maxOutputBytes: 60 * MIB, taskTimeoutMs: 45_000, marginPoints: 36, pageWidthPoints: 595.28, pageHeightPoints: 841.89 });
  const ERROR_CODES = new Set(['NO_FILES','FILE_COUNT_LIMIT','FILE_SIZE_LIMIT','TOTAL_SIZE_LIMIT','FILE_EMPTY','INVALID_IMAGE','PIXEL_LIMIT','TOTAL_PIXEL_LIMIT','OUTPUT_SIZE_LIMIT','PROCESSING_FAILED']);
  function imagePdfError(code) { const error = new Error('Images could not be converted to PDF.'); error.name = 'ImagePdfError'; error.code = ERROR_CODES.has(code) ? code : 'PROCESSING_FAILED'; return error; }
  function bytesOf(value) { if (value instanceof Uint8Array) return value; if (value instanceof ArrayBuffer) return new Uint8Array(value); if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength); return null; }
  const PNG_CRC_TABLE = new Uint32Array(256);
  for (let index = 0; index < PNG_CRC_TABLE.length; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    PNG_CRC_TABLE[index] = crc >>> 0;
  }
  function pngCrc32(bytes, start, length) {
    let crc = 0xffffffff;
    for (let index = start; index < start + length; index += 1) crc = PNG_CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function inspectPng(bytes) {
    let offset = 8; let width = 0; let height = 0; let colorType = -1;
    let seenHeader = false; let seenPalette = false; let seenData = false; let dataEnded = false; let seenEnd = false;
    while (offset + 12 <= bytes.length) {
      const length = bytes[offset] * 0x1000000 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
      if (length > bytes.length - offset - 12) throw imagePdfError('INVALID_IMAGE');
      const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      if (!/^[A-Za-z]{4}$/.test(type)) throw imagePdfError('INVALID_IMAGE');
      const chunkEnd = offset + 12 + length;
      const expectedCrc = bytes[offset + 8 + length] * 0x1000000 + bytes[offset + 9 + length] * 0x10000 + bytes[offset + 10 + length] * 0x100 + bytes[offset + 11 + length];
      if (pngCrc32(bytes, offset + 4, length + 4) !== expectedCrc) throw imagePdfError('INVALID_IMAGE');
      if (!seenHeader) {
        if (type !== 'IHDR' || length !== 13) throw imagePdfError('INVALID_IMAGE');
        seenHeader = true;
        width = bytes[offset + 8] * 0x1000000 + (bytes[offset + 9] << 16) + (bytes[offset + 10] << 8) + bytes[offset + 11];
        height = bytes[offset + 12] * 0x1000000 + (bytes[offset + 13] << 16) + (bytes[offset + 14] << 8) + bytes[offset + 15];
        const depth = bytes[offset + 16]; colorType = bytes[offset + 17];
        const legalDepth = colorType === 0 ? [1,2,4,8,16].includes(depth) : colorType === 2 ? [8,16].includes(depth) : colorType === 3 ? [1,2,4,8].includes(depth) : colorType === 4 || colorType === 6 ? [8,16].includes(depth) : false;
        if (!width || !height || !legalDepth || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || bytes[offset + 20] > 1) throw imagePdfError('INVALID_IMAGE');
      } else if (type === 'IHDR') throw imagePdfError('INVALID_IMAGE');
      if (type === 'PLTE') {
        if (seenPalette || seenData || length === 0 || length > 768 || length % 3 !== 0 || colorType === 0 || colorType === 4) throw imagePdfError('INVALID_IMAGE');
        seenPalette = true;
      }
      if (type === 'IDAT') {
        if (dataEnded || (colorType === 3 && !seenPalette)) throw imagePdfError('INVALID_IMAGE');
        seenData = true;
      } else if (seenData && type !== 'IEND') dataEnded = true;
      if (type === 'IEND') {
        if (!seenData || length !== 0) throw imagePdfError('INVALID_IMAGE');
        seenEnd = true; offset = chunkEnd; break;
      }
      if (type !== 'IHDR' && type !== 'PLTE' && type !== 'IDAT' && type !== 'IEND' && (bytes[offset + 4] & 0x20) === 0) throw imagePdfError('INVALID_IMAGE');
      offset = chunkEnd;
    }
    if (!seenHeader || !seenData || !seenEnd || offset !== bytes.length) throw imagePdfError('INVALID_IMAGE');
    return { type: 'png', width, height };
  }
  function inspectImage(value) {
    const bytes = bytesOf(value);
    if (!bytes || bytes.length < 4) throw imagePdfError('INVALID_IMAGE');
    let type; let width; let height;
    const isPng = bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
    if (isPng) {
      ({ type, width, height } = inspectPng(bytes));
    } else {
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw imagePdfError('INVALID_IMAGE');
      let offset = 2;
      while (offset + 3 < bytes.length) {
        if (bytes[offset] !== 0xff) throw imagePdfError('INVALID_IMAGE');
        while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
        if (offset >= bytes.length) break;
        const marker = bytes[offset++];
        if (marker === 0xd9 || marker === 0xda) break;
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        if (offset + 1 >= bytes.length) break;
        const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
        if (segmentLength < 2 || offset + segmentLength > bytes.length) throw imagePdfError('INVALID_IMAGE');
        if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
          if (segmentLength < 7) throw imagePdfError('INVALID_IMAGE');
          type = 'jpeg'; height = (bytes[offset + 3] << 8) | bytes[offset + 4]; width = (bytes[offset + 5] << 8) | bytes[offset + 6]; break;
        }
        offset += segmentLength;
      }
    }
    if (!type || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw imagePdfError('INVALID_IMAGE');
    const pixels = width * height;
    if (!Number.isSafeInteger(pixels) || pixels > IMAGE_PDF_LIMITS.maxPixelsPerImage) throw imagePdfError('PIXEL_LIMIT');
    return { type, width, height, pixels };
  }
  function validateImageFileList(files) {
    if (!Array.isArray(files) || files.length === 0) throw imagePdfError('NO_FILES');
    if (files.length > IMAGE_PDF_LIMITS.maxFiles) throw imagePdfError('FILE_COUNT_LIMIT');
    let totalBytes = 0; let totalPixels = 0;
    for (const file of files) {
      const size = Number(file?.size);
      if (!Number.isSafeInteger(size) || size <= 0) throw imagePdfError('FILE_EMPTY');
      if (size > IMAGE_PDF_LIMITS.maxFileBytes) throw imagePdfError('FILE_SIZE_LIMIT');
      totalBytes += size;
      if (totalBytes > IMAGE_PDF_LIMITS.maxTotalBytes) throw imagePdfError('TOTAL_SIZE_LIMIT');
      const pixels = Number(file?.pixels);
      if (!Number.isSafeInteger(pixels) || pixels <= 0) throw imagePdfError('INVALID_IMAGE');
      if (pixels > IMAGE_PDF_LIMITS.maxPixelsPerImage) throw imagePdfError('PIXEL_LIMIT');
      totalPixels += pixels;
      if (totalPixels > IMAGE_PDF_LIMITS.maxTotalPixels) throw imagePdfError('TOTAL_PIXEL_LIMIT');
    }
    return { fileCount: files.length, totalBytes, totalPixels };
  }
  function hasPdfHeader(value) { const bytes = bytesOf(value); return !!bytes && bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d; }
  function assertOutputSize(value, limit = IMAGE_PDF_LIMITS.maxOutputBytes) {
    const bytes = bytesOf(value);
    const ceiling = Number(limit);
    if (!bytes || !Number.isSafeInteger(ceiling) || ceiling < 0 || ceiling > IMAGE_PDF_LIMITS.maxOutputBytes) throw imagePdfError('PROCESSING_FAILED');
    if (bytes.byteLength > ceiling) throw imagePdfError('OUTPUT_SIZE_LIMIT');
    return bytes;
  }
  function classifyImagePdfError(error) { return ERROR_CODES.has(error?.code) ? error.code : 'PROCESSING_FAILED'; }
  async function createPdfFromImages(values, pdfLib, onProgress) {
    if (!Array.isArray(values) || values.length === 0) throw imagePdfError('NO_FILES');
    if (values.length > IMAGE_PDF_LIMITS.maxFiles) throw imagePdfError('FILE_COUNT_LIMIT');
    const inputs = values.map(bytesOf);
    let totalInputBytes=0;
    for(const bytes of inputs){
      if(!bytes||bytes.byteLength===0)throw imagePdfError('FILE_EMPTY');
      if(bytes.byteLength>IMAGE_PDF_LIMITS.maxFileBytes)throw imagePdfError('FILE_SIZE_LIMIT');
      totalInputBytes+=bytes.byteLength;
      if(totalInputBytes>IMAGE_PDF_LIMITS.maxTotalBytes)throw imagePdfError('TOTAL_SIZE_LIMIT');
    }
    const images = inputs.map(inspectImage);
    const stats = validateImageFileList(inputs.map((bytes, index) => ({ size: bytes.byteLength, pixels: images[index].pixels })));
    if (!pdfLib?.PDFDocument || typeof pdfLib.PDFDocument.create !== 'function') throw imagePdfError('PROCESSING_FAILED');
    let document;
    try { document = await pdfLib.PDFDocument.create(); } catch { throw imagePdfError('PROCESSING_FAILED'); }
    for (let index = 0; index < inputs.length; index += 1) {
      let embedded;
      try { embedded = images[index].type === 'jpeg' ? await document.embedJpg(inputs[index]) : await document.embedPng(inputs[index]); }
      catch { throw imagePdfError('INVALID_IMAGE'); }
      const landscape = images[index].width > images[index].height;
      const pageWidth = landscape ? IMAGE_PDF_LIMITS.pageHeightPoints : IMAGE_PDF_LIMITS.pageWidthPoints;
      const pageHeight = landscape ? IMAGE_PDF_LIMITS.pageWidthPoints : IMAGE_PDF_LIMITS.pageHeightPoints;
      const maxWidth = pageWidth - 2 * IMAGE_PDF_LIMITS.marginPoints;
      const maxHeight = pageHeight - 2 * IMAGE_PDF_LIMITS.marginPoints;
      const scale = Math.min(maxWidth / embedded.width, maxHeight / embedded.height);
      const width = embedded.width * scale; const height = embedded.height * scale;
      const page = document.addPage([pageWidth, pageHeight]);
      page.drawImage(embedded, { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height });
      if (typeof onProgress === 'function') { try { onProgress({ completedFiles: index + 1, fileCount: inputs.length, pageCount: index + 1 }); } catch { /* no-op */ } }
    }
    let output;
    try { output = await document.save(); } catch { throw imagePdfError('PROCESSING_FAILED'); }
    const bytes = assertOutputSize(output);
    if (!hasPdfHeader(bytes)) throw imagePdfError('PROCESSING_FAILED');
    return { bytes, fileCount: stats.fileCount, pageCount: stats.fileCount };
  }
  return Object.freeze({ IMAGE_PDF_LIMITS, imagePdfError, inspectImage, validateImageFileList, hasPdfHeader, assertOutputSize, classifyImagePdfError, createPdfFromImages });
});
