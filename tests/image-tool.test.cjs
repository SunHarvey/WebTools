'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const imageTool = require('../image/image-tool.js');

function imageBlob(bytes, type) {
  return new Blob([Uint8Array.from(bytes)], { type });
}

function pngHeader(width, height) {
  const bytes = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82];
  for (const value of [width, height]) bytes.push((value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255);
  return bytes;
}

function jpegHeader(width, height) {
  return [255, 216, 255, 192, 0, 17, 8, (height >>> 8) & 255, height & 255, (width >>> 8) & 255, width & 255, 3, 1, 17, 0, 2, 17, 0, 3, 17, 0];
}

function jpegHeaderAfterLargeAppSegments(width, height) {
  const bytes = [255, 216];
  for (let index = 0; index < 5; index += 1) {
    bytes.push(255, 224, 255, 255, ...new Array(65533).fill(0));
  }
  bytes.push(...jpegHeader(width, height).slice(2));
  return bytes;
}

function webpVp8xHeader(width, height) {
  const w = width - 1;
  const h = height - 1;
  return [82, 73, 70, 70, 22, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 88, 10, 0, 0, 0, 0, 0, 0, 0,
    w & 255, (w >>> 8) & 255, (w >>> 16) & 255, h & 255, (h >>> 8) & 255, (h >>> 16) & 255];
}

function webpVp8lHeader(width, height, padding = 0) {
  const bits = (width - 1) | ((height - 1) << 14);
  return [82, 73, 70, 70, 18, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 76, 5, 0, 0, 0,
    0x2f, bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, (bits >>> 24) & 255, padding];
}

test('calculates proportional target dimensions inside the requested box', () => {
  assert.deepEqual(
    imageTool.calculateTargetDimensions(4000, 2000, 1000, 1000, true, false),
    { width: 1000, height: 500 }
  );
});

test('target dimensions can be changed independently', () => {
  assert.deepEqual(
    imageTool.calculateTargetDimensions(4000, 2000, 800, 600, false, false),
    { width: 800, height: 600 }
  );
});

test('target dimensions never upscale when prevention is enabled', () => {
  assert.deepEqual(
    imageTool.calculateTargetDimensions(640, 480, 2000, 2000, true, true),
    { width: 640, height: 480 }
  );
  assert.deepEqual(
    imageTool.calculateTargetDimensions(640, 480, 900, 300, false, true),
    { width: 640, height: 300 }
  );
});

test('target dimensions are finite integers clamped to 1..8192', () => {
  assert.deepEqual(
    imageTool.calculateTargetDimensions(10000, 10000, 0, 99999, false, false),
    { width: 1, height: 8192 }
  );
  assert.deepEqual(
    imageTool.calculateTargetDimensions(100, 50, 1.9, 1.9, false, false),
    { width: 2, height: 2 }
  );
  assert.throws(
    () => imageTool.calculateTargetDimensions(0, 100, 10, 10),
    /source dimensions/i
  );
});

test('normalizes quality percentages to a browser encoder fraction', () => {
  assert.equal(imageTool.normalizeQuality(80), 0.8);
  assert.equal(imageTool.normalizeQuality('55'), 0.55);
  assert.equal(imageTool.normalizeQuality(0), 0);
  assert.equal(imageTool.normalizeQuality(-20), 0);
  assert.equal(imageTool.normalizeQuality(101), 1);
  assert.equal(imageTool.normalizeQuality('not a number'), 0.8);
});

test('accepts only PNG, JPEG and WebP output MIME types', () => {
  assert.equal(imageTool.normalizeOutputMime('image/png'), 'image/png');
  assert.equal(imageTool.normalizeOutputMime('IMAGE/JPEG'), 'image/jpeg');
  assert.equal(imageTool.normalizeOutputMime('image/jpg'), 'image/jpeg');
  assert.equal(imageTool.normalizeOutputMime('webp'), 'image/webp');
  assert.throws(() => imageTool.normalizeOutputMime('image/gif'), /output format/i);
  assert.throws(() => imageTool.normalizeOutputMime('image/svg+xml'), /output format/i);
});

test('formats byte sizes with readable binary units', () => {
  assert.equal(imageTool.formatFileSize(0), '0 B');
  assert.equal(imageTool.formatFileSize(999), '999 B');
  assert.equal(imageTool.formatFileSize(1024), '1 KiB');
  assert.equal(imageTool.formatFileSize(1536), '1.5 KiB');
  assert.equal(imageTool.formatFileSize(5 * 1024 * 1024), '5 MiB');
  assert.equal(imageTool.formatFileSize(-1), '0 B');
});

test('rejects unsupported input types and oversized images before canvas allocation', () => {
  assert.doesNotThrow(() => imageTool.validateImageInput({ type: 'image/png', size: 16 * 1024 * 1024 }));
  assert.throws(() => imageTool.validateImageInput({ type: 'image/gif', size: 100 }), /PNG, JPEG, or WebP/i);
  assert.throws(() => imageTool.validateImageInput({ type: 'image/svg+xml', size: 100 }), /PNG, JPEG, or WebP/i);
  assert.throws(() => imageTool.validateImageInput({ type: 'image/jpeg', size: 16 * 1024 * 1024 + 1 }), /16 MiB/i);
  assert.doesNotThrow(() => imageTool.validatePixelCount(4000, 3000));
  assert.throws(() => imageTool.validatePixelCount(4001, 3000), /12 megapixels/i);
});

test('reads real PNG, JPEG and WebP dimensions from file headers before decode', async () => {
  assert.deepEqual(await imageTool.inspectImageFileHeader(imageBlob(pngHeader(640, 480), 'image/png')), { mime: 'image/png', width: 640, height: 480 });
  assert.deepEqual(await imageTool.inspectImageFileHeader(imageBlob(jpegHeader(800, 600), 'image/jpeg')), { mime: 'image/jpeg', width: 800, height: 600 });
  assert.deepEqual(await imageTool.inspectImageFileHeader(imageBlob(webpVp8xHeader(320, 240), 'image/webp')), { mime: 'image/webp', width: 320, height: 240 });
});

test('finds JPEG dimensions when legal APP segments push SOF beyond 256 KiB', async () => {
  const bytes = jpegHeaderAfterLargeAppSegments(1024, 768);
  assert.ok(bytes.indexOf(0xc0, 2) > 256 * 1024);
  assert.deepEqual(
    await imageTool.inspectImageFileHeader(imageBlob(bytes, 'image/jpeg')),
    { mime: 'image/jpeg', width: 1024, height: 768 }
  );
});

test('rejects WebP files with invalid RIFF or first-chunk declarations', async () => {
  const invalidRiffSize = webpVp8xHeader(320, 240);
  invalidRiffSize.splice(4, 4, 0, 0, 0, 0);
  await assert.rejects(
    imageTool.inspectImageFileHeader(imageBlob(invalidRiffSize, 'image/webp')),
    /WebP header|malformed/i
  );

  const invalidChunkSize = webpVp8xHeader(320, 240);
  invalidChunkSize.splice(16, 4, 0, 0, 0, 0);
  await assert.rejects(
    imageTool.inspectImageFileHeader(imageBlob(invalidChunkSize, 'image/webp')),
    /WebP header|malformed/i
  );

  const oversizedVp8xChunk = webpVp8xHeader(320, 240);
  oversizedVp8xChunk.splice(4, 4, 23, 0, 0, 0);
  oversizedVp8xChunk.splice(16, 4, 11, 0, 0, 0);
  oversizedVp8xChunk.push(0);
  await assert.rejects(
    imageTool.inspectImageFileHeader(imageBlob(oversizedVp8xChunk, 'image/webp')),
    /WebP header|malformed/i
  );

  assert.deepEqual(
    await imageTool.inspectImageFileHeader(imageBlob(webpVp8lHeader(16, 8), 'image/webp')),
    { mime: 'image/webp', width: 16, height: 8 }
  );

  const missingPadding = webpVp8lHeader(16, 8).slice(0, -1);
  missingPadding.splice(4, 4, 17, 0, 0, 0);
  await assert.rejects(
    imageTool.inspectImageFileHeader(imageBlob(missingPadding, 'image/webp')),
    /WebP header|malformed/i
  );

  await assert.rejects(
    imageTool.inspectImageFileHeader(imageBlob(webpVp8lHeader(16, 8, 1), 'image/webp')),
    /WebP header|malformed/i
  );
});

test('rejects forged MIME types, malformed headers and oversized declared dimensions before decode', async () => {
  await assert.rejects(imageTool.inspectImageFileHeader(imageBlob(pngHeader(10, 10), 'image/jpeg')), /MIME|signature/i);
  await assert.rejects(imageTool.inspectImageFileHeader(imageBlob([137, 80, 78, 71, 13, 10, 26, 10], 'image/png')), /header|malformed/i);
  await assert.rejects(imageTool.inspectImageFileHeader(imageBlob(pngHeader(4001, 3000), 'image/png')), /12 megapixels/i);
});

test('enforces the same pixel ceiling at the target canvas boundary and documents limits', () => {
  const boundary = imageTool.calculateTargetDimensions(4000, 3000, 4000, 3000, false, false);
  assert.doesNotThrow(() => imageTool.validatePixelCount(boundary.width, boundary.height));
  const overLimit = imageTool.calculateTargetDimensions(4001, 3000, 4001, 3000, false, false);
  assert.throws(() => imageTool.validatePixelCount(overLimit.width, overLimit.height), /12 megapixels/i);
  const html = fs.readFileSync(path.join(__dirname, '../image/index.html'), 'utf8');
  assert.match(html, /16 MiB \/ 12 megapixels/u);
  assert.doesNotMatch(html, /25 MiB|40 megapixels/u);
});

test('applies only the newest asynchronous operation result', async () => {
  const applied = [];
  let resolveOld;
  const oldWork = new Promise(resolve => { resolveOld = resolve; });
  const run = imageTool.createLatestTaskRunner({ onSuccess: value => applied.push(value) });
  const oldTask = run(() => oldWork);
  await run(async () => 'new');
  resolveOld('old');
  await oldTask;
  assert.deepEqual(applied, ['new']);
});
