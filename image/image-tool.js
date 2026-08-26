'use strict';

const MAX_DIMENSION = 8192;
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_PIXEL_COUNT = 12_000_000;
const INPUT_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const OUTPUT_MIME_TYPES = new Map([
  ['png', 'image/png'],
  ['image/png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['image/jpg', 'image/jpeg'],
  ['image/jpeg', 'image/jpeg'],
  ['webp', 'image/webp'],
  ['image/webp', 'image/webp'],
]);

function normalizeOutputMime(value) {
  const mime = OUTPUT_MIME_TYPES.get(String(value).trim().toLowerCase());
  if (!mime) throw new RangeError('Unsupported output format.');
  return mime;
}

function formatFileSize(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  if (size < 1024) return `${Math.round(size)} B`;
  const units = ['KiB', 'MiB', 'GiB'];
  let value = size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = value >= 10 || Number.isInteger(value) ? 0 : 1;
  return `${value.toFixed(digits).replace(/\.0$/, '')} ${units[unitIndex]}`;
}

function validateImageInput(file) {
  if (!file || !INPUT_MIME_TYPES.has(String(file.type).toLowerCase())) {
    throw new TypeError('Choose a PNG, JPEG, or WebP image. SVG and GIF are not supported.');
  }
  const size = Number(file.size);
  if (!Number.isFinite(size) || size < 0) throw new TypeError('The file size is invalid.');
  if (size > MAX_FILE_BYTES) throw new RangeError('Images larger than 16 MiB are not supported.');
}

function validatePixelCount(width, height) {
  const pixels = Number(width) * Number(height);
  if (!Number.isFinite(pixels) || width <= 0 || height <= 0) throw new RangeError('Image dimensions are invalid.');
  if (pixels > MAX_PIXEL_COUNT) throw new RangeError('Images larger than 12 megapixels are not supported.');
}

function hasBytes(bytes, expected, offset = 0) {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function parsePngDimensions(bytes) {
  if (bytes.length < 24 || !hasBytes(bytes, [0, 0, 0, 13, 73, 72, 68, 82], 8)) {
    throw new TypeError('The PNG header is malformed.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function parseJpegDimensions(bytes) {
  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) throw new TypeError('The JPEG header is malformed.');
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda || offset + 1 >= bytes.length) break;
    const segmentLength = bytes[offset] * 256 + bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    if (startOfFrameMarkers.has(marker)) {
      if (segmentLength < 7) break;
      return {
        width: bytes[offset + 5] * 256 + bytes[offset + 6],
        height: bytes[offset + 3] * 256 + bytes[offset + 4],
      };
    }
    offset += segmentLength;
  }
  throw new TypeError('The JPEG header is malformed or its dimensions are unavailable.');
}

function readUint24LE(bytes, offset) {
  return bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536;
}

function readUint32LE(bytes, offset) {
  return bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536 + bytes[offset + 3] * 16777216;
}

function parseWebpDimensions(bytes, fileLength = bytes.length) {
  if (bytes.length < 20 || !hasBytes(bytes, [82, 73, 70, 70]) || !hasBytes(bytes, [87, 69, 66, 80], 8)) {
    throw new TypeError('The WebP header is malformed.');
  }
  const riffSize = readUint32LE(bytes, 4);
  const chunkSize = readUint32LE(bytes, 16);
  const chunk = String.fromCharCode(...bytes.subarray(12, 16));
  const minimumChunkSizes = { VP8X: 10, VP8L: 5, 'VP8 ': 10 };
  const minimumChunkSize = minimumChunkSizes[chunk] ?? Infinity;
  const paddedChunkEnd = 20 + chunkSize + (chunkSize % 2);
  const invalidFixedSize = chunk === 'VP8X' && chunkSize !== 10;
  const invalidPadding = chunkSize % 2 === 1 && bytes[20 + chunkSize] !== 0;
  if (riffSize + 8 !== fileLength || chunkSize < minimumChunkSize || invalidFixedSize ||
      paddedChunkEnd > fileLength || invalidPadding) {
    throw new TypeError('The WebP header is malformed.');
  }
  if (chunk === 'VP8X' && bytes.length >= 30) {
    return { width: readUint24LE(bytes, 24) + 1, height: readUint24LE(bytes, 27) + 1 };
  }
  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8 ' && bytes.length >= 30 && hasBytes(bytes, [0x9d, 0x01, 0x2a], 23)) {
    return {
      width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
      height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
    };
  }
  throw new TypeError('The WebP header is malformed or unsupported.');
}

async function inspectImageFileHeader(file) {
  validateImageInput(file);
  if (typeof file.slice !== 'function') throw new TypeError('The image file cannot be read.');
  const bytes = new Uint8Array(await file.slice(0, file.size).arrayBuffer());
  let detectedMime;
  let dimensions;
  if (hasBytes(bytes, [137, 80, 78, 71, 13, 10, 26, 10])) {
    detectedMime = 'image/png';
    dimensions = parsePngDimensions(bytes);
  } else if (hasBytes(bytes, [255, 216])) {
    detectedMime = 'image/jpeg';
    dimensions = parseJpegDimensions(bytes);
  } else if (hasBytes(bytes, [82, 73, 70, 70]) && hasBytes(bytes, [87, 69, 66, 80], 8)) {
    detectedMime = 'image/webp';
    dimensions = parseWebpDimensions(bytes, file.size);
  } else {
    throw new TypeError('The image signature is missing or unsupported.');
  }
  if (String(file.type).toLowerCase() !== detectedMime) {
    throw new TypeError('The declared MIME type does not match the image signature.');
  }
  validatePixelCount(dimensions.width, dimensions.height);
  return { mime: detectedMime, ...dimensions };
}

function createLatestTaskRunner({ onStart = () => {}, onSuccess = () => {}, onError = () => {} } = {}) {
  let latestTask = 0;
  const run = async operation => {
    const task = ++latestTask;
    onStart();
    try {
      const value = await operation();
      if (task === latestTask) onSuccess(value);
      return value;
    } catch (error) {
      if (task === latestTask) onError(error);
      return undefined;
    }
  };
  run.cancel = () => { latestTask += 1; };
  return run;
}

function toDimension(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.min(MAX_DIMENSION, Math.max(1, Math.round(number)));
}

function normalizeQuality(value, fallback = 80) {
  const parsed = Number(value);
  const percent = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(100, Math.max(0, percent)) / 100;
}

function calculateTargetDimensions(sourceWidth, sourceHeight, requestedWidth, requestedHeight, keepAspectRatio = true, preventUpscale = true) {
  const sourceW = Number(sourceWidth);
  const sourceH = Number(sourceHeight);
  if (!Number.isFinite(sourceW) || !Number.isFinite(sourceH) || sourceW <= 0 || sourceH <= 0) {
    throw new RangeError('Source dimensions must be positive finite numbers.');
  }

  const targetW = toDimension(requestedWidth);
  const targetH = toDimension(requestedHeight);
  if (!keepAspectRatio) {
    return {
      width: preventUpscale ? Math.min(targetW, Math.round(sourceW)) : targetW,
      height: preventUpscale ? Math.min(targetH, Math.round(sourceH)) : targetH,
    };
  }

  let scale = Math.min(targetW / sourceW, targetH / sourceH);
  if (preventUpscale) scale = Math.min(1, scale);
  return {
    width: toDimension(sourceW * scale),
    height: toDimension(sourceH * scale),
  };
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('This browser could not export the image.')), mime, quality);
  });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The selected image could not be decoded.'));
    image.src = url;
  });
}

function attachImageTool() {
  const fileInput = document.getElementById('imageFile');
  const originalPreview = document.getElementById('originalPreview');
  const resultPreview = document.getElementById('resultPreview');
  const widthInput = document.getElementById('targetWidth');
  const heightInput = document.getElementById('targetHeight');
  const keepAspect = document.getElementById('keepAspect');
  const preventUpscale = document.getElementById('preventUpscale');
  const outputFormat = document.getElementById('outputFormat');
  const qualityInput = document.getElementById('quality');
  const qualityValue = document.getElementById('qualityValue');
  const qualityField = document.getElementById('qualityField');
  const compressButton = document.getElementById('compressButton');
  const downloadLink = document.getElementById('downloadLink');
  const originalInfo = document.getElementById('originalInfo');
  const resultInfo = document.getElementById('resultInfo');
  const status = document.getElementById('imageStatus');
  if (!fileInput || !originalPreview || !resultPreview || !widthInput || !heightInput || !compressButton) return;

  let sourceImage = null;
  let sourceFile = null;
  let originalUrl = '';
  let resultUrl = '';
  let selectionId = 0;

  const revoke = url => { if (url) URL.revokeObjectURL(url); };
  const showStatus = (message, state = '') => { status.textContent = message; status.dataset.state = state; };
  const clearResult = () => {
    revoke(resultUrl);
    resultUrl = '';
    resultPreview.removeAttribute('src');
    resultPreview.hidden = true;
    resultInfo.textContent = 'No result yet · 尚无结果';
    downloadLink.hidden = true;
    downloadLink.removeAttribute('href');
  };
  const extensionFor = mime => ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' })[mime];

  const runCompression = createLatestTaskRunner({
    onStart: () => { compressButton.disabled = true; showStatus('Processing locally… · 正在本地处理…'); },
    onSuccess: ({ blob, dimensions, mime }) => {
      revoke(resultUrl);
      resultUrl = URL.createObjectURL(blob);
      resultPreview.src = resultUrl;
      resultPreview.hidden = false;
      resultInfo.textContent = `${dimensions.width} × ${dimensions.height} · ${formatFileSize(blob.size)} (${sourceFile ? `${Math.round((1 - blob.size / sourceFile.size) * 100)}%` : '—'})`;
      const baseName = sourceFile.name.replace(/\.[^.]*$/, '') || 'image';
      downloadLink.href = resultUrl;
      downloadLink.download = `${baseName}-optimized.${extensionFor(mime)}`;
      downloadLink.hidden = false;
      compressButton.disabled = false;
      showStatus('Done — ready to download · 完成，可下载', 'success');
    },
    onError: error => {
      compressButton.disabled = false;
      showStatus(`${error instanceof Error ? error.message : 'Processing failed.'} · 处理失败`, 'error');
    },
  });

  fileInput.addEventListener('change', async () => {
    const selected = fileInput.files && fileInput.files[0];
    const currentSelection = ++selectionId;
    runCompression.cancel();
    clearResult();
    revoke(originalUrl);
    originalUrl = '';
    originalPreview.removeAttribute('src');
    originalPreview.hidden = true;
    originalInfo.textContent = 'Loading locally… · 正在本地加载…';
    sourceImage = null;
    sourceFile = null;
    try {
      await inspectImageFileHeader(selected);
      if (currentSelection !== selectionId) return;
      const candidateUrl = URL.createObjectURL(selected);
      try {
        const decoded = await loadImage(candidateUrl);
        if (currentSelection !== selectionId) { revoke(candidateUrl); return; }
        validatePixelCount(decoded.naturalWidth, decoded.naturalHeight);
        revoke(originalUrl);
        originalUrl = candidateUrl;
        sourceImage = decoded;
        sourceFile = selected;
        originalPreview.src = originalUrl;
        originalPreview.hidden = false;
        widthInput.value = decoded.naturalWidth;
        heightInput.value = decoded.naturalHeight;
        originalInfo.textContent = `${decoded.naturalWidth} × ${decoded.naturalHeight} · ${formatFileSize(selected.size)}`;
        compressButton.disabled = false;
        showStatus('Image loaded locally · 图片已在本地加载', 'success');
      } catch (error) {
        revoke(candidateUrl);
        throw error;
      }
    } catch (error) {
      if (currentSelection !== selectionId) return;
      originalPreview.removeAttribute('src');
      originalPreview.hidden = true;
      originalInfo.textContent = 'No image selected · 尚未选择图片';
      compressButton.disabled = true;
      showStatus(`${error instanceof Error ? error.message : 'Invalid image.'} · 请选择有效图片`, 'error');
    }
  });

  qualityInput.addEventListener('input', () => { qualityValue.textContent = `${Math.round(Number(qualityInput.value))}%`; });
  outputFormat.addEventListener('change', () => { qualityField.hidden = outputFormat.value === 'image/png'; });

  compressButton.addEventListener('click', () => runCompression(async () => {
    if (!sourceImage || !sourceFile) throw new Error('Choose an image first.');
    const dimensions = calculateTargetDimensions(
      sourceImage.naturalWidth,
      sourceImage.naturalHeight,
      widthInput.value,
      heightInput.value,
      keepAspect.checked,
      preventUpscale.checked
    );
    validatePixelCount(dimensions.width, dimensions.height);
    widthInput.value = dimensions.width;
    heightInput.value = dimensions.height;
    const mime = normalizeOutputMime(outputFormat.value);
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext('2d', { alpha: mime !== 'image/jpeg' });
    if (!context) throw new Error('Canvas is unavailable in this browser.');
    if (mime === 'image/jpeg') { context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(sourceImage, 0, 0, dimensions.width, dimensions.height);
    const blob = await canvasToBlob(canvas, mime, normalizeQuality(qualityInput.value));
    canvas.width = 1;
    canvas.height = 1;
    return { blob, dimensions, mime };
  }));

  window.addEventListener('beforeunload', () => { selectionId += 1; revoke(originalUrl); revoke(resultUrl); });
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', attachImageTool);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateTargetDimensions,
    normalizeQuality,
    normalizeOutputMime,
    formatFileSize,
    validateImageInput,
    inspectImageFileHeader,
    validatePixelCount,
    createLatestTaskRunner,
  };
}
