'use strict';

const MAX_TOKEN_LENGTH = 65_536;
const JWT_MESSAGES = {
  ready: { en: 'Ready', zh: '就绪' },
  active: { en: 'Decoded — token time claims are currently active', zh: '解码完成——令牌时间声明当前有效' },
  expired: { en: 'Decoded — token is expired', zh: '解码完成——令牌已过期' },
  'not-active': { en: 'Decoded — token is not active yet', zh: '解码完成——令牌尚未生效' },
  'no-expiration': { en: 'Decoded — no expiration claim', zh: '解码完成——未包含过期时间声明' },
  'invalid-claims': { en: 'Decoded — one or more time claims are invalid', zh: '解码完成——一个或多个时间声明无效' },
  failed: { en: 'JWT decoding failed', zh: 'JWT 解码失败' },
  copied: { en: 'Copied', zh: '已复制' },
  copyFailed: { en: 'Copy failed', zh: '复制失败' },
  emptySignature: { en: 'Empty signature segment', zh: '签名段为空' },
  valid: { en: 'Valid NumericDate', zh: '有效的 NumericDate' },
  invalid: { en: 'Invalid NumericDate', zh: '无效的 NumericDate' },
  unknownAlgorithm: { en: 'Unknown', zh: '未知' },
};

function jwtMessage(key, language) {
  const locale = String(language).toLowerCase().startsWith('zh') ? 'zh' : 'en';
  return JWT_MESSAGES[key][locale];
}

function normalizeJwtInput(value) {
  return String(value).trim().replace(/^Bearer\s+/iu, '').trim();
}

function bytesToBase64Url(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/gu, '');
}

function decodeBase64UrlBytes(segment, label) {
  if (!segment || !/^[A-Za-z0-9_-]+$/u.test(segment) || segment.length % 4 === 1) {
    throw new TypeError(`${label} is not valid Base64URL data.`);
  }
  const base64 = segment.replace(/-/gu, '+').replace(/_/gu, '/') + '='.repeat((4 - (segment.length % 4)) % 4);
  let binary;
  try { binary = atob(base64); }
  catch { throw new TypeError(`${label} is not valid Base64URL data.`); }
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  if (bytesToBase64Url(bytes) !== segment) throw new TypeError(`${label} is not canonical Base64URL data.`);
  return bytes;
}

function decodeBase64Url(segment, label) {
  const bytes = decodeBase64UrlBytes(segment, label);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new TypeError(`${label} is not valid UTF-8 text.`); }
}

function parseObjectSegment(segment, label) {
  let value;
  try { value = JSON.parse(decodeBase64Url(segment, label)); }
  catch (error) {
    if (error instanceof SyntaxError) throw new TypeError(`${label} is not valid JSON.`);
    throw error;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must contain a JSON object.`);
  return value;
}

function decodeJwt(value) {
  const raw = String(value);
  if (raw.length > MAX_TOKEN_LENGTH) throw new RangeError('JWT is too long to process safely.');
  const token = normalizeJwtInput(raw);
  const segments = token.split('.');
  if (segments.length !== 3) throw new TypeError('A signed JWT must contain exactly three segments.');
  const [headerSegment, payloadSegment, signature] = segments;
  const header = parseObjectSegment(headerSegment, 'JWT header');
  const payload = parseObjectSegment(payloadSegment, 'JWT payload');
  if (signature) decodeBase64UrlBytes(signature, 'JWT signature');
  return {
    token,
    header,
    payload,
    signature,
    algorithm: typeof header.alg === 'string' && header.alg ? header.alg : null,
    verified: false,
  };
}

function numericDateDetail(payload, name) {
  if (!Object.hasOwn(payload, name)) return null;
  const value = payload[name];
  if (typeof value !== 'number' || !Number.isFinite(value)) return { value, valid: false };
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return { value, valid: false };
  return { value, valid: true, milliseconds: date.getTime(), iso: date.toISOString() };
}

function inspectJwt(value, nowMilliseconds = Date.now()) {
  const decoded = decodeJwt(value);
  const claims = {
    exp: numericDateDetail(decoded.payload, 'exp'),
    iat: numericDateDetail(decoded.payload, 'iat'),
    nbf: numericDateDetail(decoded.payload, 'nbf'),
  };
  const invalidClaims = Object.values(claims).some(claim => claim && !claim.valid);
  const nowSeconds = nowMilliseconds / 1000;
  let state;
  if (invalidClaims) state = 'invalid-claims';
  else if (claims.exp && claims.exp.value <= nowSeconds) state = 'expired';
  else if (claims.nbf && claims.nbf.value > nowSeconds) state = 'not-active';
  else if (!claims.exp) state = 'no-expiration';
  else state = 'active';
  return {
    ...decoded,
    claims,
    state,
    expiresInSeconds: claims.exp && claims.exp.valid ? Math.ceil(claims.exp.value - nowSeconds) : null,
  };
}

function formatClaimValue(value) {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); }
  catch { return String(value); }
}

function formatNumericDateClaim(detail, language) {
  if (!detail.valid) return jwtMessage('invalid', language);
  const locale = String(language).toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
  return `${jwtMessage('valid', language)} · ${detail.iso} · ${new Date(detail.milliseconds).toLocaleString(locale)}`;
}

function attachJwtTool() {
  const language = document.documentElement.lang;
  const input = document.getElementById('jwtInput');
  const headerOutput = document.getElementById('jwtHeader');
  const payloadOutput = document.getElementById('jwtPayload');
  const signatureOutput = document.getElementById('jwtSignature');
  const claimsOutput = document.getElementById('jwtClaims');
  const status = document.getElementById('jwtStatus');
  const stateOutput = document.getElementById('jwtState');
  const algorithmOutput = document.getElementById('jwtAlgorithm');
  if (!input || !headerOutput || !payloadOutput || !signatureOutput || !claimsOutput || !status || !stateOutput || !algorithmOutput) return;

  const clearResults = () => {
    headerOutput.value = '';
    payloadOutput.value = '';
    signatureOutput.value = '';
    claimsOutput.replaceChildren();
    stateOutput.textContent = '—';
    stateOutput.dataset.state = '';
    algorithmOutput.textContent = '—';
  };

  const addClaim = (name, value, detail) => {
    const item = document.createElement('div');
    item.className = 'jwt-claim';
    const label = document.createElement('strong');
    label.textContent = name;
    const raw = document.createElement('code');
    raw.textContent = formatClaimValue(value);
    item.append(label, raw);
    if (detail) {
      const description = document.createElement('span');
      description.textContent = formatNumericDateClaim(detail, language);
      description.className = detail.valid ? 'jwt-claim-detail' : 'jwt-claim-detail error';
      item.appendChild(description);
    }
    claimsOutput.appendChild(item);
  };

  const render = inspected => {
    headerOutput.value = JSON.stringify(inspected.header, null, 2);
    payloadOutput.value = JSON.stringify(inspected.payload, null, 2);
    signatureOutput.value = inspected.signature;
    signatureOutput.placeholder = jwtMessage('emptySignature', language);
    algorithmOutput.textContent = inspected.algorithm || jwtMessage('unknownAlgorithm', language);
    stateOutput.textContent = jwtMessage(inspected.state, language);
    stateOutput.dataset.state = inspected.state;
    claimsOutput.replaceChildren();
    const registered = ['iss', 'sub', 'aud', 'exp', 'nbf', 'iat', 'jti'];
    let count = 0;
    for (const name of registered) {
      if (!Object.hasOwn(inspected.payload, name)) continue;
      addClaim(name, inspected.payload[name], inspected.claims[name] || null);
      count += 1;
    }
    if (count === 0) {
      const empty = document.createElement('p');
      empty.className = 'jwt-empty-claims';
      empty.textContent = String(language).toLowerCase().startsWith('zh') ? '未找到常用注册声明。' : 'No common registered claims found.';
      claimsOutput.appendChild(empty);
    }
    status.textContent = jwtMessage(inspected.state, language);
    status.dataset.state = ['expired', 'not-active', 'invalid-claims'].includes(inspected.state) ? 'warning' : 'success';
  };

  document.getElementById('decodeJwt').addEventListener('click', () => {
    try { render(inspectJwt(input.value)); }
    catch (error) {
      clearResults();
      status.textContent = String(language).toLowerCase().startsWith('zh')
        ? jwtMessage('failed', language)
        : (error instanceof Error ? error.message : jwtMessage('failed', language));
      status.dataset.state = 'error';
    }
  });

  document.getElementById('clearJwt').addEventListener('click', () => {
    input.value = '';
    clearResults();
    status.textContent = jwtMessage('ready', language);
    status.dataset.state = '';
    input.focus();
  });

  document.querySelectorAll('[data-jwt-copy]').forEach(button => button.addEventListener('click', async () => {
    const target = document.getElementById(button.dataset.jwtCopy);
    try {
      await navigator.clipboard.writeText(target?.value || target?.textContent || '');
      status.textContent = jwtMessage('copied', language);
      status.dataset.state = 'success';
    } catch {
      status.textContent = jwtMessage('copyFailed', language);
      status.dataset.state = 'error';
    }
  }));
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', attachJwtTool);
if (typeof module !== 'undefined' && module.exports) module.exports = {
  MAX_TOKEN_LENGTH,
  decodeBase64Url,
  decodeJwt,
  formatNumericDateClaim,
  inspectJwt,
  jwtMessage,
  normalizeJwtInput,
};
