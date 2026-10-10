(function exposePdfMergeTool(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PDFMergeTool = api;
})(typeof globalThis === 'object' ? globalThis : self, function createPdfMergeTool(root) {
  'use strict';
  const TEXT = {
    en: {
      ready: 'Select two or more PDF files to merge locally.', needMore: 'One PDF selected. Add at least one more to merge.',
      selected: count => `${count} PDF files selected. Reorder them before merging if needed.`,
      reading: 'Reading selected files locally…', merging: 'Merging PDF pages locally…',
      progress: (completed, total, pages) => `Merged ${completed} of ${total} files so far (${pages} pages).`,
      merged: (pages, files) => `Merged ${pages} pages from ${files} files. Download is ready.`,
      invalidPdf: 'One or more files are not readable PDFs. Check the files and try again.',
      protected: 'Password-protected PDFs are not supported.', fileLimit: 'Choose no more than 20 PDF files.',
      fileSizeLimit: 'Each PDF must be 25 MiB or smaller.', totalSizeLimit: 'Selected PDFs must total 40 MiB or less.',
      fileEmpty: 'A selected file is empty or unavailable.', pageLimit: 'The combined document exceeds the 500-page limit.',
      outputLimit: 'The merged PDF exceeds the 60 MiB output limit.',
      timeout: 'PDF processing stopped after 45 seconds to protect this tab. Try fewer or smaller PDFs.',
      failed: 'The PDFs could not be merged. Check the files and try again.', up: 'Move up', down: 'Move down', remove: 'Remove',
    },
    zh: {
      ready: '选择至少两个 PDF 文件，即可在本地合并。', needMore: '已选择 1 个 PDF；请至少再添加 1 个文件。',
      selected: count => `已选择 ${count} 个 PDF 文件；合并前可调整顺序。`,
      reading: '正在本地读取所选文件…', merging: '正在本地合并 PDF 页面…',
      progress: (completed, total, pages) => `已处理 ${completed}/${total} 个文件，目前共 ${pages} 页。`,
      merged: (pages, files) => `已合并 ${files} 个文件，共 ${pages} 页。可以下载。`,
      invalidPdf: '一个或多个文件不是可读取的 PDF。请检查文件后重试。',
      protected: '暂不支持受密码保护的 PDF。', fileLimit: '每次最多选择 20 个 PDF 文件。',
      fileSizeLimit: '每个 PDF 文件不能超过 25 MiB。', totalSizeLimit: '所选 PDF 文件总大小不能超过 40 MiB。',
      fileEmpty: '所选文件为空或无法读取。', pageLimit: '合并后的文档超过 500 页上限。',
      outputLimit: '合并后的 PDF 超过 60 MiB 输出上限。',
      timeout: '为保护当前标签页，PDF 处理已在 45 秒后停止。请减少文件或选择较小的 PDF。',
      failed: '无法合并这些 PDF。请检查文件后重试。', up: '上移', down: '下移', remove: '移除',
    },
  };
  const ERROR_MESSAGES = Object.freeze({
    NO_FILES: 'ready', NEED_MULTIPLE_FILES: 'needMore', FILE_COUNT_LIMIT: 'fileLimit', FILE_SIZE_LIMIT: 'fileSizeLimit',
    TOTAL_SIZE_LIMIT: 'totalSizeLimit', FILE_EMPTY: 'fileEmpty', INVALID_PDF: 'invalidPdf',
    PASSWORD_PROTECTED: 'protected', PAGE_LIMIT: 'pageLimit', OUTPUT_SIZE_LIMIT: 'outputLimit', WORKER_TIMEOUT: 'timeout', PROCESSING_FAILED: 'failed',
  });

  function localeFor(language) { return String(language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'; }
  function pdfMessage(keyOrCode, language = 'en', details = {}) {
    const locale = localeFor(language);
    const key = ERROR_MESSAGES[keyOrCode] || keyOrCode;
    const message = TEXT[locale][key] || TEXT[locale].failed;
    if (key === 'selected') return message(Number(details.count) || 0);
    if (key === 'progress') return message(Number(details.completedFiles) || 0, Number(details.fileCount) || 0, Number(details.pageCount) || 0);
    if (key === 'merged') return message(Number(details.pageCount) || 0, Number(details.fileCount) || 0);
    return message;
  }
  function formatPdfSize(bytes) {
    const size = Number(bytes);
    if (!Number.isFinite(size) || size <= 0) return '0 B';
    if (size < 1024) return `${Math.floor(size)} B`;
    const units = ['KiB', 'MiB', 'GiB'];
    let value = size / 1024;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
    const digits = value >= 10 || Number.isInteger(value) ? 0 : 1;
    return `${value.toFixed(digits).replace(/\.0$/, '')} ${units[index]}`;
  }

  function attachPdfMergeTool(options = {}) {
    const doc = options.document || root.document;
    const win = options.window || root;
    const engine = options.engine || root.PDFMergeEngine;
    const WorkerConstructor = options.Worker || root.Worker;
    const BlobConstructor = options.Blob || root.Blob;
    const URLApi = options.URL || root.URL;
    if (!doc || !engine || !WorkerConstructor || !BlobConstructor || !URLApi) return false;

    const fileInput = doc.querySelector('#pdfFiles');
    const fileList = doc.querySelector('#pdfFileList');
    const mergeButton = doc.querySelector('#mergePdfs');
    const clearButton = doc.querySelector('#clearPdfs');
    const downloadLink = doc.querySelector('#downloadPdf');
    const status = doc.querySelector('#pdfStatus');
    const summary = doc.querySelector('#pdfSummary');
    if (!fileInput || !fileList || !mergeButton || !clearButton || !downloadLink || !status || !summary) return false;

    const language = localeFor(doc.documentElement.lang);
    let selectedFiles = [];
    let activeWorker = null;
    let timeoutHandle = null;
    let outputUrl = '';
    let operationId = 0;
    let operationDeadline = 0;
    let busy = false;
    const pendingReaders = new Set();
    function setStatus(state, message) { status.dataset.state = state; status.textContent = message; }
    function updateControls() {
      fileInput.disabled = busy;
      mergeButton.disabled = busy || selectedFiles.length < 2;
      mergeButton.textContent = language === 'zh' ? (busy ? '正在合并…' : '合并 PDF') : (busy ? 'Merging…' : 'Merge PDFs');
      summary.textContent = selectedFiles.length ? pdfMessage('selected', language, { count: selectedFiles.length }) : pdfMessage('ready', language);
      for (const button of fileList.querySelectorAll('button')) button.disabled = busy;
    }
    function clearOutput() {
      if (outputUrl) URLApi.revokeObjectURL(outputUrl);
      outputUrl = '';
      downloadLink.hidden = true;
      downloadLink.removeAttribute('href');
      downloadLink.removeAttribute('data-page-count');
      downloadLink.removeAttribute('data-file-count');
    }
    function cancelPendingReads() {
      const readers = Array.from(pendingReaders);
      pendingReaders.clear();
      for (const reader of readers) {
        if (reader.readyState === win.FileReader.LOADING) reader.abort();
      }
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
      cancelPendingReads();
      if (activeWorker) activeWorker.terminate();
      activeWorker = null;
    }
    function renderFiles() {
      fileList.replaceChildren();
      selectedFiles.forEach((file, index) => {
        const row = doc.createElement('li');
        row.className = 'pdf-file-row';
        const details = doc.createElement('div');
        details.className = 'pdf-file-details';
        const name = doc.createElement('span');
        name.className = 'pdf-file-name';
        name.textContent = file.name || (language === 'zh' ? '未命名 PDF' : 'Unnamed PDF');
        const size = doc.createElement('small');
        size.textContent = formatPdfSize(file.size);
        details.append(name, size);
        const actions = doc.createElement('div');
        actions.className = 'pdf-file-actions';
        const makeButton = (action, text, disabled, handler) => {
          const button = doc.createElement('button');
          button.type = 'button';
          button.className = 'secondary';
          button.dataset.action = action;
          button.textContent = text;
          button.setAttribute('aria-label', `${text}: ${name.textContent}`);
          button.disabled = busy || disabled;
          button.addEventListener('click', handler);
          return button;
        };
        actions.append(
          makeButton('up', language === 'zh' ? TEXT.zh.up : TEXT.en.up, index === 0, () => moveFile(index, -1)),
          makeButton('down', language === 'zh' ? TEXT.zh.down : TEXT.en.down, index === selectedFiles.length - 1, () => moveFile(index, 1)),
          makeButton('remove', language === 'zh' ? TEXT.zh.remove : TEXT.en.remove, false, () => removeFile(index)),
        );
        row.append(details, actions);
        fileList.append(row);
      });
      updateControls();
    }
    function invalidateCurrentResult() {
      operationId += 1;
      stopWorker();
      busy = false;
      clearOutput();
      updateControls();
      return operationId;
    }
    function moveFile(index, delta) {
      if (busy) return;
      const next = index + delta;
      if (index < 0 || next < 0 || next >= selectedFiles.length) return;
      invalidateCurrentResult();
      [selectedFiles[index], selectedFiles[next]] = [selectedFiles[next], selectedFiles[index]];
      renderFiles();
      setStatus('ready', pdfMessage('selected', language, { count: selectedFiles.length }));
    }
    function removeFile(index) {
      if (busy || index < 0 || index >= selectedFiles.length) return;
      invalidateCurrentResult();
      selectedFiles.splice(index, 1);
      renderFiles();
      setStatus('ready', selectedFiles.length === 1 ? pdfMessage('needMore', language) : pdfMessage('ready', language));
    }
    function showError(code) { setStatus('error', pdfMessage(ERROR_MESSAGES[code] ? code : 'PROCESSING_FAILED', language)); }
    function handleSelection() {
      const appended = Array.from(fileInput.files || []);
      fileInput.value = '';
      if (appended.length === 0) return;
      invalidateCurrentResult();
      const next = selectedFiles.concat(appended);
      try {
        engine.validatePdfFileList(next);
        selectedFiles = next;
        renderFiles();
        setStatus('ready', selectedFiles.length === 1 ? pdfMessage('needMore', language) : pdfMessage('selected', language, { count: selectedFiles.length }));
      } catch (error) {
        selectedFiles = [];
        renderFiles();
        showError(error.code);
      }
    }
    function finishWithError(token, code) {
      if (token !== operationId) return;
      operationId += 1;
      stopWorker();
      busy = false;
      clearOutput();
      renderFiles();
      showError(code);
    }
    function operationExpired(token) {
      if (token !== operationId) return true;
      if (win.performance.now() < operationDeadline) return false;
      finishWithError(token, 'WORKER_TIMEOUT');
      return true;
    }
    function handleWorkerMessage(worker, token, event) {
      if (activeWorker !== worker || token !== operationId) return;
      if (operationExpired(token)) return;
      const data = event.data || {};
      if (data.type === 'progress') { setStatus('working', pdfMessage('progress', language, data)); return; }
      if (data.type === 'error') { finishWithError(token, data.code); return; }
      if (data.type !== 'success' || !(data.buffer instanceof ArrayBuffer)) { finishWithError(token, 'PROCESSING_FAILED'); return; }
      try {
        const bytes = engine.assertOutputSize(new Uint8Array(data.buffer));
        if (operationExpired(token)) return;
        const hasHeader = engine.hasPdfHeader(bytes);
        if (operationExpired(token)) return;
        if (!hasHeader || !Number.isInteger(data.fileCount) || data.fileCount !== selectedFiles.length ||
            !Number.isInteger(data.pageCount) || data.pageCount < 1 || data.pageCount > engine.PDF_LIMITS.maxPages) throw new Error('Invalid worker result.');
        const blob = new BlobConstructor([bytes], { type: 'application/pdf' });
        if (operationExpired(token)) return;
        busy = false;
        renderFiles();
        if (operationExpired(token)) return;
        outputUrl = URLApi.createObjectURL(blob);
        if (operationExpired(token)) return;
        downloadLink.href = outputUrl;
        downloadLink.download = 'merged.pdf';
        downloadLink.dataset.pageCount = String(data.pageCount);
        downloadLink.dataset.fileCount = String(data.fileCount);
        if (operationExpired(token)) return;
        setStatus('success', pdfMessage('merged', language, { pageCount: data.pageCount, fileCount: data.fileCount }));
        if (operationExpired(token)) return;
        downloadLink.hidden = false;
        if (operationExpired(token)) return;
        stopWorker();
      } catch (error) { finishWithError(token, error.code || 'PROCESSING_FAILED'); }
    }
    async function mergeSelectedFiles() {
      if (busy) return;
      if (selectedFiles.length < 2) { clearOutput(); setStatus('error', pdfMessage('NEED_MULTIPLE_FILES', language)); return; }
      try { engine.validatePdfFileList(selectedFiles); }
      catch (error) { clearOutput(); showError(error.code); return; }
      const token = invalidateCurrentResult();
      const files = selectedFiles.slice();
      busy = true;
      renderFiles();
      setStatus('working', pdfMessage('reading', language));
      operationDeadline = win.performance.now() + engine.PDF_LIMITS.taskTimeoutMs;
      timeoutHandle = win.setTimeout(() => finishWithError(token, 'WORKER_TIMEOUT'), engine.PDF_LIMITS.taskTimeoutMs);
      const buffers = [];
      try {
        for (const file of files) {
          const buffer = await readFileBuffer(file);
          if (operationExpired(token)) return;
          const hasHeader = engine.hasPdfHeader(buffer);
          if (operationExpired(token)) return;
          if (!hasHeader) { finishWithError(token, 'INVALID_PDF'); return; }
          buffers.push(buffer);
        }
        if (operationExpired(token)) return;
        const worker = new WorkerConstructor('/pdf/pdf-merge-worker.js');
        activeWorker = worker;
        if (operationExpired(token)) return;
        worker.onmessage = event => handleWorkerMessage(worker, token, event);
        worker.onerror = () => finishWithError(token, 'PROCESSING_FAILED');
        setStatus('working', pdfMessage('merging', language));
        if (operationExpired(token)) return;
        worker.postMessage({ buffers }, buffers);
      } catch { finishWithError(token, 'PROCESSING_FAILED'); }
    }
    function clearAll() {
      operationId += 1;
      stopWorker();
      busy = false;
      selectedFiles = [];
      fileInput.value = '';
      clearOutput();
      renderFiles();
      setStatus('ready', pdfMessage('ready', language));
    }
    fileInput.addEventListener('change', handleSelection);
    mergeButton.addEventListener('click', mergeSelectedFiles);
    clearButton.addEventListener('click', clearAll);
    win.addEventListener('pagehide', clearAll);
    win.addEventListener('pageshow', event => { if (event.persisted) clearAll(); });
    clearAll();
    return Object.freeze({ clear: clearAll });
  }
  return Object.freeze({ pdfMessage, formatPdfSize, attachPdfMergeTool });
});
