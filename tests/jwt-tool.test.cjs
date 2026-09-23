'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const encode = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value), 'utf8')
  .toString('base64url');
const token = (header, payload, signature = 'signature') => `${encode(header)}.${encode(payload)}.${encode(signature)}`;

test('decodes a JWT locally and accepts a Bearer prefix', () => {
  const { decodeJwt } = require('../jwt/jwt-tool.js');
  const value = token({ alg: 'HS256', typ: 'JWT' }, { sub: 'user-123', name: '测试 User', admin: true });
  const decoded = decodeJwt(`  Bearer ${value}  `);
  assert.equal(decoded.token, value);
  assert.deepEqual(decoded.header, { alg: 'HS256', typ: 'JWT' });
  assert.deepEqual(decoded.payload, { sub: 'user-123', name: '测试 User', admin: true });
  assert.equal(decoded.algorithm, 'HS256');
  assert.equal(decoded.signature, encode('signature'));
  assert.equal(decoded.verified, false);
});

test('reports active, expired, not-active and missing-expiration states deterministically', () => {
  const { inspectJwt } = require('../jwt/jwt-tool.js');
  const now = 1_800_000_000_000;
  assert.equal(inspectJwt(token({ alg: 'RS256' }, { exp: 1_800_000_100 }), now).state, 'active');
  assert.equal(inspectJwt(token({ alg: 'RS256' }, { exp: 1_799_999_999 }), now).state, 'expired');
  assert.equal(inspectJwt(token({ alg: 'RS256' }, { exp: 1_800_000_100, nbf: 1_800_000_010 }), now).state, 'not-active');
  assert.equal(inspectJwt(token({ alg: 'none' }, { sub: 'no-exp' }, ''), now).state, 'no-expiration');
});

test('formats NumericDate claims without treating decoding as signature verification', () => {
  const { inspectJwt } = require('../jwt/jwt-tool.js');
  const inspected = inspectJwt(token({ alg: 'ES256' }, { iat: 1_700_000_000, nbf: 1_700_000_010, exp: 1_700_000_100 }), 1_700_000_020_000);
  assert.equal(inspected.verified, false);
  assert.equal(inspected.claims.exp.iso, '2023-11-14T22:15:00.000Z');
  assert.equal(inspected.claims.iat.iso, '2023-11-14T22:13:20.000Z');
  assert.equal(inspected.claims.nbf.iso, '2023-11-14T22:13:30.000Z');
  assert.equal(inspected.expiresInSeconds, 80);
});

test('flags malformed NumericDate claims instead of guessing', () => {
  const { inspectJwt } = require('../jwt/jwt-tool.js');
  const inspected = inspectJwt(token({ alg: 'HS256' }, { exp: 'tomorrow', iat: null }), 1_700_000_000_000);
  assert.equal(inspected.state, 'invalid-claims');
  assert.equal(inspected.claims.exp.valid, false);
  assert.equal(inspected.claims.iat.valid, false);
});

test('rejects malformed, noncanonical, oversized and non-object JWT data', () => {
  const { decodeJwt, MAX_TOKEN_LENGTH } = require('../jwt/jwt-tool.js');
  assert.throws(() => decodeJwt('not-a-jwt'), /three segments/i);
  assert.throws(() => decodeJwt('a.b.c.d'), /three segments/i);
  assert.throws(() => decodeJwt('*.e30.signature'), /Base64URL/i);
  assert.throws(() => decodeJwt(`${encode('not json')}.e30.signature`), /JSON/i);
  assert.throws(() => decodeJwt(`${encode({ alg: 'HS256' })}.${encode({ sub: 'x' })}.AB`), /canonical Base64URL/i);
  assert.throws(() => decodeJwt(`${encode([])}.${encode({ sub: 'x' })}.signature`), /object/i);
  assert.throws(() => decodeJwt(`${encode({ alg: 'HS256' })}.${encode(null)}.signature`), /object/i);
  assert.throws(() => decodeJwt('a'.repeat(MAX_TOKEN_LENGTH + 1)), /too long/i);
  const valid = token({ alg: 'HS256' }, { sub: 'x' });
  assert.throws(() => decodeJwt(`${' '.repeat(MAX_TOKEN_LENGTH)}${valid}`), /too long/i);
  assert.throws(() => decodeJwt(`Bearer ${' '.repeat(MAX_TOKEN_LENGTH)}${valid}`), /too long/i);
});

test('localizes unknown algorithms and NumericDate display using the page language', () => {
  const { decodeJwt, formatNumericDateClaim, jwtMessage } = require('../jwt/jwt-tool.js');
  assert.equal(decodeJwt(token({}, {})).algorithm, null);
  assert.equal(jwtMessage('unknownAlgorithm', 'en'), 'Unknown');
  assert.equal(jwtMessage('unknownAlgorithm', 'zh-CN'), '未知');
  const detail = { valid: true, milliseconds: 4_102_444_800_000, iso: '2100-01-01T00:00:00.000Z' };
  assert.equal(formatNumericDateClaim(detail, 'en'), `Valid NumericDate · ${detail.iso} · ${new Date(detail.milliseconds).toLocaleString('en-US')}`);
  assert.equal(formatNumericDateClaim(detail, 'zh-CN'), `有效的 NumericDate · ${detail.iso} · ${new Date(detail.milliseconds).toLocaleString('zh-CN')}`);
});

test('JWT pages expose complete localized controls and honest security guidance', () => {
  const english = read('jwt/index.html');
  const chinese = read('zh/jwt/index.html');
  for (const html of [english, chinese]) {
    for (const id of ['jwtInput', 'decodeJwt', 'clearJwt', 'jwtStatus', 'jwtHeader', 'jwtPayload', 'jwtSignature', 'jwtClaims']) {
      assert.match(html, new RegExp(`id="${id}"`));
    }
    assert.match(html, /\/jwt\/jwt-tool\.js/);
    assert.match(html, /class="local-processing-note"/);
    assert.match(html, /data-related-tools="jwt"/);
  }
  assert.match(english, /Decoding does not verify/i);
  assert.match(chinese, /解码并不代表签名已经验证/);
  assert.match(english, /canonical" href="https:\/\/www\.utilcover\.com\/jwt\/"/);
  assert.match(chinese, /canonical" href="https:\/\/www\.utilcover\.com\/zh\/jwt\/"/);
});

test('JWT implementation remains local-only and uses safe DOM rendering', () => {
  const script = read('jwt/jwt-tool.js');
  assert.doesNotMatch(script, /\beval\s*\(|new Function|\.innerHTML\s*=|\.outerHTML\s*=/);
  assert.doesNotMatch(script, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB/i);
  assert.match(script, /textContent/);
});

test('JWT is registered in the directory, sitemap and JavaScript checks', () => {
  const { findTool, RELATED_TOOLS } = require('../shared/tools-data.js');
  const { routes } = require('../scripts/generate-sitemap.cjs');
  const packageJson = require('../package.json');
  assert.equal(findTool('jwt').category, 'security');
  assert.deepEqual(RELATED_TOOLS.jwt, ['json', 'base64', 'timestamp']);
  assert.ok(routes.includes('/jwt/'));
  assert.ok(routes.includes('/zh/jwt/'));
  assert.match(packageJson.scripts['check:js'], /jwt\/jwt-tool\.js/);
});
