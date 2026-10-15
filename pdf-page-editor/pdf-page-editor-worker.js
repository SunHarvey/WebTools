'use strict';

importScripts('/pdf/vendor/pdf-lib.min.js', '/pdf/pdf-page-editor-engine.js');

self.onmessage = async event => {
  const buffer = event.data?.buffer;
  const selection = event.data?.selection;
  const action = event.data?.action;
  if (!(buffer instanceof ArrayBuffer) || typeof selection !== 'string' || typeof action !== 'string') {
    self.postMessage({ type: 'error', code: 'PROCESSING_FAILED' });
    return;
  }
  try {
    const result = await PDFPageEditorEngine.processPdfBuffer(
      buffer,
      selection,
      action,
      self.PDFLib,
      progress => self.postMessage({ type: 'progress', ...progress }),
    );
    const outputBuffer = result.bytes.buffer.slice(result.bytes.byteOffset, result.bytes.byteOffset + result.bytes.byteLength);
    self.postMessage({
      type: 'success',
      buffer: outputBuffer,
      action: result.action,
      sourcePageCount: result.sourcePageCount,
      pageCount: result.pageCount,
      changedPageCount: result.changedPageCount,
    }, [outputBuffer]);
  } catch (error) {
    self.postMessage({ type: 'error', code: PDFPageEditorEngine.classifyPdfPageEditorError(error) });
  }
};
