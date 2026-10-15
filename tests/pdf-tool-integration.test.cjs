'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { findTool, RELATED_TOOLS } = require('../shared/tools-data.js');
const { routes } = require('../scripts/generate-sitemap.cjs');
const pkg = require('../package.json');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('registers PDF merger as a bilingual local-only tool and SEO route', () => {
  const tool = findTool('pdf');
  assert.ok(tool);
  assert.equal(tool.category, 'developer');
  assert.equal(tool.recordRecent, false);
  assert.equal(tool.name.en, 'PDF Merger');
  assert.equal(tool.name.zh, 'PDF 合并工具');
  assert.ok(tool.description.en.includes('locally'));
  assert.ok(tool.description.zh.includes('本地'));
  assert.deepEqual(RELATED_TOOLS.pdf, ['pdf-page-editor', 'pdf-split', 'image-to-pdf']);
  assert.ok(routes.includes('/pdf/'));
  assert.ok(routes.includes('/zh/pdf/'));
  for (const file of ['pdf/pdf-engine.js', 'pdf/pdf-tool.js', 'pdf/pdf-app.js', 'pdf/pdf-merge-worker.js']) {
    assert.ok(pkg.scripts['check:js'].includes(`node --check ${file}`));
  }
});

test('PDF locale pages provide the same merge controls and local-only assets', () => {
  const english = read('pdf/index.html');
  const chinese = read('zh/pdf/index.html');
  for (const id of ['pdfFiles', 'pdfFileList', 'pdfSummary', 'mergePdfs', 'clearPdfs', 'downloadPdf', 'pdfStatus']) {
    assert.match(english, new RegExp(`id="${id}"`));
    assert.match(chinese, new RegExp(`id="${id}"`));
  }
  for (const page of [english, chinese]) {
    assert.match(page, /src="\/pdf\/pdf-engine\.js"/);
    assert.match(page, /src="\/pdf\/pdf-tool\.js"/);
    assert.match(page, /src="\/pdf\/pdf-app\.js"/);
    assert.match(page, /href="\/pdf\/pdf\.css"/);
    assert.match(page, /not uploaded|不会上传/);
    assert.doesNotMatch(page, /<(?:script|link)[^>]+(?:src|href)="https?:\/\/(?!www\.utilcover\.com)/i);
  }
  assert.match(english, /lang="en"/);
  assert.match(chinese, /lang="zh-CN"/);
});

test('PDF merge worker loads only the vendored library and communicates no filenames', () => {
  const worker = read('pdf/pdf-merge-worker.js');
  assert.match(worker, /importScripts\([^)]*pdf-lib\.min\.js/);
  assert.match(worker, /PDFMergeEngine\.mergePdfBuffers/);
  assert.doesNotMatch(worker, /fetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie/);
  assert.doesNotMatch(worker, /postMessage\([^\n]*name/);
});

test('PDF assets are locally vendored with a license and route-scoped worker CSP', () => {
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'pdf/vendor/pdf-lib.min.js')));
  const license = read('pdf/vendor/LICENSE.md');
  assert.match(license, /MIT License/i);
  const notice = read('pdf/vendor/NOTICE.md');
  assert.match(notice, /@cantoo\/pdf-lib` 2\.11\.1/);
  assert.doesNotMatch(read('pdf/vendor/pdf-lib.min.js'), /sourceMappingURL/);
  const bundle = fs.readFileSync(path.join(__dirname, '..', 'pdf/vendor/pdf-lib.min.js'));
  const recordedHash = notice.match(/bundle SHA-256[^`]*`([a-f0-9]{64})`/i)?.[1];
  assert.ok(recordedHash, 'vendored library checksum is missing from NOTICE.md');
  assert.equal(crypto.createHash('sha256').update(bundle).digest('hex'), recordedHash);
  const headers = read('_headers');
  for (const route of ['/pdf/*', '/zh/pdf/*']) {
    const start = headers.indexOf(`${route}\n`);
    assert.notEqual(start, -1, `${route} has no CSP rule`);
    const block = headers.slice(start, headers.indexOf('\n\n', start));
    assert.match(block, /worker-src 'self'/);
    assert.match(block, /connect-src 'none'/);
  }
});

test('PDF tool code avoids storage, external APIs, and unsafe HTML sinks', () => {
  for (const file of ['pdf/pdf-engine.js', 'pdf/pdf-tool.js', 'pdf/pdf-app.js', 'pdf/pdf-merge-worker.js']) {
    const source = read(file);
    assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie|indexedDB|sendBeacon|XMLHttpRequest|\bfetch\s*\(|innerHTML/);
  }
});
