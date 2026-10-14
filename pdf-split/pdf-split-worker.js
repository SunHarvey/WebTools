'use strict';

importScripts('/pdf/vendor/pdf-lib.min.js', '/pdf/pdf-split-engine.js');

self.onmessage = async event => {
  const buffer = event.data?.buffer;
  const ranges = event.data?.ranges;
  if (!(buffer instanceof ArrayBuffer) || typeof ranges !== 'string') {
    self.postMessage({ type: 'error', code: 'PROCESSING_FAILED' });
    return;
  }
  try {
    const result = await PDFSplitEngine.splitPdfBuffer(
      buffer,
      ranges,
      self.PDFLib,
      progress => self.postMessage({ type: 'progress', ...progress }),
    );
    const files = result.files.map(file => {
      const outputBuffer = file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength);
      return { name: file.name, buffer: outputBuffer, pageCount: file.pageCount };
    });
    self.postMessage({
      type: 'success',
      files,
      rangeCount: result.rangeCount,
      pageCount: result.pageCount,
      totalOutputBytes: result.totalOutputBytes,
    }, files.map(file => file.buffer));
  } catch (error) {
    self.postMessage({ type: 'error', code: PDFSplitEngine.classifyPdfSplitError(error) });
  }
};
