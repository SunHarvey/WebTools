'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pdfSplitMessage, formatPdfSplitSize } = require('../pdf-split/pdf-split-tool.js');
const source = fs.readFileSync(path.join(__dirname, '..', 'pdf-split/pdf-split-tool.js'), 'utf8');

test('localizes PDF split selection, progress, success and all errors', () => {
  for (const key of ['ready', 'selected', 'reading', 'splitting', 'progress', 'success', 'FILE_EMPTY', 'FILE_SIZE_LIMIT', 'INVALID_PDF', 'PASSWORD_PROTECTED', 'INVALID_RANGES', 'RANGE_LIMIT', 'PAGE_RANGE_OUT_OF_BOUNDS', 'OVERLAPPING_PAGES', 'PAGE_LIMIT', 'OUTPUT_SIZE_LIMIT', 'WORKER_TIMEOUT', 'PROCESSING_FAILED']) {
    assert.equal(typeof pdfSplitMessage(key, 'en'), 'string');
    assert.equal(typeof pdfSplitMessage(key, 'zh-CN'), 'string');
  }
  assert.match(pdfSplitMessage('selected', 'en', { name: 'secret.pdf', size: 1024 }), /secret\.pdf \(1 KiB\)/);
  assert.match(pdfSplitMessage('success', 'zh', { rangeCount: 2, pageCount: 5 }), /2 个 PDF.*5 页/);
  assert.match(pdfSplitMessage('WORKER_TIMEOUT', 'en'), /45 seconds/);
});

test('formats file sizes as bounded nonnegative values', () => {
  assert.equal(formatPdfSplitSize(0), '0 B');
  assert.equal(formatPdfSplitSize(1024), '1 KiB');
  assert.equal(formatPdfSplitSize(1024 * 1024), '1 MiB');
  assert.equal(formatPdfSplitSize(-1), '0 B');
  assert.equal(formatPdfSplitSize(Number.NaN), '0 B');
});

test('terminates a worker at the deadline and ignores any late success message', async () => {
  const Engine = require('../pdf/pdf-split-engine.js');
  const elements = Object.fromEntries(['#pdfSplitFile', '#pdfSplitRanges', '#splitPdf', '#clearPdfSplit', '#pdfSplitOutputs', '#pdfSplitStatus', '#pdfSplitSummary'].map(selector => [selector, createFakeElement()]));
  const document = { documentElement: { lang: 'en' }, querySelector: selector => elements[selector], createElement: () => createFakeElement() };
  let now = 0; let timeoutCallback = null; let timeoutCleared = false; let worker = null; let objectUrlCount = 0;
  class FakeFileReader {
    static LOADING = 1;
    constructor() { this.readyState = 0; }
    readAsArrayBuffer() { this.readyState = 2; this.result = Uint8Array.from([37, 80, 68, 70, 45, 49]).buffer; queueMicrotask(() => this.onload?.()); }
    abort() { this.readyState = 2; this.onabort?.(); }
  }
  class FakeWorker {
    constructor() { worker = this; this.terminated = false; }
    postMessage(message) { this.message = message; }
    terminate() { this.terminated = true; }
  }
  const window = {
    FileReader: FakeFileReader,
    performance: { now: () => now },
    setTimeout(callback) { timeoutCallback = callback; return 17; },
    clearTimeout() { timeoutCleared = true; },
    addEventListener() {},
  };
  const URL = { createObjectURL() { objectUrlCount += 1; return 'blob:fake'; }, revokeObjectURL() {} };
  assert.ok(require('../pdf-split/pdf-split-tool.js').attachPdfSplitTool({ document, window, engine: Engine, Worker: FakeWorker, Blob: class {}, URL }));
  elements['#pdfSplitRanges'].value = '1';
  elements['#pdfSplitRanges'].dispatch('input');
  elements['#pdfSplitFile'].files = [{ name: 'secret.pdf', size: 6 }];
  elements['#pdfSplitFile'].dispatch('change');
  elements['#splitPdf'].dispatch('click');
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(worker, 'the split worker was not started');
  assert.equal(elements['#pdfSplitStatus'].dataset.state, 'working');
  now = Engine.PDF_SPLIT_LIMITS.taskTimeoutMs + 1;
  timeoutCallback();
  assert.equal(worker.terminated, true, 'the non-responding worker was not terminated');
  assert.equal(timeoutCleared, true);
  assert.equal(elements['#pdfSplitStatus'].dataset.state, 'error');
  assert.match(elements['#pdfSplitStatus'].textContent, /45 seconds/);
  worker.onmessage({ data: { type: 'success', files: [], rangeCount: 1, pageCount: 1, totalOutputBytes: 1 } });
  assert.equal(elements['#pdfSplitStatus'].dataset.state, 'error', 'a stale late worker message replaced the timeout error');
  assert.equal(elements['#pdfSplitOutputs'].children.length, 0);
  assert.equal(objectUrlCount, 0, 'late worker output created a download URL');
});

function createFakeElement() {
  const listeners = new Map();
  return {
    dataset: {}, children: [], value: '', files: [], addEventListener(type, listener) { listeners.set(type, listener); },
    dispatch(type) { listeners.get(type)?.({ type }); }, append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = [...children]; },
  };
}

test('bounds the read-to-output lifecycle and clears temporary PDF data', () => {
  assert.match(source, /function readFileBuffer\(file\)/);
  assert.match(source, /function cancelReads\(\)/);
  assert.match(source, /reader\.abort\(\)/);
  assert.match(source, /operationDeadline = win\.performance\.now\(\) \+ engine\.PDF_SPLIT_LIMITS\.taskTimeoutMs/);
  assert.match(source, /worker\.postMessage\(\{ buffer, ranges: rangeExpression \}, \[buffer\]\)/);
  assert.match(source, /activeWorker\.terminate\(\)/);
  assert.match(source, /URLApi\.revokeObjectURL\(url\)/);
  assert.match(source, /win\.addEventListener\('pagehide', clearAll\)/);
  assert.match(source, /if \(event\.persisted\) clearAll\(\)/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie|indexedDB|sendBeacon|XMLHttpRequest|\bfetch\s*\(|innerHTML/);
});
