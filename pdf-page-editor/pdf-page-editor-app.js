(function startPdfPageEditor(root) {
  'use strict';
  const start = () => root.PDFPageEditorTool?.attachPdfPageEditor();
  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})(globalThis);
