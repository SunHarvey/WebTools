'use strict';

importScripts('/pdf/vendor/pdf-lib.min.js', '/image-to-pdf/image-pdf-engine.js');

self.onmessage = async event => {
  const buffers = event.data?.buffers;
  if (!Array.isArray(buffers)) {
    self.postMessage({ type: 'error', code: 'PROCESSING_FAILED' });
    return;
  }
  try {
    const result = await ImagePdfEngine.createPdfFromImages(
      buffers,
      self.PDFLib,
      progress => self.postMessage({ type: 'progress', ...progress }),
    );
    const buffer = result.bytes.buffer.slice(result.bytes.byteOffset, result.bytes.byteOffset + result.bytes.byteLength);
    self.postMessage({ type: 'success', buffer, pageCount: result.pageCount }, [buffer]);
  } catch (error) {
    self.postMessage({ type: 'error', code: ImagePdfEngine.classifyImagePdfError(error) });
  }
};
