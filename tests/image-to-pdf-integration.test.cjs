'use strict';

const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const {findTool,RELATED_TOOLS}=require('../shared/tools-data.js');
const {routes}=require('../scripts/generate-sitemap.cjs');
const pkg=require('../package.json');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('registers the image-to-PDF tool as a bilingual local-only route',()=>{
  const tool=findTool('image-to-pdf');assert.ok(tool);assert.equal(tool.category,'design');assert.equal(tool.recordRecent,false);
  assert.equal(tool.name.en,'JPG & PNG to PDF');assert.equal(tool.name.zh,'JPG、PNG 转 PDF');
  assert.match(tool.description.en,/locally/);assert.match(tool.description.zh,/本地/);
  assert.deepEqual(RELATED_TOOLS['image-to-pdf'],['image','pdf','qr']);
  assert.ok(routes.includes('/image-to-pdf/'));assert.ok(routes.includes('/zh/image-to-pdf/'));
  for(const file of ['image-to-pdf/image-pdf-engine.js','image-to-pdf/image-pdf-tool.js','image-to-pdf/image-pdf-app.js','image-to-pdf/image-pdf-worker.js'])assert.ok(pkg.scripts['check:js'].includes(`node --check ${file}`));
});

test('both locale pages expose matching controls, truthful limits and local processing',()=>{
  const en=read('image-to-pdf/index.html'),zh=read('zh/image-to-pdf/index.html');
  for(const id of ['imagePdfFiles','imagePdfFileList','imagePdfSummary','createImagePdf','clearImagePdf','downloadImagePdf','imagePdfStatus']){assert.match(en,new RegExp(`id="${id}"`));assert.match(zh,new RegExp(`id="${id}"`));}
  for(const page of [en,zh]){
    assert.match(page,/image-pdf-engine\.js/);assert.match(page,/image-pdf-tool\.js/);assert.match(page,/image-pdf-app\.js/);assert.match(page,/image-pdf\.css/);
    assert.match(page,/image\/jpeg,image\/png/);assert.match(page,/40 MiB|40 MiB/);assert.match(page,/不会上传|never uploaded/i);
    assert.doesNotMatch(page,/<(?:script|link)[^>]+(?:src|href)="https?:\/\/(?!www\.utilcover\.com)/i);
  }
  assert.match(en,/lang="en"/);assert.match(zh,/lang="zh-CN"/);
  assert.match(en,/EXIF orientation/i);assert.match(zh,/EXIF 方向/);
});

test('image PDF worker transfers bytes only and loads the shared vendored library locally',()=>{
  const worker=read('image-to-pdf/image-pdf-worker.js');
  assert.match(worker,/importScripts\([^)]*pdf-lib\.min\.js/);assert.match(worker,/ImagePdfEngine\.createPdfFromImages/);
  assert.match(worker,/self\.onmessage/);
  assert.doesNotMatch(worker,/fetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie|postMessage\([^\n]*name/);
  const engine=read('image-to-pdf/image-pdf-engine.js'),tool=read('image-to-pdf/image-pdf-tool.js'),app=read('image-to-pdf/image-pdf-app.js');
  for(const source of [engine,tool,app])assert.doesNotMatch(source,/localStorage|sessionStorage|document\.cookie|indexedDB|sendBeacon|XMLHttpRequest|\bfetch\s*\(|innerHTML/);
});

test('image-to-PDF worker CSP is same-origin and the PDF library vendor checksum remains intact',()=>{
  const headers=read('_headers');for(const route of ['/image-to-pdf/*','/zh/image-to-pdf/*']){const start=headers.indexOf(`${route}\n`);assert.notEqual(start,-1,`${route} missing CSP`);const block=headers.slice(start,headers.indexOf('\n\n',start));assert.match(block,/worker-src 'self'/);assert.match(block,/connect-src 'none'/);}
  const notice=read('pdf/vendor/NOTICE.md');const hash=notice.match(/bundle SHA-256[^`]*`([a-f0-9]{64})`/i)?.[1];assert.ok(hash);const bytes=fs.readFileSync(path.join(__dirname,'..','pdf/vendor/pdf-lib.min.js'));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),hash);
});
