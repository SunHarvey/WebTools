'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const {imagePdfMessage,formatImageSize}=require('../image-to-pdf/image-pdf-tool.js');
const source=fs.readFileSync(path.join(__dirname,'..','image-to-pdf/image-pdf-tool.js'),'utf8');

test('localizes image-to-PDF selection, progress and error messages',()=>{
  for(const key of ['ready','selected','reading','working','progress','success','NO_FILES','FILE_COUNT_LIMIT','FILE_SIZE_LIMIT','TOTAL_SIZE_LIMIT','INVALID_IMAGE','PIXEL_LIMIT','TOTAL_PIXEL_LIMIT','OUTPUT_SIZE_LIMIT','WORKER_TIMEOUT','PROCESSING_FAILED']){
    assert.equal(typeof imagePdfMessage(key,'en'),'string');
    assert.equal(typeof imagePdfMessage(key,'zh-CN'),'string');
  }
  assert.match(imagePdfMessage('WORKER_TIMEOUT','en'),/45 seconds/);
  assert.match(imagePdfMessage('WORKER_TIMEOUT','zh-CN'),/45 秒/);
  assert.match(imagePdfMessage('selected','zh',{count:2}),/2 张图片/);
});

test('file size formatter remains bounded and nonnegative',()=>{
  assert.equal(formatImageSize(0),'0 B');assert.equal(formatImageSize(1024),'1 KiB');assert.equal(formatImageSize(1024*1024),'1 MiB');assert.equal(formatImageSize(-1),'0 B');assert.equal(formatImageSize(Number.NaN),'0 B');
});

test('image reads abort and operation token/deadline guard worker and output lifecycle',()=>{
  assert.match(source,/function readBuffer\(file\)/);
  assert.match(source,/const pendingReaders=new Set\(\)/);
  assert.match(source,/reader\.abort\(\)/);
  assert.match(source,/function cancelReads\(\)/);
  assert.match(source,/operationDeadline=win\.performance\.now\(\)\+engine\.IMAGE_PDF_LIMITS\.taskTimeoutMs/);
  assert.match(source,/if\(expired\(token\)\)return;const worker=new WorkerConstructor/);
  assert.match(source,/new BlobConstructor\(\[bytes\],\{type:'application\/pdf'\}\);if\(expired\(token\)\)return/);
  assert.match(source,/function finishError\(token,code\)\{if\(token!==operationId\)return;operationId\+=1;stopWorker\(\)/);
  assert.match(source,/catch\{if\(token===operationId\)finishError\(token,'PROCESSING_FAILED'\);\}/);
  assert.doesNotMatch(source,/file\.arrayBuffer\(\)|innerHTML|localStorage|sessionStorage|document\.cookie|indexedDB|sendBeacon|XMLHttpRequest|\bfetch\s*\(/);
});
