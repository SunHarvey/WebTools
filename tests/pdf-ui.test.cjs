'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pdfMessage, formatPdfSize } = require('../pdf/pdf-tool.js');
const toolSource = fs.readFileSync(path.join(__dirname, '..', 'pdf/pdf-tool.js'), 'utf8');

test('localizes all PDF merge success, progress and failure states', () => {
  for (const key of ['ready', 'needMore', 'selected', 'working', 'merged', 'invalidPdf', 'protected', 'pageLimit', 'fileLimit', 'fileSizeLimit', 'totalSizeLimit', 'fileEmpty', 'outputLimit', 'WORKER_TIMEOUT', 'failed', 'FILE_COUNT_LIMIT', 'FILE_SIZE_LIMIT', 'TOTAL_SIZE_LIMIT', 'FILE_EMPTY']) {
    assert.equal(typeof pdfMessage(key, 'en'), 'string', `${key} English message`);
    assert.equal(typeof pdfMessage(key, 'zh-CN'), 'string', `${key} Chinese message`);
  }
  assert.match(pdfMessage('protected', 'en'), /password-protected/i);
  assert.match(pdfMessage('protected', 'zh-CN'), /密码保护/);
  assert.match(pdfMessage('WORKER_TIMEOUT', 'en'), /45 seconds/);
  assert.match(pdfMessage('WORKER_TIMEOUT', 'zh-CN'), /45 秒/);
});

test('PDF status messages never include raw file or parser input', () => {
  const privateMarker = 'private-pdf-name-001';
  for (const code of ['INVALID_PDF', 'PASSWORD_PROTECTED', 'PROCESSING_FAILED']) {
    const message = pdfMessage(code, 'en', { raw: privateMarker });
    assert.doesNotMatch(message, new RegExp(privateMarker));
  }
});

test('formats file sizes with bounded nonnegative values', () => {
  assert.equal(formatPdfSize(0), '0 B');
  assert.equal(formatPdfSize(1024), '1 KiB');
  assert.equal(formatPdfSize(1024 * 1024), '1 MiB');
  assert.equal(formatPdfSize(-1), '0 B');
  assert.equal(formatPdfSize(Number.NaN), '0 B');
});

test('PDF file reads are abortable and errors invalidate pending async work', () => {
  assert.match(toolSource, /function readFileBuffer\(file\)/);
  assert.match(toolSource, /const pendingReaders = new Set\(\)/);
  assert.match(toolSource, /reader\.abort\(\)/);
  assert.match(toolSource, /function cancelPendingReads\(\)/);
  assert.match(toolSource, /function finishWithError\(token, code\)\s*\{\s*if \(token !== operationId\) return;\s*operationId \+= 1;\s*stopWorker\(\)/);
  assert.match(toolSource, /\} catch \{ cleanup\(\); reject\(new Error\('FILE_READ_FAILED'\)\); \}/);
  assert.doesNotMatch(toolSource, /file\.arrayBuffer\(\)/);
});

test('PDF deadline covers reads, worker messages, and output construction', () => {
  assert.match(toolSource, /operationDeadline = win\.performance\.now\(\) \+ engine\.PDF_LIMITS\.taskTimeoutMs/);
  assert.match(toolSource, /function operationExpired\(token\)[\s\S]*?win\.performance\.now\(\) < operationDeadline/);
  assert.match(toolSource, /const hasHeader = engine\.hasPdfHeader\(buffer\);\s*if \(operationExpired\(token\)\) return;/);
  assert.match(toolSource, /if \(operationExpired\(token\)\) return;\s*const worker = new WorkerConstructor/);
  assert.match(toolSource, /const blob = new BlobConstructor\(\[bytes\], \{ type: 'application\/pdf' \}\);\s*if \(operationExpired\(token\)\) return;/);
});
