'use strict';

importScripts('/pdf/vendor/pdf-lib.min.js', '/pdf/pdf-engine.js');

self.onmessage = async event => {
  const buffers = event.data?.buffers;
  if (!Array.isArray(buffers)) {
    self.postMessage({ type: 'error', code: 'PROCESSING_FAILED' });
    return;
  }
  try {
    const result = await PDFMergeEngine.mergePdfBuffers(
      buffers,
      self.PDFLib,
      progress => self.postMessage({ type: 'progress', ...progress }),
    );
    const buffer = result.bytes.buffer.slice(result.bytes.byteOffset, result.bytes.byteOffset + result.bytes.byteLength);
    self.postMessage({ type: 'success', buffer, fileCount: result.fileCount, pageCount: result.pageCount }, [buffer]);
  } catch (error) {
    self.postMessage({ type: 'error', code: PDFMergeEngine.classifyPdfError(error) });
  }
};
