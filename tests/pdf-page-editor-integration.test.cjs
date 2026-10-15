'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { findTool, RELATED_TOOLS } = require('../shared/tools-data.js');
const { routes } = require('../scripts/generate-sitemap.cjs');
const pkg = require('../package.json');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('registers the PDF page editor as a private bilingual route with related PDF tools', () => {
  const tool = findTool('pdf-page-editor');
  assert.ok(tool);
  assert.equal(tool.category, 'developer');
  assert.equal(tool.recordRecent, false);
  assert.equal(tool.name.en, 'PDF Page Editor');
  assert.equal(tool.name.zh, 'PDF 页面编辑器');
  assert.ok(tool.description.en.includes('locally'));
  assert.ok(tool.description.zh.includes('本地'));
  assert.ok(RELATED_TOOLS.pdf.includes('pdf-page-editor'));
  assert.ok(RELATED_TOOLS['pdf-page-editor'].includes('pdf'));
  assert.ok(routes.includes('/pdf-page-editor/'));
  assert.ok(routes.includes('/zh/pdf-page-editor/'));
  for (const file of ['pdf/pdf-page-editor-engine.js', 'pdf-page-editor/pdf-page-editor-tool.js', 'pdf-page-editor/pdf-page-editor-app.js', 'pdf-page-editor/pdf-page-editor-worker.js']) {
    assert.ok(pkg.scripts['check:js'].includes(`node --check ${file}`));
  }
});

test('both locale pages expose matching selection, action, status and download controls', () => {
  const english = read('pdf-page-editor/index.html');
  const chinese = read('zh/pdf-page-editor/index.html');
  for (const id of ['pdfPageFile', 'pdfPageSelection', 'pdfPageAction', 'pdfPageSummary', 'editPdfPages', 'clearPdfPageEdit', 'downloadEditedPdf', 'pdfPageStatus']) {
    assert.match(english, new RegExp(`id="${id}"`));
    assert.match(chinese, new RegExp(`id="${id}"`));
  }
  for (const page of [english, chinese]) {
    assert.match(page, /pdf\/pdf-page-editor-engine\.js/);
    assert.match(page, /pdf-page-editor\/pdf-page-editor-tool\.js/);
    assert.match(page, /pdf-page-editor\/pdf-page-editor-app\.js/);
    assert.match(page, /pdf-page-editor\/pdf-page-editor\.css/);
    assert.match(page, /rotate-right/);
    assert.match(page, /rotate-left/);
    assert.match(page, /delete/);
    assert.match(page, /not uploaded|不会上传/);
    assert.doesNotMatch(page, /<(?:script|link)[^>]+(?:src|href)="https?:\/\/(?!www\.utilcover\.com)/i);
  }
  assert.match(english, /lang="en"/);
  assert.match(chinese, /lang="zh-CN"/);
});

test('page editor worker uses the local PDF library and transfers no filename or document text', () => {
  const worker = read('pdf-page-editor/pdf-page-editor-worker.js');
  assert.match(worker, /importScripts\([^)]*pdf-lib\.min\.js/);
  assert.match(worker, /PDFPageEditorEngine\.processPdfBuffer/);
  assert.doesNotMatch(worker, /fetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie/);
  assert.doesNotMatch(worker, /postMessage\([^\n]*name/);
});

test('page editor route has same-origin worker CSP and the shared vendor remains unchanged', () => {
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'pdf/vendor/pdf-lib.min.js')));
  const notice = read('pdf/vendor/NOTICE.md');
  const bundle = fs.readFileSync(path.join(__dirname, '..', 'pdf/vendor/pdf-lib.min.js'));
  const recordedHash = notice.match(/bundle SHA-256[^`]*`([a-f0-9]{64})`/i)?.[1];
  assert.ok(recordedHash);
  assert.equal(crypto.createHash('sha256').update(bundle).digest('hex'), recordedHash);
  const headers = read('_headers');
  for (const route of ['/pdf-page-editor/*', '/zh/pdf-page-editor/*']) {
    const start = headers.indexOf(`${route}\n`);
    assert.notEqual(start, -1, `${route} has no CSP rule`);
    const block = headers.slice(start, headers.indexOf('\n\n', start));
    assert.match(block, /worker-src 'self'/);
    assert.match(block, /connect-src 'none'/);
  }
});

test('page editor UI and worker never persist, upload, or inject PDF data unsafely', () => {
  for (const file of ['pdf/pdf-page-editor-engine.js', 'pdf-page-editor/pdf-page-editor-tool.js', 'pdf-page-editor/pdf-page-editor-app.js', 'pdf-page-editor/pdf-page-editor-worker.js']) {
    const source = read(file);
    assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie|indexedDB|sendBeacon|XMLHttpRequest|\bfetch\s*\(|innerHTML/);
  }
});
