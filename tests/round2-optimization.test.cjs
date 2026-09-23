'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const imageTool = require('../image/image-tool.js');
const timestampTool = require('../timestamp/timestamp-tool.js');
const { schemaFor } = require('../scripts/generate-structured-data.cjs');

function trackingFile(bytes, type, size = bytes.length) {
  const reads = [];
  return {
    type,
    size,
    name: `sample.${type.split('/')[1]}`,
    reads,
    slice(start, end) {
      reads.push([start, end]);
      return new Blob([bytes.slice(start, end)]);
    },
  };
}

function pngHeader(width, height) {
  const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 0, 0, 0, 0, 0]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

test('Image metadata describes batch local processing without stale singular claims', () => {
  for (const [file, expectations] of [
    ['image/index.html', [/batch/i, /browser/i, /compress/i, /resize/i, /convert/i, /without uploading|never uploaded/i]],
    ['zh/image/index.html', [/批量/, /浏览器|本地/, /压缩/, /尺寸|缩放/, /转换/, /无需上传|不会上传|绝不会上传/]],
  ]) {
    const html = read(file);
    const descriptions = [
      html.match(/<meta name="description" content="([^"]+)"/i)?.[1] || '',
      html.match(/<meta property="og:description" content="([^"]+)"/i)?.[1] || '',
      JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i)[1])['@graph'][0].description,
    ];
    for (const description of descriptions) {
      for (const expectation of expectations) assert.match(description, expectation, `${file}: ${description}`);
    }
    assert.doesNotMatch(html, /convert one PNG|单张图片/iu);
  }
});

test('Image header inspection reads bounded slices instead of the whole file', async () => {
  const file = trackingFile(pngHeader(640, 480), 'image/png', 1024 * 1024);
  assert.deepEqual(await imageTool.inspectImageFileHeader(file), { mime: 'image/png', width: 640, height: 480 });
  assert.ok(file.reads.length > 0);
  assert.ok(file.reads.every(([start, end]) => end - start <= 64), JSON.stringify(file.reads));
  assert.ok(file.reads.every(([, end]) => end !== file.size), JSON.stringify(file.reads));
});

test('bounded WebP inspection accepts a large odd-sized lossy chunk and reads its padding byte separately', async () => {
  const chunkSize = 1001;
  const bytes = new Uint8Array(20 + chunkSize + 1);
  bytes.set([82, 73, 70, 70], 0);
  new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
  bytes.set([87, 69, 66, 80, 86, 80, 56, 32], 8);
  new DataView(bytes.buffer).setUint32(16, chunkSize, true);
  bytes.set([0x9d, 0x01, 0x2a], 23);
  new DataView(bytes.buffer).setUint16(26, 640, true);
  new DataView(bytes.buffer).setUint16(28, 480, true);
  bytes[20 + chunkSize] = 0;
  const file = trackingFile(bytes, 'image/webp');
  assert.deepEqual(await imageTool.inspectImageFileHeader(file), { mime: 'image/webp', width: 640, height: 480 });
  assert.deepEqual(file.reads, [[0, 32], [20 + chunkSize, 21 + chunkSize]]);
});

test('JPEG inspection rejects excessive marker fill without unbounded reads', async () => {
  const bytes = new Uint8Array(200_000).fill(0xff);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  const file = trackingFile(bytes, 'image/jpeg');
  await assert.rejects(() => imageTool.inspectImageFileHeader(file), /malformed|metadata/i);
  assert.ok(file.reads.length <= 4, JSON.stringify(file.reads.length));
});

test('Image batches are capped at 25 files and validation concurrency is bounded', async () => {
  assert.equal(imageTool.validateImageBatch(new Array(25).fill({ type: 'image/png' })).length, 25);
  assert.throws(() => imageTool.validateImageBatch(new Array(26).fill({ type: 'image/png' })), /25/);
  let active = 0;
  let peak = 0;
  await imageTool.mapWithConcurrency(new Array(9).fill(0), 3, async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 2));
    active -= 1;
  });
  assert.equal(peak, 3);
});

test('Target-size encoding reports reached and unreached outcomes honestly', async () => {
  const reached = await imageTool.encodeToTargetSize(async quality => ({ size: Math.round(1000 + quality * 9000), quality }), 5000);
  assert.equal(reached.targetReached, true);
  assert.equal(reached.targetBytes, 5000);
  const missed = await imageTool.encodeToTargetSize(async quality => ({ size: 47000, quality }), 20 * 1024);
  assert.equal(missed.targetReached, false);
  assert.equal(missed.size, 47000);
  assert.match(imageTool.targetSizeMessage(missed, 'en'), /Target 20 KB could not be reached.*45\.9 KB/i);
  assert.match(imageTool.targetSizeMessage(missed, 'zh'), /无法达到 20 KB.*45\.9 KB/);
  const pngMissed = await imageTool.encodeForTarget(async () => ({ size: 30 * 1024 }), 'image/png', 0.8, 20 * 1024);
  assert.equal(pngMissed.targetReached, false);
  assert.equal(pngMissed.targetBytes, 20 * 1024);
  assert.equal(pngMissed.size, 30 * 1024);
});

test('Timestamp interprets datetime-local values in the selected IANA timezone', () => {
  assert.equal(timestampTool.dateTimeInZoneToUnix('2026-09-19T10:00', 'Asia/Tokyo').iso, '2026-09-19T01:00:00.000Z');
  assert.equal(timestampTool.dateTimeInZoneToUnix('2026-09-19T10:00', 'Asia/Singapore').iso, '2026-09-19T02:00:00.000Z');
  assert.equal(timestampTool.dateTimeInZoneToUnix('2026-01-15T10:00', 'America/New_York').iso, '2026-01-15T15:00:00.000Z');
  assert.equal(timestampTool.dateTimeInZoneToUnix('2026-07-15T10:00', 'America/New_York').iso, '2026-07-15T14:00:00.000Z');
  assert.throws(() => timestampTool.dateTimeInZoneToUnix('2026-03-08T02:30', 'America/New_York'), /does not exist|不存在/i);
  assert.equal(timestampTool.dateTimeInZoneToUnix('2026-11-01T01:30', 'America/New_York').iso, '2026-11-01T05:30:00.000Z');
  assert.equal(timestampTool.dateTimeInZoneToUnix('0001-01-01T00:00', 'UTC').iso, '0001-01-01T00:00:00.000Z');
  assert.equal(timestampTool.dateTimeInZoneToUnix('0099-12-31T23:59', 'UTC').iso, '0099-12-31T23:59:00.000Z');
});

test('footer generator inserts footerless markup before body, never in head', () => {
  const { updateHtml } = require('../scripts/generate-site-footer.cjs');
  const source = '<!doctype html><html><head><script type="application/ld+json">{}</script></head><body><main>Page</main></body></html>';
  const updated = updateHtml(source, 'en');
  assert.ok(updated.indexOf('</head>') < updated.indexOf('<footer>'));
  assert.ok(updated.indexOf('<footer>') < updated.indexOf('</body>'));
});

test('Timestamp UI states that the selector controls input and display timezone', () => {
  const en = read('timestamp/index.html');
  const zh = read('zh/timestamp/index.html');
  assert.match(en, /Input and display timezone/);
  assert.match(en, /interpreted in the selected timezone/i);
  assert.match(zh, /输入与显示时区/);
  assert.match(zh, /按所选时区解释/);
});

test('Information pages use page schemas without WebApplication fields', () => {
  const expected = new Map([
    ['/privacy/', 'WebPage'], ['/about/', 'AboutPage'], ['/contact/', 'ContactPage'], ['/licenses/', 'WebPage'],
    ['/zh/privacy/', 'WebPage'], ['/zh/about/', 'AboutPage'], ['/zh/contact/', 'ContactPage'], ['/zh/licenses/', 'WebPage'],
  ]);
  for (const [route, type] of expected) {
    const file = `${route.slice(1)}index.html`;
    const schema = schemaFor(route, read(file), file)['@graph'][0];
    assert.equal(schema['@type'], type, route);
    assert.ok(!('applicationCategory' in schema), route);
    assert.ok(!('operatingSystem' in schema), route);
    assert.ok(!('offers' in schema), route);
  }
  const tool = schemaFor('/image/', read('image/index.html'), 'image/index.html')['@graph'][0];
  assert.equal(tool['@type'], 'WebApplication');
  assert.equal(tool.offers.price, '0');
});

test('Every HTML page has centralized localized footer navigation', () => {
  const htmlFiles = fs.readdirSync(root, { recursive: true }).filter(file => file.endsWith('.html'));
  assert.equal(htmlFiles.length, 46);
  for (const file of htmlFiles) {
    const html = read(file);
    assert.match(html, /class="footer-nav"/, file);
    const zh = html.match(/<html lang="zh/i);
    for (const route of ['privacy', 'about', 'contact', 'licenses']) {
      assert.match(html, new RegExp(`href="/${zh ? 'zh/' : ''}${route}/"`), `${file}: ${route}`);
    }
    assert.match(html, /href="https:\/\/github\.com\/SunHarvey\/WebTools"[^>]*rel="noopener noreferrer"/, file);
  }
});

test('Related Tools uses an explicit responsive grid without shared flex overrides', () => {
  const css = read('shared/tools.css');
  const relatedDisplays = [...css.matchAll(/\.related-links\s*\{([^}]*)\}/g)].map(match => match[1].match(/display:\s*([^;]+)/)?.[1]).filter(Boolean);
  assert.deepEqual(relatedDisplays, ['grid']);
  assert.match(css, /\.related-links\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s);
  assert.match(css, /@media\s*\(max-width:\s*980px\)[\s\S]*?\.related-links\s*\{[^}]*grid-template-columns:\s*repeat\(2,/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*?\.related-links\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.doesNotMatch(css, /\.category-links\s*,\s*\.related-links\s*,\s*\.saved-tool-list/);
});

test('Generated JSON-LD hashes remain authorized after round-two metadata changes', () => {
  const html = read('image/index.html');
  const source = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
  const hash = crypto.createHash('sha256').update(source).digest('base64');
  assert.match(read('_headers'), new RegExp(`'sha256-${hash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
});
