'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const matches = (value, pattern) => [...value.matchAll(pattern)];
const textContent = html => html
  .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&(?:amp|lt|gt|quot|#39);/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function guideFor(file) {
  const html = read(file);
  const guide = html.match(/<section class="tool-guide"[\s\S]*?<\/section>\s*<\/main>/i)?.[0] || '';
  assert.ok(guide, `${file}: missing tool guide below the interactive UI`);
  assert.ok(html.indexOf(guide) > html.indexOf('class="tool-card'), `${file}: guide must follow the tool UI`);
  return { html, guide, text: textContent(guide) };
}

function assertGuide(file, language, relatedRoutes) {
  const { guide, text } = guideFor(file);
  assert.match(guide, /class="guide-section how-to"/i, `${file}: how-to section`);
  assert.match(guide, /<ol class="steps">[\s\S]*?<\/ol>/i, `${file}: ordered steps`);
  assert.match(guide, /class="guide-section examples"/i, `${file}: examples section`);
  assert.ok(matches(guide, /<article\b/gi).length >= 2, `${file}: concrete examples`);
  assert.match(guide, /class="guide-section limitations"/i, `${file}: limitations section`);
  const faqs = matches(guide, /<details>[\s\S]*?<summary>[^<]+<\/summary>[\s\S]*?<\/details>/gi);
  assert.ok(faqs.length >= 3 && faqs.length <= 5, `${file}: expected 3–5 accessible FAQs`);
  assert.match(guide, /class="related-tools"/i, `${file}: related tools section`);
  for (const route of relatedRoutes) assert.match(guide, new RegExp(`href="${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`), `${file}: related link ${route}`);
  const internalLinks = matches(guide, /<a\s+href="(\/[^"]+)"/gi).map(match => match[1]);
  assert.ok(internalLinks.length >= 2, `${file}: useful related links`);
  if (language === 'en') {
    assert.ok(text.length >= 1800, `${file}: English guide needs substantial visible copy (${text.length})`);
    assert.ok(internalLinks.every(href => !href.startsWith('/zh/')), `${file}: English related links must stay on English routes`);
  } else {
    assert.ok(matches(text, /[\u3400-\u9fff]/g).length >= 650, `${file}: Chinese guide needs substantial visible copy`);
    assert.ok(internalLinks.every(href => href.startsWith('/zh/')), `${file}: Chinese related links must stay on Chinese routes`);
    assert.doesNotMatch(text, /\b(?:How to|This tool|You can|Frequently asked|Related tools|Use cases|Limitations)\b/i, `${file}: untranslated prose in Chinese guide`);
  }
}

function assertMetadata(file, titleIntent, descriptionIntent) {
  const html = read(file);
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1] || '';
  const description = html.match(/<meta name="description" content="([^"]+)"/i)?.[1] || '';
  assert.match(title, titleIntent, `${file}: title intent`);
  assert.match(description, descriptionIntent, `${file}: description intent`);
  assert.doesNotMatch(html, /<meta name="keywords"/i, `${file}: obsolete meta keywords`);
}

test('JSON pages explain strict formatting, validation and minification in each locale', () => {
  assertGuide('json/index.html', 'en', ['/text/', '/encode/']);
  assertGuide('zh/json/index.html', 'zh', ['/zh/text/', '/zh/encode/']);
  assertMetadata('json/index.html', /JSON Formatter.*Validator.*Minifier/i, /format.*validat.*minif/i);
  assertMetadata('zh/json/index.html', /JSON.*(?:格式化|校验|验证).*(?:压缩)/, /格式化.*(?:验证|校验).*压缩/);
  for (const file of ['json/index.html', 'zh/json/index.html']) {
    const guide = guideFor(file).text;
    assert.match(guide, /JSON\.parse/);
    assert.match(guide, /JSON5/);
  }
});

test('JSON pages warn about parse and stringify transformations in each locale', () => {
  const english = guideFor('json/index.html').text;
  assert.match(english, /duplicate (?:object )?(?:keys|property names?).*(?:last|later) value/i, 'English: duplicate keys can collapse to the last value');
  assert.match(english, /integer-like (?:keys|property names?).*(?:property )?order/i, 'English: integer-like keys can change property order');
  assert.match(english, /JavaScript Number.*precision.*safe integer/i, 'English: JavaScript Number precision limits are disclosed');
  assert.match(english, /numeric (?:spellings?|representations?).*(?:normaliz|change)|-0.*0/i, 'English: numeric spellings or -0 can be normalized');
  assert.doesNotMatch(english, /changes whitespace only|parsed values remain the same|preserves JSON values/i, 'English: no whitespace-only or value-preservation overclaim');

  const chinese = guideFor('zh/json/index.html').text;
  assert.match(chinese, /重复(?:键|字段名|属性名).*(?:最后|后一个|后者).*(?:保留|覆盖)/, 'Chinese: duplicate keys can collapse to the last value');
  assert.match(chinese, /整数(?:式|形式|型).*(?:键|字段名|属性名).*(?:顺序|排序)/, 'Chinese: integer-like keys can change property order');
  assert.match(chinese, /JavaScript Number.*(?:精度|安全整数)/, 'Chinese: JavaScript Number precision limits are disclosed');
  assert.match(chinese, /数字(?:写法|表示).*(?:规范化|改变)|-0.*0/, 'Chinese: numeric spellings or -0 can be normalized');
  assert.doesNotMatch(chinese, /只调整空白|只删除无意义空白|数据值会保留/, 'Chinese: no whitespace-only or value-preservation overclaim');
});

test('image pages explain one-file compression, resizing and conversion in each locale', () => {
  assertGuide('image/index.html', 'en', ['/color/', '/qr/']);
  assertGuide('zh/image/index.html', 'zh', ['/zh/color/', '/zh/qr/']);
  assertMetadata('image/index.html', /Image Compressor.*Resizer.*Converter/i, /compress.*resiz.*convert/i);
  assertMetadata('zh/image/index.html', /图片.*(?:压缩|缩小).*(?:尺寸|调整).*(?:转换)/, /压缩.*(?:尺寸|调整).*(?:转换)/);
  for (const file of ['image/index.html', 'zh/image/index.html']) {
    const guide = guideFor(file).text;
    assert.match(guide, /16 MiB/);
    assert.match(guide, /12 (?:megapixels|MP|MP（|MP，|MP。|MP、|MP )/i);
    assert.match(guide, /8192/);
    assert.match(guide, /PNG/);
    assert.match(guide, /JPEG/);
    assert.match(guide, /WebP/);
    assert.match(guide, /(?:AVIF|HEIC)/);
  }
});

test('QR pages explain static URL, text and Wi-Fi PNG codes in each locale', () => {
  assertGuide('qr/index.html', 'en', ['/password/', '/image/']);
  assertGuide('zh/qr/index.html', 'zh', ['/zh/password/', '/zh/image/']);
  assertMetadata('qr/index.html', /QR Code Generator.*URL.*Text.*Wi-Fi/i, /(?:URL|text).*Wi-Fi.*QR/i);
  assertMetadata('zh/qr/index.html', /二维码生成器.*(?:网址|文本).*Wi-Fi/, /(?:网址|文本).*Wi-Fi.*二维码/);
  for (const file of ['qr/index.html', 'zh/qr/index.html']) {
    const guide = guideFor(file).text;
    assert.match(guide, /2950/);
    assert.match(guide, /PNG/);
    assert.match(guide, /Wi-Fi/);
    assert.match(guide, /(?:scan-test|扫码测试)/i);
    assert.match(guide, /(?:contrast|对比度)/i);
    assert.match(guide, /(?:dynamic|动态)/i);
    assert.match(guide, /(?:tracking|跟踪|追踪)/i);
    assert.match(guide, /(?:logo|标志|图标)/i);
  }
});

test('password pages explain secure random generation and honest controls in each locale', () => {
  assertGuide('password/index.html', 'en', ['/hash/', '/qr/']);
  assertGuide('zh/password/index.html', 'zh', ['/zh/hash/', '/zh/qr/']);
  assertMetadata('password/index.html', /Secure Random Password Generator/i, /secure.*random.*password/i);
  assertMetadata('zh/password/index.html', /安全随机密码生成器/, /安全.*随机密码/);
  for (const file of ['password/index.html', 'zh/password/index.html']) {
    const html = read(file);
    const guide = guideFor(file).text;
    assert.match(guide, /Web Crypto/);
    assert.match(guide, /(?:rejection sampling|拒绝采样)/i);
    assert.match(guide, /1.?–.?128|1-128/);
    assert.match(guide, /1.?–.?100|1-100/);
    assert.match(guide, /(?:each enabled category|每种已启用字符类型)/i);
    assert.match(guide, /(?:ambiguous|易混淆)/i);
    assert.doesNotMatch(html, /regularly change passwords|定期更换/i, `${file}: outdated scheduled password-change advice`);
  }
});

test('shared tool-guide styles are responsive and keyboard accessible', () => {
  const css = read('shared/tools.css');
  for (const selector of ['.tool-guide', '.guide-intro', '.guide-section', '.steps', '.example-grid', '.faq-list', '.related-links']) {
    assert.match(css, new RegExp(selector.replace('.', '\\.')), `missing shared selector ${selector}`);
  }
  assert.match(css, /summary:focus-visible/);
  assert.match(css, /\.related-links a:focus-visible/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*\.example-grid[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*\.steps/);
});
