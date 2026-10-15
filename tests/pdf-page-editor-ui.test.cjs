'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const PDFLib = require('../pdf/vendor/pdf-lib.min.js');
const engine = require('../pdf/pdf-page-editor-engine.js');
const { formatPdfPageEditorSize, pdfPageEditorMessage, attachPdfPageEditor } = require('../pdf-page-editor/pdf-page-editor-tool.js');

async function makePdf() {
  const document = await PDFLib.PDFDocument.create();
  document.addPage([300, 400]);
  return new Uint8Array(await document.save());
}

function createHarness(bytes, language = 'en') {
  const selectors = ['#pdfPageFile', '#pdfPageSelection', '#pdfPageAction', '#editPdfPages', '#clearPdfPageEdit', '#downloadEditedPdf', '#pdfPageStatus', '#pdfPageSummary'];
  const elements = Object.fromEntries(selectors.map(selector => [selector, createElement()]));
  const document = { documentElement: { lang: language === 'zh' ? 'zh-CN' : 'en' }, querySelector: selector => elements[selector], createElement: () => createElement() };
  let now = 0;
  let timerCallback = null;
  let worker = null;
  const revoked = [];
  const urls = [];
  class FakeFileReader {
    static LOADING = 1;
    constructor() { this.readyState = 0; }
    readAsArrayBuffer() { this.readyState = 2; this.result = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); queueMicrotask(() => this.onload?.()); }
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
    setTimeout(callback) { timerCallback = callback; return 1; },
    clearTimeout() {},
    addEventListener() {},
  };
  const URL = { createObjectURL(blob) { const url = `blob:local-${urls.length + 1}`; urls.push({ url, blob }); return url; }, revokeObjectURL(url) { revoked.push(url); } };
  const controller = attachPdfPageEditor({ document, window, engine, Worker: FakeWorker, Blob: class FakeBlob { constructor(parts, options) { this.parts = parts; this.type = options.type; } }, URL });
  elements['#pdfPageSelection'].value = '1';
  elements['#pdfPageAction'].value = 'rotate-right';
  elements['#pdfPageFile'].files = [{ name: 'private-document-sentinel.pdf', size: bytes.byteLength }];
  elements['#pdfPageFile'].dispatch('change');
  return {
    elements, controller, get worker() { return worker; }, urls, revoked,
    async start() { elements['#editPdfPages'].dispatch('click'); await new Promise(resolve => setImmediate(resolve)); },
    expire() { now = engine.PDF_PAGE_EDITOR_LIMITS.taskTimeoutMs + 1; timerCallback?.(); },
  };
}

function createElement() {
  const listeners = new Map();
  const attributes = new Map();
  return {
    dataset: {}, value: '', files: [], hidden: false, disabled: false, textContent: '', href: '', download: '',
    addEventListener(type, listener) { listeners.set(type, listener); },
    dispatch(type) { listeners.get(type)?.({ type }); },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); if (name === 'href') this.href = ''; },
    hasAttribute(name) { return attributes.has(name); },
    replaceChildren(...children) { this.children = [...children]; },
    append(...children) { this.children ||= []; this.children.push(...children); },
  };
}

test('localizes page-editor messages and formats bounded file sizes', () => {
  assert.match(pdfPageEditorMessage('selected', 'en', { size: 1024 }), /PDF selected.*1 KiB/);
  assert.match(pdfPageEditorMessage('selected', 'zh', { size: 1024 }), /已选择 PDF.*1 KiB/);
  assert.match(pdfPageEditorMessage('success', 'en', { action: 'delete', changedPageCount: 2, pageCount: 3 }), /Deleted 2 pages.*3 pages remain/);
  assert.match(pdfPageEditorMessage('DELETE_ALL_PAGES', 'zh'), /至少要保留一页/);
  assert.equal(formatPdfPageEditorSize(-1), '0 B');
  assert.equal(formatPdfPageEditorSize(1024 * 1024), '1 MiB');
});

test('edits locally, creates one PDF download and clears it on explicit cleanup', async () => {
  const bytes = await makePdf();
  const harness = createHarness(bytes);
  assert.ok(harness.controller);
  assert.doesNotMatch(harness.elements['#pdfPageSummary'].textContent, /private-document-sentinel/);
  await harness.start();
  assert.ok(harness.worker);
  assert.equal(harness.worker.message.action, 'rotate-right');
  assert.equal(harness.worker.message.selection, '1');
  assert.equal('name' in harness.worker.message, false);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  harness.worker.onmessage({ data: { type: 'success', buffer, action: 'rotate-right', sourcePageCount: 1, pageCount: 1, changedPageCount: 1 } });
  const link = harness.elements['#downloadEditedPdf'];
  assert.equal(harness.elements['#pdfPageStatus'].dataset.state, 'success');
  assert.equal(link.download, 'edited.pdf');
  assert.equal(link.dataset.pageCount, '1');
  assert.equal(link.hidden, false);
  assert.equal(link.href, 'blob:local-1');
  harness.controller.clear();
  assert.equal(link.hidden, true);
  assert.equal(link.hasAttribute('href'), false);
  assert.deepEqual(harness.revoked, ['blob:local-1']);
});

test('terminates a nonresponding worker at deadline and ignores late output', async () => {
  const bytes = await makePdf();
  const harness = createHarness(bytes);
  await harness.start();
  assert.ok(harness.worker);
  harness.expire();
  assert.equal(harness.worker.terminated, true);
  assert.equal(harness.elements['#pdfPageStatus'].dataset.state, 'error');
  assert.match(harness.elements['#pdfPageStatus'].textContent, /45 seconds/);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  harness.worker.onmessage({ data: { type: 'success', buffer, action: 'rotate-right', sourcePageCount: 1, pageCount: 1, changedPageCount: 1 } });
  assert.equal(harness.elements['#pdfPageStatus'].dataset.state, 'error');
  assert.equal(harness.elements['#downloadEditedPdf'].hidden, true);
  assert.equal(harness.urls.length, 0);
});
