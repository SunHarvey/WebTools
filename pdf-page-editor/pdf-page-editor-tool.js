(function exposePdfPageEditorTool(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PDFPageEditorTool = api;
})(typeof globalThis === 'object' ? globalThis : self, function createPdfPageEditorTool(root) {
  'use strict';

  const TEXT = {
    en: {
      ready: 'Choose one PDF, select pages, and choose a local edit.',
      selected: size => `PDF selected (${size}).`,
      reading: 'Reading the PDF locally…', editing: 'Applying the page edit locally…',
      successRotate: count => `Rotated ${count} ${count === 1 ? 'page' : 'pages'}. The edited PDF is ready.`,
      successDelete: (count, remaining) => `Deleted ${count} ${count === 1 ? 'page' : 'pages'}; ${remaining} ${remaining === 1 ? 'page' : 'pages'} remain.`,
      invalidPdf: 'This file is not a readable PDF. Check the file and try again.',
      protected: 'Password-protected PDFs are not supported.',
      fileEmpty: 'The selected file is empty or unavailable.',
      fileSizeLimit: 'The selected PDF must be 25 MiB or smaller.',
      pageLimit: 'The PDF must contain no more than 500 pages.',
      invalidRanges: 'Enter “all” or page numbers/ranges such as 1-3, 5.',
      rangeLimit: 'Use no more than 20 comma-separated page ranges.',
      outOfBounds: 'One or more selected pages are outside this PDF.',
      overlaps: 'A page appears more than once. Remove overlapping page ranges.',
      invalidAction: 'Choose a supported page edit.',
      deleteAll: 'At least one page must remain in the edited PDF.',
      outputLimit: 'The edited PDF exceeds the 60 MiB output limit.',
      timeout: 'PDF processing stopped after 45 seconds to protect this tab. Try fewer pages.',
      failed: 'The PDF pages could not be edited. Check the file and try again.',
    },
    zh: {
      ready: '选择一个 PDF、指定页面，并选择要在本地执行的操作。',
      selected: size => `已选择 PDF（${size}）。`,
      reading: '正在本地读取 PDF…', editing: '正在本地应用页面操作…',
      successRotate: count => `已旋转 ${count} 页。修改后的 PDF 已就绪。`,
      successDelete: (count, remaining) => `已删除 ${count} 页；修改后的 PDF 还剩 ${remaining} 页。`,
      invalidPdf: '所选文件不是可读取的 PDF。请检查文件后重试。',
      protected: '暂不支持受密码保护的 PDF。',
      fileEmpty: '所选文件为空或无法读取。',
      fileSizeLimit: '所选 PDF 文件不能超过 25 MiB。',
      pageLimit: 'PDF 页数不能超过 500 页。',
      invalidRanges: '请输入“all”或页码范围，例如 1-3, 5。',
      rangeLimit: '逗号分隔的页码范围不能超过 20 组。',
      outOfBounds: '一个或多个页码超出此 PDF 的页数范围。',
      overlaps: '页码重复，请移除重叠的范围。',
      invalidAction: '请选择受支持的页面操作。',
      deleteAll: '修改后的 PDF 至少要保留一页。',
      outputLimit: '修改后的 PDF 超过 60 MiB 输出上限。',
      timeout: '为保护当前标签页，PDF 处理已在 45 秒后停止。请减少所选页面。',
      failed: '无法修改 PDF 页面。请检查文件后重试。',
    },
  };
  const ERROR_MESSAGES = Object.freeze({
    FILE_EMPTY: 'fileEmpty', FILE_SIZE_LIMIT: 'fileSizeLimit', INVALID_PDF: 'invalidPdf',
    PASSWORD_PROTECTED: 'protected', PAGE_LIMIT: 'pageLimit', INVALID_RANGES: 'invalidRanges',
    RANGE_LIMIT: 'rangeLimit', PAGE_RANGE_OUT_OF_BOUNDS: 'outOfBounds', OVERLAPPING_PAGES: 'overlaps',
    INVALID_ACTION: 'invalidAction', DELETE_ALL_PAGES: 'deleteAll', OUTPUT_SIZE_LIMIT: 'outputLimit',
    WORKER_TIMEOUT: 'timeout', PROCESSING_FAILED: 'failed',
  });

  function localeFor(language) {
    return String(language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }

  function formatPdfPageEditorSize(bytes) {
    const size = Number(bytes);
    if (!Number.isFinite(size) || size <= 0) return '0 B';
    if (size < 1024) return `${Math.floor(size)} B`;
    const units = ['KiB', 'MiB', 'GiB'];
    let value = size / 1024;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
    return `${value.toFixed(value >= 10 || Number.isInteger(value) ? 0 : 1).replace(/\.0$/, '')} ${units[index]}`;
  }

  function pdfPageEditorMessage(keyOrCode, language = 'en', details = {}) {
    const locale = localeFor(language);
    const key = ERROR_MESSAGES[keyOrCode] || keyOrCode;
    const message = TEXT[locale][key] || TEXT[locale].failed;
    if (key === 'selected') return message(formatPdfPageEditorSize(details.size));
    if (key === 'success') {
      if (details.action === 'delete') return TEXT[locale].successDelete(Number(details.changedPageCount) || 0, Number(details.pageCount) || 0);
      return TEXT[locale].successRotate(Number(details.changedPageCount) || 0);
    }
    return message;
  }

  function attachPdfPageEditor(options = {}) {
    const doc = options.document || root.document;
    const win = options.window || root;
    const engine = options.engine || root.PDFPageEditorEngine;
    const WorkerConstructor = options.Worker || root.Worker;
    const BlobConstructor = options.Blob || root.Blob;
    const URLApi = options.URL || root.URL;
    if (!doc || !engine || !WorkerConstructor || !BlobConstructor || !URLApi) return false;

    const fileInput = doc.querySelector('#pdfPageFile');
    const selectionInput = doc.querySelector('#pdfPageSelection');
    const actionInput = doc.querySelector('#pdfPageAction');
    const editButton = doc.querySelector('#editPdfPages');
    const clearButton = doc.querySelector('#clearPdfPageEdit');
    const downloadLink = doc.querySelector('#downloadEditedPdf');
    const status = doc.querySelector('#pdfPageStatus');
    const summary = doc.querySelector('#pdfPageSummary');
    if (!fileInput || !selectionInput || !actionInput || !editButton || !clearButton || !downloadLink || !status || !summary) return false;

    const language = localeFor(doc.documentElement.lang);
    let selectedFile = null;
    let activeWorker = null;
    let timeoutHandle = null;
    let outputUrl = '';
    let operationId = 0;
    let operationDeadline = 0;
    let busy = false;
    const pendingReaders = new Set();

    function setStatus(state, message) {
      status.dataset.state = state;
      status.textContent = message;
    }

    function clearOutput() {
      if (outputUrl) URLApi.revokeObjectURL(outputUrl);
      outputUrl = '';
      downloadLink.hidden = true;
      downloadLink.removeAttribute('href');
      downloadLink.removeAttribute('data-page-count');
      downloadLink.removeAttribute('data-action');
    }

    function cancelReads() {
      const readers = Array.from(pendingReaders);
      pendingReaders.clear();
      for (const reader of readers) if (reader.readyState === win.FileReader.LOADING) reader.abort();
    }

    function readFileBuffer(file) {
      return new Promise((resolve, reject) => {
        let reader = null;
        const cleanup = () => {
          if (!reader) return;
          pendingReaders.delete(reader);
          reader.onload = null;
          reader.onerror = null;
          reader.onabort = null;
        };
        try {
          reader = new win.FileReader();
          pendingReaders.add(reader);
          reader.onload = () => { const result = reader.result; cleanup(); resolve(result); };
          reader.onerror = () => { cleanup(); reject(new Error('FILE_READ_FAILED')); };
          reader.onabort = () => { cleanup(); reject(new Error('FILE_READ_ABORTED')); };
          reader.readAsArrayBuffer(file);
        } catch { cleanup(); reject(new Error('FILE_READ_FAILED')); }
      });
    }

    function stopWorker() {
      if (timeoutHandle !== null) win.clearTimeout(timeoutHandle);
      timeoutHandle = null;
      cancelReads();
      if (activeWorker) activeWorker.terminate();
      activeWorker = null;
    }

    function updateControls() {
      fileInput.disabled = busy;
      selectionInput.disabled = busy;
      actionInput.disabled = busy;
      editButton.disabled = busy || !selectedFile || !selectionInput.value.trim() || !engine.PDF_PAGE_EDITOR_ACTIONS.includes(actionInput.value);
      summary.textContent = selectedFile
        ? pdfPageEditorMessage('selected', language, { size: selectedFile.size })
        : pdfPageEditorMessage('ready', language);
    }

    function invalidate() {
      operationId += 1;
      stopWorker();
      busy = false;
      clearOutput();
      updateControls();
      return operationId;
    }

    function finishError(token, code) {
      if (token !== operationId) return;
      operationId += 1;
      stopWorker();
      busy = false;
      clearOutput();
      updateControls();
      setStatus('error', pdfPageEditorMessage(code, language));
    }

    function expired(token) {
      if (token !== operationId) return true;
      if (win.performance.now() < operationDeadline) return false;
      finishError(token, 'WORKER_TIMEOUT');
      return true;
    }

    function addDownload(data) {
      if (!(data.buffer instanceof ArrayBuffer)) throw new Error('Invalid PDF output.');
      const bytes = engine.assertOutputSize(new Uint8Array(data.buffer));
      if (!engine.hasPdfHeader(bytes)) throw new Error('Invalid PDF output.');
      outputUrl = URLApi.createObjectURL(new BlobConstructor([data.buffer], { type: 'application/pdf' }));
      downloadLink.href = outputUrl;
      downloadLink.download = 'edited.pdf';
      downloadLink.dataset.pageCount = String(data.pageCount);
      downloadLink.dataset.action = data.action;
      downloadLink.hidden = false;
    }

    function handleWorkerMessage(worker, token, event) {
      if (activeWorker !== worker || token !== operationId || expired(token)) return;
      const data = event.data || {};
      if (data.type === 'progress') {
        setStatus('working', pdfPageEditorMessage('editing', language));
        return;
      }
      if (data.type === 'error') {
        finishError(token, data.code);
        return;
      }
      const isRotation = actionInput.value !== 'delete';
      const validCounts = Number.isSafeInteger(data.sourcePageCount) && data.sourcePageCount > 0 && data.sourcePageCount <= engine.PDF_PAGE_EDITOR_LIMITS.maxPages
        && Number.isSafeInteger(data.changedPageCount) && data.changedPageCount > 0 && data.changedPageCount <= data.sourcePageCount
        && Number.isSafeInteger(data.pageCount) && data.pageCount > 0 && data.pageCount <= engine.PDF_PAGE_EDITOR_LIMITS.maxPages
        && (isRotation ? data.pageCount === data.sourcePageCount : data.pageCount === data.sourcePageCount - data.changedPageCount && data.pageCount > 0);
      if (data.type !== 'success' || data.action !== actionInput.value || !validCounts) {
        finishError(token, 'PROCESSING_FAILED');
        return;
      }
      try {
        addDownload(data);
        if (expired(token)) return;
        busy = false;
        updateControls();
        setStatus('success', pdfPageEditorMessage('success', language, data));
        if (expired(token)) return;
        stopWorker();
      } catch { finishError(token, 'PROCESSING_FAILED'); }
    }

    async function applyEdit() {
      if (busy || !selectedFile) return;
      const selection = selectionInput.value;
      const action = actionInput.value;
      try {
        engine.validatePdfPageEditorFile(selectedFile);
        if (!engine.PDF_PAGE_EDITOR_ACTIONS.includes(action)) throw engine.pdfPageEditorError('INVALID_ACTION');
        engine.parsePageSelection(selection, engine.PDF_PAGE_EDITOR_LIMITS.maxPages);
      } catch (error) {
        clearOutput();
        setStatus('error', pdfPageEditorMessage(error.code, language));
        return;
      }

      const token = invalidate();
      const file = selectedFile;
      busy = true;
      updateControls();
      setStatus('working', pdfPageEditorMessage('reading', language));
      operationDeadline = win.performance.now() + engine.PDF_PAGE_EDITOR_LIMITS.taskTimeoutMs;
      timeoutHandle = win.setTimeout(() => finishError(token, 'WORKER_TIMEOUT'), engine.PDF_PAGE_EDITOR_LIMITS.taskTimeoutMs);
      try {
        const buffer = await readFileBuffer(file);
        if (expired(token)) return;
        if (!engine.hasPdfHeader(buffer)) { finishError(token, 'INVALID_PDF'); return; }
        if (expired(token)) return;
        const worker = new WorkerConstructor('/pdf-page-editor/pdf-page-editor-worker.js');
        activeWorker = worker;
        if (expired(token)) return;
        worker.onmessage = message => handleWorkerMessage(worker, token, message);
        worker.onerror = () => finishError(token, 'PROCESSING_FAILED');
        setStatus('working', pdfPageEditorMessage('editing', language));
        if (expired(token)) return;
        worker.postMessage({ buffer, selection, action }, [buffer]);
      } catch { if (token === operationId) finishError(token, 'PROCESSING_FAILED'); }
    }

    function clearAll() {
      operationId += 1;
      stopWorker();
      busy = false;
      selectedFile = null;
      fileInput.value = '';
      selectionInput.value = '';
      actionInput.value = 'rotate-right';
      clearOutput();
      updateControls();
      setStatus('ready', pdfPageEditorMessage('ready', language));
    }

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0] || null;
      fileInput.value = '';
      if (!file) return;
      invalidate();
      selectedFile = null;
      try {
        engine.validatePdfPageEditorFile(file);
        selectedFile = file;
        updateControls();
        setStatus('ready', pdfPageEditorMessage('selected', language, { size: file.size }));
      } catch (error) {
        updateControls();
        setStatus('error', pdfPageEditorMessage(error.code, language));
      }
    });
    selectionInput.addEventListener('input', () => {
      if (busy) return;
      clearOutput();
      updateControls();
      if (selectedFile) setStatus('ready', pdfPageEditorMessage('selected', language, { size: selectedFile.size }));
    });
    actionInput.addEventListener('change', () => {
      if (busy) return;
      clearOutput();
      updateControls();
      if (selectedFile) setStatus('ready', pdfPageEditorMessage('selected', language, { size: selectedFile.size }));
    });
    editButton.addEventListener('click', applyEdit);
    clearButton.addEventListener('click', clearAll);
    win.addEventListener('pagehide', clearAll);
    win.addEventListener('pageshow', event => { if (event.persisted) clearAll(); });
    clearAll();
    return Object.freeze({ clear: clearAll });
  }

  return Object.freeze({ formatPdfPageEditorSize, pdfPageEditorMessage, attachPdfPageEditor });
});
