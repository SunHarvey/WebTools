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

const IMAGE_MESSAGES = {
  noResult: { en: 'No result yet', zh: '尚无结果' },
  processing: { en: 'Processing locally…', zh: '正在本地处理…' },
  done: { en: 'Done — ready to download', zh: '处理完成，可以下载' },
  failed: { en: 'Processing failed.', zh: '处理失败。' },
  loading: { en: 'Loading locally…', zh: '正在本地加载…' },
  loaded: { en: 'Image loaded locally', zh: '图片已在本地加载' },
  noImage: { en: 'No image selected', zh: '尚未选择图片' },
  invalidImage: { en: 'Choose a valid image.', zh: '请选择有效图片。' },
};

function imageMessage(key, language) {
  const locale = String(language).toLowerCase().startsWith('zh') ? 'zh' : 'en';
  return IMAGE_MESSAGES[key][locale];
}

function imageSelectedFileName(file, language) {
  return file?.name || imageMessage('noImage', language);
}

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

function normalizeImageSettings(settings = {}) {
  const targetKilobytes = Number(settings.targetSizeKb);
  return Object.freeze({
    targetWidth: String(settings.targetWidth ?? ''),
    targetHeight: String(settings.targetHeight ?? ''),
    keepAspect: Boolean(settings.keepAspect),
    preventUpscale: Boolean(settings.preventUpscale),
    outputMime: normalizeOutputMime(settings.outputFormat),
    quality: normalizeQuality(settings.quality),
    targetBytes: Number.isFinite(targetKilobytes) && targetKilobytes > 0 ? targetKilobytes * 1024 : 0,
  });
}

function calculateReduction(originalBytes, outputBytes) {
  const original = Number(originalBytes);
  const output = Number(outputBytes);
  if (!Number.isFinite(original) || original <= 0 || !Number.isFinite(output)) return 0;
  return Math.max(0, Math.round((1 - output / original) * 1000) / 10);
}

function extractImageFiles(items) {
  return Array.from(items || [], item => item?.kind === 'file' && typeof item.getAsFile === 'function' ? item.getAsFile() : item)
    .filter(file => file && String(file.type).toLowerCase().startsWith('image/'));
}

async function encodeToTargetSize(encode, targetBytes, { iterations = 8, minQuality = 0.05, maxQuality = 1 } = {}) {
  if (typeof encode !== 'function') throw new TypeError('An encoder function is required.');
  const target = Number(targetBytes);
  if (!Number.isFinite(target) || target <= 0) throw new RangeError('Target size must be positive.');
  let low = minQuality;
  let high = maxQuality;
  let smallest = await encode(low);
  let best = smallest.size <= target ? smallest : null;
  for (let attempt = 0; attempt < iterations; attempt += 1) {
    const quality = (low + high) / 2;
    const result = await encode(quality);
    if (result.size <= target) { best = result; low = quality; }
    else high = quality;
  }
  return best || smallest;
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
  const language = document.documentElement.lang;
  const zh = String(language).toLowerCase().startsWith('zh');
  const fileInput = document.getElementById('imageFile');
  const dropZone = document.getElementById('imageDropZone');
  const fileName = document.getElementById('imageFileName');
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
  const targetSize = document.getElementById('targetSizeKb');
  const compressButton = document.getElementById('compressButton');
  const downloadLink = document.getElementById('downloadLink');
  const downloadAll = document.getElementById('downloadAllImages');
  const batchResults = document.getElementById('imageBatchResults');
  const originalInfo = document.getElementById('originalInfo');
  const resultInfo = document.getElementById('resultInfo');
  const status = document.getElementById('imageStatus');
  if (!fileInput || !dropZone || !batchResults || !widthInput || !heightInput || !compressButton) return;

  let sourceFiles = [];
  let previewUrl = '';
  let outputResults = [];
  let selectionGeneration = 0;
  let compressionGeneration = 0;
  let downloadTimers = [];
  const revoke = url => { if (url) URL.revokeObjectURL(url); };
  const showStatus = (message, state = '') => { status.textContent = message; status.dataset.state = state; };
  const cancelPendingDownloads = () => {
    downloadTimers.forEach(clearTimeout);
    downloadTimers = [];
  };
  const clearOutputs = () => {
    cancelPendingDownloads();
    outputResults.forEach(result => revoke(result.url));
    outputResults = [];
    batchResults.replaceChildren();
    resultPreview.hidden = true;
    resultPreview.removeAttribute('src');
    resultInfo.textContent = imageMessage('noResult', language);
    downloadLink.hidden = true;
    downloadAll.hidden = true;
  };
  const extensionFor = mime => ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' })[mime];

  async function decodeFile(file) {
    await inspectImageFileHeader(file);
    const url = URL.createObjectURL(file);
    try {
      const image = await loadImage(url);
      validatePixelCount(image.naturalWidth, image.naturalHeight);
      return { image, url };
    } catch (error) { revoke(url); throw error; }
  }

  async function selectFiles(files) {
    const selection = ++selectionGeneration;
    compressionGeneration += 1;
    sourceFiles = [];
    compressButton.disabled = true;
    clearOutputs();
    revoke(previewUrl);
    previewUrl = '';
    originalPreview.hidden = true;
    originalPreview.removeAttribute('src');
    originalInfo.textContent = imageMessage('noImage', language);
    fileName.textContent = imageMessage('noImage', language);
    const candidates = Array.from(files || []).filter(file => file && String(file.type).startsWith('image/'));
    if (!candidates.length) {
      showStatus(imageMessage('invalidImage', language), 'error');
      return;
    }
    showStatus(imageMessage('loading', language));
    let decoded;
    try {
      await Promise.all(candidates.map(inspectImageFileHeader));
      if (selection !== selectionGeneration) return;
      decoded = await decodeFile(candidates[0]);
      if (selection !== selectionGeneration) { revoke(decoded.url); return; }
      sourceFiles = candidates;
      previewUrl = decoded.url;
      originalPreview.src = previewUrl;
      originalPreview.hidden = false;
      widthInput.value = decoded.image.naturalWidth;
      heightInput.value = decoded.image.naturalHeight;
      originalInfo.textContent = `${decoded.image.naturalWidth} × ${decoded.image.naturalHeight} · ${formatFileSize(candidates[0].size)}`;
      fileName.textContent = candidates.length === 1 ? candidates[0].name : (zh ? `已选择 ${candidates.length} 张图片` : `${candidates.length} images selected`);
      compressButton.disabled = false;
      showStatus(imageMessage('loaded', language), 'success');
    } catch (error) {
      if (selection === selectionGeneration) {
        sourceFiles = [];
        compressButton.disabled = true;
        showStatus(zh ? imageMessage('invalidImage', language) : error.message, 'error');
      }
    }
  }

  async function processFile(file, settings) {
    const decoded = await decodeFile(file);
    try {
      const dimensions = calculateTargetDimensions(decoded.image.naturalWidth, decoded.image.naturalHeight, settings.targetWidth, settings.targetHeight, settings.keepAspect, settings.preventUpscale);
      validatePixelCount(dimensions.width, dimensions.height);
      const mime = settings.outputMime;
      const canvas = document.createElement('canvas');
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      const context = canvas.getContext('2d', { alpha: mime !== 'image/jpeg' });
      if (!context) throw new Error('Canvas is unavailable in this browser.');
      if (mime === 'image/jpeg') { context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); }
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(decoded.image, 0, 0, dimensions.width, dimensions.height);
      const encode = async quality => {
        const blob = await canvasToBlob(canvas, mime, quality);
        return { blob, size: blob.size, quality };
      };
      const encoded = settings.targetBytes > 0 && mime !== 'image/png'
        ? await encodeToTargetSize(encode, settings.targetBytes)
        : await encode(settings.quality);
      canvas.width = 1; canvas.height = 1;
      const baseName = file.name.replace(/\.[^.]*$/, '') || 'image';
      return { file, blob: encoded.blob, dimensions, mime, name: `${baseName}-optimized.${extensionFor(mime)}` };
    } finally { revoke(decoded.url); }
  }

  function renderBatch(results) {
    batchResults.replaceChildren();
    results.forEach(result => {
      const row = document.createElement('article');
      row.className = 'image-batch-row';
      const summary = document.createElement('div');
      summary.textContent = `${result.file.name} · ${formatFileSize(result.file.size)} → ${formatFileSize(result.blob.size)} · ${calculateReduction(result.file.size, result.blob.size)}% ${zh ? '节省' : 'saved'}`;
      const link = document.createElement('a');
      link.className = 'button-link secondary';
      link.href = result.url;
      link.download = result.name;
      link.textContent = zh ? '下载' : 'Download';
      row.append(summary, link);
      batchResults.appendChild(row);
    });
  }

  fileInput.addEventListener('change', () => selectFiles(fileInput.files));
  dropZone.addEventListener('dragover', event => { event.preventDefault(); dropZone.classList.add('is-dragging'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('is-dragging'));
  dropZone.addEventListener('drop', event => { event.preventDefault(); dropZone.classList.remove('is-dragging'); selectFiles(event.dataTransfer?.files); });
  document.addEventListener('paste', event => {
    const files = extractImageFiles(event.clipboardData?.items);
    if (files.length) { event.preventDefault(); selectFiles(files); }
  });
  qualityInput.addEventListener('input', () => { qualityValue.textContent = `${Math.round(Number(qualityInput.value))}%`; });
  outputFormat.addEventListener('change', () => { qualityField.hidden = outputFormat.value === 'image/png'; });
  const invalidateCompression = () => {
    compressionGeneration += 1;
    clearOutputs();
    if (sourceFiles.length) {
      compressButton.disabled = false;
      showStatus(imageMessage('loaded', language), 'success');
    }
  };
  [widthInput, heightInput, qualityInput, targetSize]
    .forEach(control => control.addEventListener('input', invalidateCompression));
  [keepAspect, preventUpscale, outputFormat]
    .forEach(control => control.addEventListener('change', invalidateCompression));
  compressButton.addEventListener('click', async () => {
    if (!sourceFiles.length) return;
    const compression = ++compressionGeneration;
    const files = [...sourceFiles];
    const settings = normalizeImageSettings({
      targetWidth: widthInput.value,
      targetHeight: heightInput.value,
      keepAspect: keepAspect.checked,
      preventUpscale: preventUpscale.checked,
      outputFormat: outputFormat.value,
      quality: qualityInput.value,
      targetSizeKb: targetSize.value,
    });
    compressButton.disabled = true;
    clearOutputs();
    showStatus(imageMessage('processing', language));
    try {
      const processed = [];
      for (const file of files) {
        const result = await processFile(file, settings);
        if (compression !== compressionGeneration) return;
        processed.push(result);
      }
      if (compression !== compressionGeneration) return;
      outputResults = processed.map(result => ({ ...result, url: URL.createObjectURL(result.blob) }));
      renderBatch(outputResults);
      const first = outputResults[0];
      resultPreview.src = first.url;
      resultPreview.hidden = false;
      resultInfo.textContent = `${first.dimensions.width} × ${first.dimensions.height} · ${formatFileSize(first.blob.size)} (${calculateReduction(first.file.size, first.blob.size)}% ${zh ? '节省' : 'saved'})`;
      downloadLink.href = first.url;
      downloadLink.download = first.name;
      downloadLink.hidden = outputResults.length !== 1;
      downloadAll.hidden = outputResults.length < 2;
      showStatus(imageMessage('done', language), 'success');
    } catch (error) {
      if (compression === compressionGeneration) showStatus(zh ? imageMessage('failed', language) : error.message, 'error');
    } finally {
      if (compression === compressionGeneration) compressButton.disabled = false;
    }
  });
  downloadAll.addEventListener('click', () => {
    cancelPendingDownloads();
    [...outputResults].forEach((result, index) => {
      const timer = setTimeout(() => {
        const anchor = document.createElement('a'); anchor.href = result.url; anchor.download = result.name; anchor.click();
      }, index * 150);
      downloadTimers.push(timer);
    });
  });
  window.addEventListener('beforeunload', () => { cancelPendingDownloads(); revoke(previewUrl); outputResults.forEach(result => revoke(result.url)); });
}
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', attachImageTool);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateTargetDimensions,
    normalizeQuality,
    normalizeImageSettings,
    normalizeOutputMime,
    formatFileSize,
    validateImageInput,
    inspectImageFileHeader,
    validatePixelCount,
    createLatestTaskRunner,
    imageMessage,
    imageSelectedFileName,
    extractImageFiles,
    encodeToTargetSize,
    calculateReduction,
  };
}
