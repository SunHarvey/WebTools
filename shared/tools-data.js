'use strict';

const TOOLS = [
  { id: 'json', icon: '{ }', category: 'developer', popular: true, name: { en: 'JSON Formatter', zh: 'JSON 格式化' }, description: { en: 'Format, minify, validate and explore JSON.', zh: '格式化、压缩、验证并浏览 JSON。' }, keywords: ['json', 'formatter', 'validator', 'tree'] },
  { id: 'image', icon: '▧', category: 'design', popular: true, name: { en: 'Image Compressor', zh: '图片压缩器' }, description: { en: 'Resize, compress and convert images locally.', zh: '在本地调整、压缩和转换图片。' }, keywords: ['image', 'compress', 'resize', 'png', 'jpeg', 'webp'] },
  { id: 'qr', icon: '▦', category: 'design', popular: true, name: { en: 'QR Generator', zh: '二维码生成器' }, description: { en: 'Create text, URL and Wi-Fi QR codes.', zh: '创建文本、网址和 Wi-Fi 二维码。' }, keywords: ['qr', 'wifi', 'code'] },
  { id: 'encode', icon: '⇄', category: 'developer', popular: false, name: { en: 'Base64 & URL', zh: 'Base64 与网址编解码' }, description: { en: 'Encode and decode Base64 and URL components.', zh: '进行 Base64 与网址组件编解码。' }, keywords: ['base64', 'url', 'encode', 'decode'] },
  { id: 'timestamp', icon: '🕒', category: 'developer', popular: true, name: { en: 'Timestamp Converter', zh: '时间戳转换器' }, description: { en: 'Convert Unix timestamps across timezones.', zh: '跨时区转换 Unix 时间戳。' }, keywords: ['timestamp', 'unix', 'timezone', 'date'] },
  { id: 'uuid', icon: '#', category: 'developer', popular: true, name: { en: 'UUID Generator', zh: 'UUID 生成器' }, description: { en: 'Generate secure UUID v4 and v7 values.', zh: '安全生成 UUID v4 与 v7。' }, keywords: ['uuid', 'guid', 'v4', 'v7'] },
  { id: 'hash', icon: '⌁', category: 'developer', popular: false, name: { en: 'SHA Hash Tool', zh: 'SHA 哈希工具' }, description: { en: 'Hash text and files with Web Crypto.', zh: '使用 Web Crypto 计算文本和文件哈希。' }, keywords: ['hash', 'sha', 'digest'] },
  { id: 'color', icon: '◉', category: 'design', popular: false, name: { en: 'Color & Contrast', zh: '颜色与对比度' }, description: { en: 'Convert colors and check WCAG contrast.', zh: '转换颜色并检查 WCAG 对比度。' }, keywords: ['color', 'contrast', 'hex', 'rgb', 'hsl'] },
  { id: 'text', icon: 'Aa', category: 'productivity', popular: false, name: { en: 'Text Toolkit', zh: '文本工具箱' }, description: { en: 'Count, clean, sort and transform text.', zh: '统计、清理、排序和转换文本。' }, keywords: ['text', 'count', 'sort', 'deduplicate'] },
  { id: 'unit', icon: '⇆', category: 'productivity', popular: false, name: { en: 'Unit Converter', zh: '单位转换器' }, description: { en: 'Convert common measurement units.', zh: '转换常用度量单位。' }, keywords: ['unit', 'convert', 'length', 'mass'] },
  { id: 'calculator', icon: '🧮', category: 'productivity', popular: false, name: { en: 'Calculator', zh: '计算器' }, description: { en: 'Keyboard-friendly everyday arithmetic.', zh: '支持键盘操作的日常算术。' }, keywords: ['calculator', 'math', 'arithmetic'] },
  { id: 'password', icon: '🔐', category: 'security', popular: true, name: { en: 'Password Generator', zh: '密码生成器' }, description: { en: 'Generate secure passwords with Web Crypto.', zh: '使用 Web Crypto 生成安全密码。' }, keywords: ['password', 'secure', 'random'] },
  { id: 'base64', icon: '64', category: 'developer', popular: false, name: { en: 'Base64 Encoder', zh: 'Base64 编解码器' }, description: { en: 'Encode and decode UTF-8 text as Base64.', zh: '将 UTF-8 文本进行 Base64 编解码。' }, keywords: ['base64', 'encode', 'decode'] },
  { id: 'url-encoder', icon: '%', category: 'developer', popular: false, name: { en: 'URL Encoder', zh: '网址编解码器' }, description: { en: 'Encode and decode URL components safely.', zh: '安全进行网址组件编解码。' }, keywords: ['url', 'uri', 'encode', 'decode', 'percent'] },
];

const TOOL_CATEGORIES = {
  developer: { en: 'Developer', zh: '开发者' },
  design: { en: 'Image & Design', zh: '图片与设计' },
  productivity: { en: 'Text & Productivity', zh: '文本与效率' },
  security: { en: 'Security', zh: '安全' },
};

const RELATED_TOOLS = {
  json: ['text', 'encode', 'hash'], image: ['color', 'qr', 'base64'], qr: ['password', 'image', 'encode'],
  encode: ['text', 'json', 'hash'], timestamp: ['encode', 'uuid', 'calculator'], uuid: ['hash', 'password', 'timestamp'],
  hash: ['encode', 'password', 'text'], color: ['image', 'qr', 'text'], text: ['encode', 'json', 'hash'],
  unit: ['calculator', 'timestamp', 'color'], calculator: ['unit', 'timestamp', 'text'], password: ['hash', 'qr', 'uuid'],
  base64: ['url-encoder', 'json', 'hash'], 'url-encoder': ['base64', 'json', 'text'],
};

function toolPath(tool, language = 'en') { return `${language === 'zh' ? '/zh' : ''}/${tool.id}/`; }
function findTool(id) { return TOOLS.find(tool => tool.id === id); }

if (typeof globalThis !== 'undefined') Object.assign(globalThis, { UTILCOVER_TOOLS: TOOLS, UTILCOVER_CATEGORIES: TOOL_CATEGORIES, UTILCOVER_RELATED: RELATED_TOOLS });
if (typeof module !== 'undefined' && module.exports) module.exports = { TOOLS, TOOL_CATEGORIES, RELATED_TOOLS, toolPath, findTool };
