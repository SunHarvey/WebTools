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

test('registers PDF splitter as a bilingual local-only route with related PDF tools', () => {
  const tool = findTool('pdf-split');
  assert.ok(tool);
  assert.equal(tool.category, 'developer');
  assert.equal(tool.recordRecent, false);
  assert.equal(tool.name.en, 'PDF Splitter & Page Extractor');
  assert.equal(tool.name.zh, 'PDF 拆分与页面提取');
  assert.ok(tool.description.en.includes('locally'));
  assert.ok(tool.description.zh.includes('本地'));
  assert.ok(RELATED_TOOLS.pdf.includes('pdf-split'));
  assert.ok(RELATED_TOOLS['pdf-split'].includes('pdf'));
  assert.ok(routes.includes('/pdf-split/'));
  assert.ok(routes.includes('/zh/pdf-split/'));
  for (const file of ['pdf/pdf-split-engine.js', 'pdf-split/pdf-split-tool.js', 'pdf-split/pdf-split-app.js', 'pdf-split/pdf-split-worker.js']) {
    assert.ok(pkg.scripts['check:js'].includes(`node --check ${file}`));
  }
});

test('both locale pages expose matching range, status and per-output download controls', () => {
  const english = read('pdf-split/index.html');
  const chinese = read('zh/pdf-split/index.html');
  for (const id of ['pdfSplitFile', 'pdfSplitRanges', 'pdfSplitSummary', 'splitPdf', 'clearPdfSplit', 'pdfSplitOutputs', 'pdfSplitStatus']) {
    assert.match(english, new RegExp(`id="${id}"`));
    assert.match(chinese, new RegExp(`id="${id}"`));
  }
  for (const page of [english, chinese]) {
    assert.match(page, /pdf\/pdf-split-engine\.js/);
    assert.match(page, /pdf-split\/pdf-split-tool\.js/);
    assert.match(page, /pdf-split\/pdf-split-app\.js/);
    assert.match(page, /pdf-split\/pdf-split\.css/);
    assert.match(page, /not uploaded|不会上传/);
    assert.doesNotMatch(page, /<(?:script|link)[^>]+(?:src|href)="https?:\/\/(?!www\.utilcover\.com)/i);
  }
  assert.match(english, /lang="en"/);
  assert.match(chinese, /lang="zh-CN"/);
});

test('PDF split worker uses the local vendor and transfers only data needed for splitting', () => {
  const worker = read('pdf-split/pdf-split-worker.js');
  assert.match(worker, /importScripts\([^)]*pdf-lib\.min\.js/);
  assert.match(worker, /PDFSplitEngine\.splitPdfBuffer/);
  assert.doesNotMatch(worker, /fetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie/);
  assert.doesNotMatch(worker, /postMessage\([^\n]*name/);
});

test('PDF split route has same-origin worker CSP and shared PDF vendor stays unchanged', () => {
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'pdf/vendor/pdf-lib.min.js')));
  const notice = read('pdf/vendor/NOTICE.md');
  const bundle = fs.readFileSync(path.join(__dirname, '..', 'pdf/vendor/pdf-lib.min.js'));
  const recordedHash = notice.match(/bundle SHA-256[^`]*`([a-f0-9]{64})`/i)?.[1];
  assert.ok(recordedHash);
  assert.equal(crypto.createHash('sha256').update(bundle).digest('hex'), recordedHash);
  const headers = read('_headers');
  for (const route of ['/pdf-split/*', '/zh/pdf-split/*']) {
    const start = headers.indexOf(`${route}\n`);
    assert.notEqual(start, -1, `${route} has no CSP rule`);
    const block = headers.slice(start, headers.indexOf('\n\n', start));
    assert.match(block, /worker-src 'self'/);
    assert.match(block, /connect-src 'none'/);
  }
});

test('PDF split UI and worker never persist, upload, or inject document data unsafely', () => {
  for (const file of ['pdf/pdf-split-engine.js', 'pdf-split/pdf-split-tool.js', 'pdf-split/pdf-split-app.js', 'pdf-split/pdf-split-worker.js']) {
    const source = read(file);
    assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie|indexedDB|sendBeacon|XMLHttpRequest|\bfetch\s*\(|innerHTML/);
  }
});
