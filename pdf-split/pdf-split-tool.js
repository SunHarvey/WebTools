(function exposePdfSplitTool(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PDFSplitTool = api;
})(typeof globalThis === 'object' ? globalThis : self, function createPdfSplitTool(root) {
  'use strict';
  const TEXT = {
    en: {
      ready: 'Choose one PDF and enter page ranges to split into separate PDFs.', selected: (name, size) => `Selected ${name} (${size}).`,
      reading: 'Reading the PDF locally…', splitting: 'Extracting the selected pages locally…',
      progress: (done, total) => `Created ${done} of ${total} PDF files…`, success: (files, pages) => `Created ${files} PDF files containing ${pages} selected pages.`,
      invalidPdf: 'This file is not a readable PDF. Check the file and try again.', protected: 'Password-protected PDFs are not supported.',
      fileSizeLimit: 'The selected PDF must be 25 MiB or smaller.', fileEmpty: 'The selected file is empty or unavailable.',
      invalidRanges: 'Enter page numbers or ranges separated by commas, for example: 1-3, 5, 8-10.',
      rangeLimit: 'Use no more than 20 comma-separated page ranges.', outOfBounds: 'One or more selected pages are outside this PDF.',
      overlaps: 'A page appears more than once. Remove overlapping page ranges.', pageLimit: 'The PDF or selected output exceeds the 500-page limit.',
      outputLimit: 'The generated PDFs exceed the 60 MiB total output limit.',
      timeout: 'PDF processing stopped after 45 seconds to protect this tab. Try fewer pages.',
      failed: 'The PDF pages could not be split. Check the file and try again.',
      output: (name, pages) => `Download ${name} (${pages} pages)`,
    },
    zh: {
      ready: '选择一个 PDF 并输入页码范围，即可拆分为多个 PDF。', selected: (name, size) => `已选择 ${name}（${size}）。`,
      reading: '正在本地读取 PDF…', splitting: '正在本地提取所选页面…',
      progress: (done, total) => `已生成 ${done}/${total} 个 PDF 文件…`, success: (files, pages) => `已生成 ${files} 个 PDF 文件，共提取 ${pages} 页。`,
      invalidPdf: '所选文件不是可读取的 PDF。请检查文件后重试。', protected: '暂不支持受密码保护的 PDF。',
      fileSizeLimit: '所选 PDF 文件不能超过 25 MiB。', fileEmpty: '所选文件为空或无法读取。',
      invalidRanges: '请输入页码或范围，并用逗号分隔，例如：1-3, 5, 8-10。',
      rangeLimit: '逗号分隔的页码范围不能超过 20 组。', outOfBounds: '一个或多个页码超出此 PDF 的页数范围。',
      overlaps: '页码重复，请移除重叠的范围。', pageLimit: 'PDF 页数或所选输出超过 500 页上限。',
      outputLimit: '生成的 PDF 文件总大小超过 60 MiB 上限。',
      timeout: '为保护当前标签页，PDF 处理已在 45 秒后停止。请减少所选页面。',
      failed: '无法拆分 PDF 页面。请检查文件后重试。',
      output: (name, pages) => `下载 ${name}（${pages} 页）`,
    },
  };
  const ERROR_MESSAGES = Object.freeze({
    FILE_EMPTY: 'fileEmpty', FILE_SIZE_LIMIT: 'fileSizeLimit', INVALID_PDF: 'invalidPdf', PASSWORD_PROTECTED: 'protected',
    INVALID_RANGES: 'invalidRanges', RANGE_LIMIT: 'rangeLimit', PAGE_RANGE_OUT_OF_BOUNDS: 'outOfBounds',
    OVERLAPPING_PAGES: 'overlaps', PAGE_LIMIT: 'pageLimit', OUTPUT_SIZE_LIMIT: 'outputLimit',
    WORKER_TIMEOUT: 'timeout', PROCESSING_FAILED: 'failed',
  });
  function localeFor(language) { return String(language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'; }
  function pdfSplitMessage(keyOrCode, language = 'en', details = {}) {
    const locale = localeFor(language); const key = ERROR_MESSAGES[keyOrCode] || keyOrCode; const message = TEXT[locale][key] || TEXT[locale].failed;
    if (key === 'selected') return message(String(details.name || (locale === 'zh' ? '未命名 PDF' : 'Unnamed PDF')), formatPdfSplitSize(details.size));
    if (key === 'progress') return message(Number(details.completedRanges) || 0, Number(details.rangeCount) || 0);
    if (key === 'success') return message(Number(details.rangeCount) || 0, Number(details.pageCount) || 0);
    if (key === 'output') return message(String(details.name || ''), Number(details.pageCount) || 0);
    return message;
  }
  function formatPdfSplitSize(bytes) {
    const size = Number(bytes); if (!Number.isFinite(size) || size <= 0) return '0 B'; if (size < 1024) return `${Math.floor(size)} B`;
    const units = ['KiB', 'MiB', 'GiB']; let value = size / 1024; let index = 0;
    while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
    return `${value.toFixed(value >= 10 || Number.isInteger(value) ? 0 : 1).replace(/\.0$/, '')} ${units[index]}`;
  }
  function attachPdfSplitTool(options = {}) {
    const doc = options.document || root.document; const win = options.window || root; const engine = options.engine || root.PDFSplitEngine;
    const WorkerConstructor = options.Worker || root.Worker; const BlobConstructor = options.Blob || root.Blob; const URLApi = options.URL || root.URL;
    if (!doc || !engine || !WorkerConstructor || !BlobConstructor || !URLApi) return false;
    const fileInput = doc.querySelector('#pdfSplitFile'); const rangesInput = doc.querySelector('#pdfSplitRanges'); const splitButton = doc.querySelector('#splitPdf');
    const clearButton = doc.querySelector('#clearPdfSplit'); const outputList = doc.querySelector('#pdfSplitOutputs');
    const status = doc.querySelector('#pdfSplitStatus'); const summary = doc.querySelector('#pdfSplitSummary');
    if (!fileInput || !rangesInput || !splitButton || !clearButton || !outputList || !status || !summary) return false;
    const language = localeFor(doc.documentElement.lang); let selectedFile = null; let activeWorker = null; let timeoutHandle = null;
    let operationId = 0; let operationDeadline = 0; let busy = false; const pendingReaders = new Set(); const outputUrls = new Set();
    function setStatus(state, message) { status.dataset.state = state; status.textContent = message; }
    function clearOutputs() { for (const url of outputUrls) URLApi.revokeObjectURL(url); outputUrls.clear(); outputList.replaceChildren(); }
    function cancelReads() { const readers = Array.from(pendingReaders); pendingReaders.clear(); for (const reader of readers) if (reader.readyState === win.FileReader.LOADING) reader.abort(); }
    function readFileBuffer(file) { return new Promise((resolve, reject) => { let reader = null; const cleanup = () => { if (!reader) return; pendingReaders.delete(reader); reader.onload = null; reader.onerror = null; reader.onabort = null; }; try { reader = new win.FileReader(); pendingReaders.add(reader); reader.onload = () => { const result = reader.result; cleanup(); resolve(result); }; reader.onerror = () => { cleanup(); reject(new Error('FILE_READ_FAILED')); }; reader.onabort = () => { cleanup(); reject(new Error('FILE_READ_ABORTED')); }; reader.readAsArrayBuffer(file); } catch { cleanup(); reject(new Error('FILE_READ_FAILED')); } }); }
    function stopWorker() { if (timeoutHandle !== null) win.clearTimeout(timeoutHandle); timeoutHandle = null; cancelReads(); if (activeWorker) activeWorker.terminate(); activeWorker = null; }
    function updateControls() { fileInput.disabled = busy; rangesInput.disabled = busy; splitButton.disabled = busy || !selectedFile || !rangesInput.value.trim(); splitButton.textContent = language === 'zh' ? (busy ? '正在拆分…' : '拆分 PDF') : (busy ? 'Splitting…' : 'Split PDF'); summary.textContent = selectedFile ? pdfSplitMessage('selected', language, { name: selectedFile.name, size: selectedFile.size }) : pdfSplitMessage('ready', language); }
    function invalidate() { operationId += 1; stopWorker(); busy = false; clearOutputs(); updateControls(); return operationId; }
    function handleSelection() { const file = fileInput.files?.[0] || null; fileInput.value = ''; if (!file) return; invalidate(); try { engine.validatePdfSplitInput(file); selectedFile = file; updateControls(); setStatus('ready', pdfSplitMessage('selected', language, { name: file.name, size: file.size })); } catch (error) { selectedFile = null; updateControls(); setStatus('error', pdfSplitMessage(error.code, language)); } }
    function finishError(token, code) { if (token !== operationId) return; operationId += 1; stopWorker(); busy = false; clearOutputs(); updateControls(); setStatus('error', pdfSplitMessage(code, language)); }
    function expired(token) { if (token !== operationId) return true; if (win.performance.now() < operationDeadline) return false; finishError(token, 'WORKER_TIMEOUT'); return true; }
    function addDownloads(files) { let totalBytes = 0; for (const file of files) { if (!file || typeof file.name !== 'string' || !/^(?:page-\d+|pages-\d+-\d+)\.pdf$/.test(file.name) || !(file.buffer instanceof ArrayBuffer) || !Number.isSafeInteger(file.pageCount) || file.pageCount < 1) throw new Error('Invalid split output.'); const bytes = engine.assertOutputSize(new Uint8Array(file.buffer)); if (!engine.hasPdfHeader(bytes)) throw new Error('Invalid split output.'); totalBytes += bytes.byteLength; engine.assertAggregateOutputSize(totalBytes); } for (const file of files) { const blob = new BlobConstructor([file.buffer], { type: 'application/pdf' }); const url = URLApi.createObjectURL(blob); outputUrls.add(url); const item = doc.createElement('li'); item.className = 'pdf-file-row'; const details = doc.createElement('div'); details.className = 'pdf-file-details'; const name = doc.createElement('span'); name.className = 'pdf-file-name'; name.textContent = file.name; const size = doc.createElement('small'); size.textContent = formatPdfSplitSize(file.buffer.byteLength); details.append(name, size); const link = doc.createElement('a'); link.className = 'button secondary'; link.href = url; link.download = file.name; link.dataset.pageCount = String(file.pageCount); link.dataset.pageRange = file.name.replace(/\.pdf$/, ''); link.textContent = pdfSplitMessage('output', language, { name: file.name, pageCount: file.pageCount }); item.append(details, link); outputList.append(item); } }
    function handleWorkerMessage(worker, token, event) { if (activeWorker !== worker || token !== operationId || expired(token)) return; const data = event.data || {}; if (data.type === 'progress') { setStatus('working', pdfSplitMessage('progress', language, data)); return; } if (data.type === 'error') { finishError(token, data.code); return; } if (data.type !== 'success' || !Array.isArray(data.files) || data.files.length !== data.rangeCount || data.files.length < 1 || data.files.length > engine.PDF_SPLIT_LIMITS.maxRanges || !Number.isSafeInteger(data.rangeCount) || data.rangeCount < 1 || data.rangeCount > engine.PDF_SPLIT_LIMITS.maxRanges || !Number.isSafeInteger(data.pageCount) || data.pageCount < 1 || data.pageCount > engine.PDF_SPLIT_LIMITS.maxOutputPages || !Number.isSafeInteger(data.totalOutputBytes) || data.totalOutputBytes < 1) { finishError(token, 'PROCESSING_FAILED'); return; } try { const outputPageCount = data.files.reduce((sum, file) => sum + file.pageCount, 0); const outputByteCount = data.files.reduce((sum, file) => sum + file.buffer.byteLength, 0); if (outputPageCount !== data.pageCount || outputByteCount !== data.totalOutputBytes || !Number.isSafeInteger(outputByteCount)) throw new Error('Invalid split totals.'); engine.assertAggregateOutputSize(outputByteCount); addDownloads(data.files); if (expired(token)) return; busy = false; updateControls(); setStatus('success', pdfSplitMessage('success', language, { rangeCount: data.rangeCount, pageCount: data.pageCount })); if (expired(token)) return; stopWorker(); } catch { finishError(token, 'PROCESSING_FAILED'); } }
    async function splitSelectedPdf() { if (busy || !selectedFile) return; const rangeExpression = rangesInput.value; try { engine.validatePdfSplitInput(selectedFile); engine.parsePageRanges(rangeExpression, engine.PDF_SPLIT_LIMITS.maxPages); } catch (error) { clearOutputs(); setStatus('error', pdfSplitMessage(error.code, language)); return; } const token = invalidate(); const file = selectedFile; busy = true; updateControls(); setStatus('working', pdfSplitMessage('reading', language)); operationDeadline = win.performance.now() + engine.PDF_SPLIT_LIMITS.taskTimeoutMs; timeoutHandle = win.setTimeout(() => finishError(token, 'WORKER_TIMEOUT'), engine.PDF_SPLIT_LIMITS.taskTimeoutMs); try { const buffer = await readFileBuffer(file); if (expired(token)) return; if (!engine.hasPdfHeader(buffer)) { finishError(token, 'INVALID_PDF'); return; } if (expired(token)) return; const worker = new WorkerConstructor('/pdf-split/pdf-split-worker.js'); activeWorker = worker; if (expired(token)) return; worker.onmessage = message => handleWorkerMessage(worker, token, message); worker.onerror = () => finishError(token, 'PROCESSING_FAILED'); setStatus('working', pdfSplitMessage('splitting', language)); if (expired(token)) return; worker.postMessage({ buffer, ranges: rangeExpression }, [buffer]); } catch { if (token === operationId) finishError(token, 'PROCESSING_FAILED'); } }
    function clearAll() { operationId += 1; stopWorker(); busy = false; selectedFile = null; fileInput.value = ''; rangesInput.value = ''; clearOutputs(); updateControls(); setStatus('ready', pdfSplitMessage('ready', language)); }
    fileInput.addEventListener('change', handleSelection);
    rangesInput.addEventListener('input', () => { if (busy) return; clearOutputs(); updateControls(); if (selectedFile) setStatus('ready', pdfSplitMessage('selected', language, { name: selectedFile.name, size: selectedFile.size })); });
    splitButton.addEventListener('click', splitSelectedPdf); clearButton.addEventListener('click', clearAll); win.addEventListener('pagehide', clearAll); win.addEventListener('pageshow', event => { if (event.persisted) clearAll(); }); clearAll();
    return Object.freeze({ clear: clearAll });
  }
  return Object.freeze({ pdfSplitMessage, formatPdfSplitSize, attachPdfSplitTool });
});
