'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const engine = require('../image-to-pdf/image-pdf-engine.js');
const PDFLib = require('../pdf/vendor/pdf-lib.min.js');

const png1x1 = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64'));
const jpegImage = Uint8Array.from(Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAQf/2gAMAwEAAhADEAAAAe//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AT//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AT//2Q==', 'base64'));

function jpeg(width, height) {
  return Uint8Array.from([
    0xff,0xd8, 0xff,0xc0,0x00,0x11,0x08, (height>>8)&255,height&255, (width>>8)&255,width&255,0x03,
    0x01,0x11,0x00, 0x02,0x11,0x00, 0x03,0x11,0x00, 0xff,0xd9,
  ]);
}

test('sets bounded image-to-PDF limits', () => {
  assert.deepEqual(engine.IMAGE_PDF_LIMITS, {
    maxFiles: 20, maxFileBytes: 16 * 1024 * 1024, maxTotalBytes: 40 * 1024 * 1024,
    maxPixelsPerImage: 12_000_000, maxTotalPixels: 40_000_000,
    maxOutputBytes: 60 * 1024 * 1024, taskTimeoutMs: 45_000, marginPoints: 36,
    pageWidthPoints: 595.28, pageHeightPoints: 841.89,
  });
});

test('validates image file counts, bytes and cumulative pixel budget', () => {
  const { IMAGE_PDF_LIMITS: l } = engine;
  assert.deepEqual(engine.validateImageFileList([{size: 10,pixels:100}]), {fileCount:1,totalBytes:10,totalPixels:100});
  assert.throws(() => engine.validateImageFileList([]), {code:'NO_FILES'});
  assert.throws(() => engine.validateImageFileList(Array(l.maxFiles+1).fill({size:1,pixels:1})), {code:'FILE_COUNT_LIMIT'});
  assert.throws(() => engine.validateImageFileList([{size:l.maxFileBytes+1,pixels:1}]), {code:'FILE_SIZE_LIMIT'});
  assert.throws(() => engine.validateImageFileList([{size:15*1024*1024,pixels:1},{size:15*1024*1024,pixels:1},{size:10*1024*1024,pixels:1},{size:1,pixels:1}]), {code:'TOTAL_SIZE_LIMIT'});
  assert.throws(() => engine.validateImageFileList([{size:0,pixels:1}]), {code:'FILE_EMPTY'});
  assert.throws(() => engine.validateImageFileList([{size:1,pixels:l.maxPixelsPerImage+1}]), {code:'PIXEL_LIMIT'});
  assert.throws(() => engine.validateImageFileList(Array.from({length:5},()=>({size:1,pixels:10_000_000}))), {code:'TOTAL_PIXEL_LIMIT'});
});

test('detects dimensions from PNG IHDR and JPEG SOF segments', () => {
  assert.deepEqual(engine.inspectImage(png1x1), {type:'png',width:1,height:1,pixels:1});
  assert.deepEqual(engine.inspectImage(jpegImage), {type:'jpeg',width:1,height:1,pixels:1});
  assert.deepEqual(engine.inspectImage(jpeg(400,300)), {type:'jpeg',width:400,height:300,pixels:120000});
  assert.throws(() => engine.inspectImage(new TextEncoder().encode('private-marker')), {code:'INVALID_IMAGE'});
  assert.throws(() => engine.inspectImage(jpeg(0,10)), {code:'INVALID_IMAGE'});
  const badCrc=png1x1.slice();badCrc[29]^=1;assert.throws(()=>engine.inspectImage(badCrc),{code:'INVALID_IMAGE'});
  const badHeaderLength=png1x1.slice();badHeaderLength[11]=12;assert.throws(()=>engine.inspectImage(badHeaderLength),{code:'INVALID_IMAGE'});
});

test('converts PNG and JPEG bytes into an ordered readable A4 PDF', async () => {
  const images=[png1x1,jpegImage];
  const result=await engine.createPdfFromImages(images,PDFLib);
  assert.equal(result.fileCount,2);
  assert.equal(result.pageCount,2);
  assert.ok(result.bytes instanceof Uint8Array);
  assert.equal(engine.hasPdfHeader(result.bytes),true);
  const doc=await PDFLib.PDFDocument.load(result.bytes);
  assert.equal(doc.getPageCount(),2);
  assert.deepEqual(doc.getPages().map(p=>p.getSize()),[
    {width:595.28,height:841.89},{width:595.28,height:841.89},
  ]);
});

test('chooses landscape A4 and fits a wide image without distortion', async () => {
  let pageSize; let drawn;
  const fakeLibrary={PDFDocument:{create:async()=>({embedJpg:async()=>({width:400,height:300}),addPage:size=>{pageSize=size;return {drawImage:(_image,options)=>{drawn=options;}};},save:async()=>new TextEncoder().encode('%PDF-1.7')})}};
  const result=await engine.createPdfFromImages([jpeg(400,300)],fakeLibrary);
  assert.deepEqual(pageSize,[841.89,595.28]);
  assert.ok(Math.abs(drawn.width/drawn.height-400/300)<1e-12);
  assert.equal(result.pageCount,1);
});

test('rejects non-image, malformed, oversized, and excessive output safely', async () => {
  await assert.rejects(engine.createPdfFromImages([new TextEncoder().encode('private-marker')],PDFLib),{code:'INVALID_IMAGE'});
  assert.throws(()=>engine.assertOutputSize(new Uint8Array(11),10),{code:'OUTPUT_SIZE_LIMIT'});
  assert.doesNotThrow(()=>engine.assertOutputSize(new Uint8Array(10),10));
});

test('never echoes image bytes or file names in safe errors', () => {
  const err=engine.imagePdfError('INVALID_IMAGE');
  assert.doesNotMatch(err.message,/private-marker|secret\.png/);
  assert.equal(engine.classifyImagePdfError(new Error('private-marker')),'PROCESSING_FAILED');
});
