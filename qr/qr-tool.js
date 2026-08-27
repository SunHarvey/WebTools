'use strict';

const qrFactory = typeof module !== 'undefined' && module.exports
  ? require('./vendor/qrcode-generator-1.4.4.js')
  : globalThis.qrcode;

const QR_MESSAGES = {
  failed: { en: 'QR generation failed', zh: '二维码生成失败' },
};

function qrMessage(key, language, parameters = {}) {
  const locale = String(language).toLowerCase().startsWith('zh') ? 'zh' : 'en';
  if (key === 'generated') return locale === 'zh'
    ? `${parameters.size}×${parameters.size} 个模块 · 已在本地生成`
    : `${parameters.size}×${parameters.size} modules · Generated locally`;
  return QR_MESSAGES[key][locale];
}

function normalizeHex(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/u.test(text)) return `#${[...text.slice(1)].map(char => char + char).join('')}`;
  if (/^#[0-9a-f]{6}$/u.test(text)) return text;
  throw new TypeError('Color must be a 3- or 6-digit hex value.');
}

function normalizeQrOptions(options = {}) {
  const size = Number(options.size ?? 320);
  const margin = Number(options.margin ?? 4);
  const level = String(options.level ?? 'M').toUpperCase();
  if (!Number.isInteger(size) || size < 128 || size > 1024) throw new RangeError('QR size must be 128–1024 pixels.');
  if (!Number.isInteger(margin) || margin < 4 || margin > 16) throw new RangeError('Margin must be 4–16 modules.');
  if (!['L', 'M', 'Q', 'H'].includes(level)) throw new RangeError('Correction level must be L, M, Q or H.');
  return {
    size,
    margin,
    level,
    dark: normalizeHex(options.dark ?? '#000000'),
    light: normalizeHex(options.light ?? '#ffffff'),
  };
}

function escapeWifi(value) {
  return String(value ?? '').replace(/([\\;,:"])/gu, '\\$1');
}

function buildWifiPayload({ ssid, password = '', security = 'WPA', hidden = false } = {}) {
  const network = String(ssid ?? '');
  const type = String(security).toUpperCase();
  if (!network.trim()) throw new TypeError('Wi-Fi network name is required.');
  if (!['WPA', 'WEP', 'NOPASS'].includes(type)) throw new RangeError('Unsupported Wi-Fi security type.');
  const outputType = type === 'NOPASS' ? 'nopass' : type;
  return `WIFI:T:${outputType};S:${escapeWifi(network)};P:${type === 'NOPASS' ? '' : escapeWifi(password)};H:${Boolean(hidden)};;`;
}

function createQrMatrix(content, level = 'M') {
  const value = String(content ?? '');
  if (!value.trim()) throw new TypeError('QR content is required.');
  const normalizedLevel = String(level).toUpperCase();
  if (!['L', 'M', 'Q', 'H'].includes(normalizedLevel)) throw new RangeError('Correction level must be L, M, Q or H.');
  try {
    const qr = qrFactory(0, normalizedLevel);
    qr.addData(value, 'Byte');
    qr.make();
    const size = qr.getModuleCount();
    const modules = Array.from({ length: size }, (_, row) =>
      Array.from({ length: size }, (_, column) => qr.isDark(row, column)));
    return { size, modules };
  } catch (error) {
    throw new RangeError(`QR content exceeds capacity: ${String(error)}`);
  }
}

function calculateQrLayout(matrixSize, canvasSize, margin) {
  const totalModules = Number(matrixSize) + Number(margin) * 2;
  if (!Number.isInteger(matrixSize) || matrixSize <= 0 || !Number.isInteger(canvasSize) || canvasSize <= 0 ||
      !Number.isInteger(margin) || margin < 4 || totalModules > canvasSize) {
    throw new RangeError('QR image size is too small for the matrix and quiet zone.');
  }
  const moduleSize = Math.floor(canvasSize / totalModules);
  const drawnSize = moduleSize * totalModules;
  return { moduleSize, drawnSize, offset: Math.floor((canvasSize - drawnSize) / 2) };
}

function renderQrToCanvas(canvas, matrix, options) {
  const normalized = normalizeQrOptions(options);
  const { moduleSize, offset } = calculateQrLayout(matrix.size, normalized.size, normalized.margin);
  canvas.width = normalized.size;
  canvas.height = normalized.size;
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = false;
  context.fillStyle = normalized.light;
  context.fillRect(0, 0, normalized.size, normalized.size);
  context.fillStyle = normalized.dark;
  matrix.modules.forEach((row, y) => row.forEach((dark, x) => {
    if (dark) context.fillRect(
      offset + (x + normalized.margin) * moduleSize,
      offset + (y + normalized.margin) * moduleSize,
      moduleSize,
      moduleSize,
    );
  }));
}

function attachQrTool() {
  const language = document.documentElement.lang;
  const ids = ['qrMode', 'qrContent', 'wifiFields', 'wifiSsid', 'wifiPassword', 'wifiSecurity', 'wifiHidden', 'qrSize', 'qrLevel', 'qrMargin', 'qrDark', 'qrLight', 'generateQr', 'downloadQr', 'qrCanvas', 'qrStatus'];
  const elements = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  if (Object.values(elements).some(value => !value)) return;

  const syncMode = () => {
    const wifi = elements.qrMode.value === 'wifi';
    elements.wifiFields.hidden = !wifi;
    elements.qrContent.closest('.field').hidden = wifi;
  };

  const generate = () => {
    elements.qrStatus.dataset.state = '';
    try {
      const options = normalizeQrOptions({
        size: elements.qrSize.value,
        level: elements.qrLevel.value,
        margin: elements.qrMargin.value,
        dark: elements.qrDark.value,
        light: elements.qrLight.value,
      });
      const content = elements.qrMode.value === 'wifi'
        ? buildWifiPayload({
          ssid: elements.wifiSsid.value,
          password: elements.wifiPassword.value,
          security: elements.wifiSecurity.value,
          hidden: elements.wifiHidden.checked,
        })
        : elements.qrContent.value;
      const matrix = createQrMatrix(content, options.level);
      renderQrToCanvas(elements.qrCanvas, matrix, options);
      elements.downloadQr.disabled = false;
      elements.qrStatus.textContent = qrMessage('generated', language, { size: matrix.size });
      elements.qrStatus.dataset.state = 'success';
    } catch (error) {
      elements.downloadQr.disabled = true;
      elements.qrStatus.textContent = String(language).toLowerCase().startsWith('zh') ? qrMessage('failed', language) : (error instanceof Error ? error.message : qrMessage('failed', language));
      elements.qrStatus.dataset.state = 'error';
    }
  };

  elements.qrMode.addEventListener('change', syncMode);
  elements.generateQr.addEventListener('click', generate);
  elements.downloadQr.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'webtools-qr-code.png';
    link.href = elements.qrCanvas.toDataURL('image/png');
    link.click();
  });
  syncMode();
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', attachQrTool);
if (typeof module !== 'undefined' && module.exports) module.exports = { normalizeQrOptions, buildWifiPayload, createQrMatrix, calculateQrLayout, renderQrToCanvas, qrMessage };
