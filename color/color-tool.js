'use strict';

(function initColorTool(root) {
  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function parseHex(input) {
    const value = String(input).trim().replace(/^#/, '');
    if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) {
      throw new TypeError('HEX must contain exactly 3 or 6 hexadecimal digits.');
    }
    const expanded = value.length === 3
      ? value.split('').map((character) => character + character).join('')
      : value;

    return {
      r: Number.parseInt(expanded.slice(0, 2), 16),
      g: Number.parseInt(expanded.slice(2, 4), 16),
      b: Number.parseInt(expanded.slice(4, 6), 16),
    };
  }

  function normalizeRgb(rgb) {
    if (!rgb || typeof rgb !== 'object') throw new TypeError('RGB color is required.');
    const rawValues = [rgb.r, rgb.g, rgb.b];
    if (rawValues.some((value) => value === '' || value === null || value === undefined)) {
      throw new TypeError('RGB channels must be finite numbers.');
    }
    const values = rawValues.map(Number);
    if (values.some((value) => !Number.isFinite(value))) {
      throw new TypeError('RGB channels must be finite numbers.');
    }
    return {
      r: Math.round(clamp(values[0], 0, 255)),
      g: Math.round(clamp(values[1], 0, 255)),
      b: Math.round(clamp(values[2], 0, 255)),
    };
  }

  function rgbToHex(rgb) {
    const normalized = normalizeRgb(rgb);
    return `#${[normalized.r, normalized.g, normalized.b]
      .map((channel) => channel.toString(16).padStart(2, '0'))
      .join('').toUpperCase()}`;
  }

  function normalizeHsl(hsl) {
    if (!hsl || typeof hsl !== 'object') throw new TypeError('HSL color is required.');
    const rawValues = [hsl.h, hsl.s, hsl.l];
    if (rawValues.some((value) => value === '' || value === null || value === undefined)) {
      throw new TypeError('HSL channels must be finite numbers.');
    }
    const values = rawValues.map(Number);
    if (values.some((value) => !Number.isFinite(value))) {
      throw new TypeError('HSL channels must be finite numbers.');
    }
    return {
      h: ((values[0] % 360) + 360) % 360,
      s: clamp(values[1], 0, 100),
      l: clamp(values[2], 0, 100),
    };
  }

  function roundDisplay(value) {
    return Math.round(value * 10) / 10;
  }

  function rgbToHsl(rgb) {
    const { r, g, b } = normalizeRgb(rgb);
    const channels = [r / 255, g / 255, b / 255];
    const maximum = Math.max(...channels);
    const minimum = Math.min(...channels);
    const delta = maximum - minimum;
    const lightness = (maximum + minimum) / 2;
    let hue = 0;
    let saturation = 0;

    if (delta !== 0) {
      saturation = delta / (1 - Math.abs(2 * lightness - 1));
      if (maximum === channels[0]) hue = 60 * (((channels[1] - channels[2]) / delta) % 6);
      else if (maximum === channels[1]) hue = 60 * (((channels[2] - channels[0]) / delta) + 2);
      else hue = 60 * (((channels[0] - channels[1]) / delta) + 4);
    }

    return {
      h: roundDisplay((hue + 360) % 360),
      s: roundDisplay(saturation * 100),
      l: roundDisplay(lightness * 100),
    };
  }

  function hslToRgb(hsl) {
    const { h, s, l } = normalizeHsl(hsl);
    const saturation = s / 100;
    const lightness = l / 100;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const segment = h / 60;
    const intermediate = chroma * (1 - Math.abs((segment % 2) - 1));
    let channels;
    if (segment < 1) channels = [chroma, intermediate, 0];
    else if (segment < 2) channels = [intermediate, chroma, 0];
    else if (segment < 3) channels = [0, chroma, intermediate];
    else if (segment < 4) channels = [0, intermediate, chroma];
    else if (segment < 5) channels = [intermediate, 0, chroma];
    else channels = [chroma, 0, intermediate];
    const match = lightness - chroma / 2;
    return normalizeRgb({
      r: (channels[0] + match) * 255,
      g: (channels[1] + match) * 255,
      b: (channels[2] + match) * 255,
    });
  }

  function formatHsl(hsl) {
    const normalized = normalizeHsl(hsl);
    return `hsl(${roundDisplay(normalized.h)}, ${roundDisplay(normalized.s)}%, ${roundDisplay(normalized.l)}%)`;
  }

  function relativeLuminance(rgb) {
    const normalized = normalizeRgb(rgb);
    const linear = [normalized.r, normalized.g, normalized.b].map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  }

  function contrastRatio(first, second) {
    const luminances = [relativeLuminance(first), relativeLuminance(second)];
    return (Math.max(...luminances) + 0.05) / (Math.min(...luminances) + 0.05);
  }

  function formatContrastRatio(ratio) {
    const value = Number(ratio);
    if (!Number.isFinite(value)) throw new TypeError('WCAG contrast ratio must be finite.');
    return (Math.floor(value * 100) / 100).toFixed(2);
  }

  function getWcagCompliance(ratio) {
    const value = Number(ratio);
    if (!Number.isFinite(value) || value < 1 || value > 21) {
      throw new TypeError('WCAG contrast ratio must be between 1 and 21.');
    }
    return {
      aaNormal: value >= 4.5,
      aaLarge: value >= 3,
      aaaNormal: value >= 7,
      aaaLarge: value >= 4.5,
    };
  }

  function attachColorTool(documentRef = document, navigatorRef = navigator) {
    const ids = ['hexInput', 'rgbR', 'rgbG', 'rgbB', 'hslH', 'hslS', 'hslL', 'colorPreview', 'hexResult', 'rgbResult', 'hslResult', 'fromHex', 'fromRgb', 'fromHsl', 'copyResults', 'convertStatus', 'contrastA', 'contrastB', 'pickerA', 'pickerB', 'checkContrast', 'copyContrast', 'contrastSample', 'contrastRatio', 'aaNormal', 'aaLarge', 'aaaNormal', 'aaaLarge', 'contrastStatus'];
    const elements = Object.fromEntries(ids.map(id => [id, documentRef.getElementById(id)]));
    if (Object.values(elements).some(element => !element)) return false;

    const status = (element, message, state = '') => {
      element.textContent = message;
      element.dataset.state = state;
    };
    const renderColor = rgb => {
      const normalized = normalizeRgb(rgb);
      const hex = rgbToHex(normalized);
      const hsl = rgbToHsl(normalized);
      elements.hexInput.value = hex;
      elements.rgbR.value = normalized.r;
      elements.rgbG.value = normalized.g;
      elements.rgbB.value = normalized.b;
      elements.hslH.value = hsl.h;
      elements.hslS.value = hsl.s;
      elements.hslL.value = hsl.l;
      elements.hexResult.textContent = hex;
      elements.rgbResult.textContent = `rgb(${normalized.r}, ${normalized.g}, ${normalized.b})`;
      elements.hslResult.textContent = formatHsl(hsl);
      elements.colorPreview.style.backgroundColor = hex;
      status(elements.convertStatus, 'Converted · 转换完成', 'success');
    };
    const runColor = operation => {
      try { renderColor(operation()); }
      catch (error) { status(elements.convertStatus, error instanceof Error ? error.message : 'Invalid color', 'error'); }
    };
    const renderContrast = () => {
      try {
        const foreground = parseHex(elements.contrastA.value);
        const background = parseHex(elements.contrastB.value);
        const foregroundHex = rgbToHex(foreground);
        const backgroundHex = rgbToHex(background);
        const ratio = contrastRatio(foreground, background);
        const compliance = getWcagCompliance(ratio);
        elements.contrastA.value = foregroundHex;
        elements.contrastB.value = backgroundHex;
        elements.pickerA.value = foregroundHex.toLowerCase();
        elements.pickerB.value = backgroundHex.toLowerCase();
        elements.contrastRatio.textContent = `${formatContrastRatio(ratio)}:1`;
        for (const [key, passed] of Object.entries(compliance)) {
          elements[key].textContent = passed ? 'Pass · 通过' : 'Fail · 未通过';
          elements[key].dataset.pass = String(passed);
        }
        elements.contrastSample.style.color = foregroundHex;
        elements.contrastSample.style.backgroundColor = backgroundHex;
        status(elements.contrastStatus, 'Contrast calculated · 对比度已计算', 'success');
      } catch (error) {
        status(elements.contrastStatus, error instanceof Error ? error.message : 'Invalid color', 'error');
      }
    };
    const copy = async (text, target) => {
      try {
        if (!navigatorRef.clipboard || !navigatorRef.clipboard.writeText) throw new Error('Clipboard is unavailable.');
        await navigatorRef.clipboard.writeText(text);
        status(target, 'Copied · 已复制', 'success');
      } catch (error) { status(target, error instanceof Error ? error.message : 'Copy failed', 'error'); }
    };

    elements.fromHex.addEventListener('click', () => runColor(() => parseHex(elements.hexInput.value)));
    elements.fromRgb.addEventListener('click', () => runColor(() => normalizeRgb({ r: elements.rgbR.value, g: elements.rgbG.value, b: elements.rgbB.value })));
    elements.fromHsl.addEventListener('click', () => runColor(() => hslToRgb({ h: elements.hslH.value, s: elements.hslS.value, l: elements.hslL.value })));
    elements.copyResults.addEventListener('click', () => copy(`${elements.hexResult.textContent}\n${elements.rgbResult.textContent}\n${elements.hslResult.textContent}`, elements.convertStatus));
    elements.checkContrast.addEventListener('click', renderContrast);
    elements.pickerA.addEventListener('input', () => { elements.contrastA.value = elements.pickerA.value; renderContrast(); });
    elements.pickerB.addEventListener('input', () => { elements.contrastB.value = elements.pickerB.value; renderContrast(); });
    elements.copyContrast.addEventListener('click', () => copy(`${elements.contrastA.value} on ${elements.contrastB.value}: ${elements.contrastRatio.textContent}`, elements.contrastStatus));
    renderColor(parseHex(elements.hexInput.value || '#336699'));
    renderContrast();
    return true;
  }

  const api = {
    parseHex,
    normalizeRgb,
    rgbToHex,
    normalizeHsl,
    rgbToHsl,
    hslToRgb,
    formatHsl,
    relativeLuminance,
    contrastRatio,
    formatContrastRatio,
    getWcagCompliance,
    attachColorTool,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ColorTool = api;
  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => attachColorTool(document, navigator));

}(typeof globalThis !== 'undefined' ? globalThis : this));
