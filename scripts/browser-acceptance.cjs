'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const REAL_ROOT = fs.realpathSync(ROOT);
const CDP_TIMEOUT_MS = 10_000;
const MOBILE_ROUTES = [
  '/', '/zh/',
  '/json/', '/zh/json/',
  '/image/', '/zh/image/',
  '/qr/', '/zh/qr/',
  '/timestamp/', '/zh/timestamp/',
  '/uuid/', '/zh/uuid/',
  '/jwt/', '/zh/jwt/',
  '/text-diff/', '/zh/text-diff/',
];
const PASSWORD_RESULT_ROUTES = ['/password/', '/zh/password/'];
const JWT_STORAGE_ROUTES = ['/jwt/', '/zh/jwt/'];
const TEXT_DIFF_ROUTES = ['/text-diff/', '/zh/text-diff/'];

const PRIVACY_FLOWS = {
  '/json/': `
    const input = document.querySelector('#jsonInput');
    input.value = '{"local":true,"items":[1,2,3]}';
    document.querySelector('#formatJson').click();
    await new Promise(resolve => setTimeout(resolve, 50));
    return { output: input.value, status: document.querySelector('#jsonStatus').textContent };
  `,
  '/password/': `
    document.querySelector('#generateButton').click();
    await new Promise(resolve => setTimeout(resolve, 50));
    return { count: document.querySelector('#passwordList').children.length };
  `,
  '/image/': `
    const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/7yMK/wAAAABJRU5ErkJggg=='), value => value.charCodeAt(0));
    const file = new File([bytes], 'privacy-check.png', { type: 'image/png' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const input = document.querySelector('#imageFile');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 350));
    return {
      status: document.querySelector('#imageStatus').textContent,
      previewVisible: !document.querySelector('#originalPreview').hidden,
      source: document.querySelector('#originalPreview').src,
    };
  `,
  '/hash/': `
    document.querySelector('#hashText').value = 'local-only privacy check';
    document.querySelector('#hashTextButton').click();
    await new Promise(resolve => setTimeout(resolve, 100));
    return { output: document.querySelector('#hashOutput').value, status: document.querySelector('#hashStatus').textContent };
  `,
  '/jwt/': `
    const encodePart = value => btoa(unescape(encodeURIComponent(JSON.stringify(value))))
      .replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/g, '');
    document.querySelector('#jwtInput').value = [
      encodePart({ alg: 'HS256', typ: 'JWT' }),
      encodePart({ sub: 'browser-check', exp: 4102444800 }),
      'c2lnbmF0dXJl',
    ].join('.');
    document.querySelector('#decodeJwt').click();
    await new Promise(resolve => setTimeout(resolve, 50));
    return {
      header: document.querySelector('#jwtHeader').value,
      payload: document.querySelector('#jwtPayload').value,
      status: document.querySelector('#jwtStatus').textContent,
    };
  `,
  '/text-diff/': `
    document.querySelector('#leftText').value = 'alpha\\nbeta\\ngamma';
    document.querySelector('#rightText').value = 'alpha\\nBETA\\ndelta';
    document.querySelector('#compareText').click();
    await new Promise(resolve => setTimeout(resolve, 50));
    return {
      added: document.querySelector('[data-diff-summary="added"]').textContent,
      deleted: document.querySelector('[data-diff-summary="deleted"]').textContent,
      changes: document.querySelector('[data-diff-summary="changes"]').textContent,
      rows: document.querySelector('[data-diff-output]').children.length,
      status: document.querySelector('#diffStatus').textContent,
    };
  `,
  '/zh/text-diff/': `
    document.querySelector('#leftText').value = '甲\\n乙\\n丙';
    document.querySelector('#rightText').value = '甲\\n修改\\n丁';
    document.querySelector('#compareText').click();
    await new Promise(resolve => setTimeout(resolve, 50));
    return {
      added: document.querySelector('[data-diff-summary="added"]').textContent,
      deleted: document.querySelector('[data-diff-summary="deleted"]').textContent,
      changes: document.querySelector('[data-diff-summary="changes"]').textContent,
      rows: document.querySelector('[data-diff-output]').children.length,
      status: document.querySelector('#diffStatus').textContent,
    };
  `,
};

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8',
};

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function isInsideRoot(filename) {
  return filename === REAL_ROOT || filename.startsWith(`${REAL_ROOT}${path.sep}`);
}

function startStaticServer() {
  const server = http.createServer((request, response) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
    catch { response.writeHead(400).end('Bad request'); return; }
    if (pathname.includes('\0')) { response.writeHead(400).end('Bad request'); return; }

    const relative = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    const unresolved = path.resolve(ROOT, `.${relative}`);
    if (unresolved !== ROOT && !unresolved.startsWith(`${ROOT}${path.sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    fs.realpath(unresolved, (realPathError, filename) => {
      if (realPathError) {
        response.writeHead(realPathError.code === 'ENOENT' ? 404 : 500).end('Not found');
        return;
      }
      if (!isInsideRoot(filename)) { response.writeHead(403).end('Forbidden'); return; }
      fs.readFile(filename, (error, data) => {
        if (error) { response.writeHead(error.code === 'ENOENT' ? 404 : 500).end('Not found'); return; }
        response.writeHead(200, {
          'Cache-Control': 'no-store',
          'Content-Type': MIME_TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream',
        });
        response.end(data);
      });
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function browserBinary(candidates) {
  const configured = candidates || (process.env.BROWSER_BIN ? [process.env.BROWSER_BIN] : [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    '/usr/bin/microsoft-edge-stable',
  ]);
  const found = configured.find(candidate => {
    try { fs.accessSync(candidate, fs.constants.X_OK); return true; }
    catch { return false; }
  });
  if (!found) throw new Error('No executable Chromium browser found. Set BROWSER_BIN to a Chrome, Chromium, or Edge executable.');
  return found;
}

class CdpClient {
  constructor(input, output, timeout = CDP_TIMEOUT_MS) {
    this.input = input;
    this.output = output;
    this.timeout = timeout;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.failureListeners = new Set();
    this.buffer = Buffer.alloc(0);
    this.sessionId = null;
    this.closedError = null;
    input.on('data', chunk => this.read(chunk));
    input.on('error', error => this.close(error));
    input.on('end', () => this.close(new Error('Chrome DevTools pipe closed.')));
    output.on('error', error => this.close(error));
  }

  read(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    let separator;
    while ((separator = this.buffer.indexOf(0)) !== -1) {
      const payload = this.buffer.subarray(0, separator).toString('utf8');
      this.buffer = this.buffer.subarray(separator + 1);
      if (!payload) continue;
      try { this.handle(JSON.parse(payload)); }
      catch (error) { this.close(new Error(`Invalid CDP message: ${error.message}`)); }
    }
  }

  handle(message) {
    if (message.id && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
      return;
    }
    if (this.sessionId && message.sessionId && message.sessionId !== this.sessionId) return;
    for (const listener of this.listeners.get(message.method) || []) listener(message.params);
  }

  send(method, params = {}, sessionId = this.sessionId) {
    if (this.closedError) return Promise.reject(this.closedError);
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out after ${this.timeout}ms: ${method}`));
      }, this.timeout);
      timer.unref();
      this.pending.set(id, { resolve, reject, timer });
      const message = { id, method, params };
      if (sessionId) message.sessionId = sessionId;
      this.output.write(`${JSON.stringify(message)}\0`);
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  once(method) {
    if (this.closedError) return Promise.reject(this.closedError);
    return new Promise((resolve, reject) => {
      let timer;
      const fail = error => {
        clearTimeout(timer);
        this.failureListeners.delete(fail);
        const listeners = this.listeners.get(method) || [];
        this.listeners.set(method, listeners.filter(item => item !== listener));
        reject(error);
      };
      const listener = params => {
        clearTimeout(timer);
        this.failureListeners.delete(fail);
        const listeners = this.listeners.get(method) || [];
        this.listeners.set(method, listeners.filter(item => item !== listener));
        resolve(params);
      };
      timer = setTimeout(() => fail(new Error(`CDP event timed out after ${this.timeout}ms: ${method}`)), this.timeout);
      timer.unref();
      this.failureListeners.add(fail);
      this.on(method, listener);
    });
  }

  close(error = new Error('Chrome DevTools connection closed.')) {
    if (this.closedError) return;
    this.closedError = error;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    for (const fail of [...this.failureListeners]) fail(error);
    this.failureListeners.clear();
  }

  async attachToPage() {
    const { targetInfos } = await this.send('Target.getTargets', {}, null);
    const page = targetInfos.find(target => target.type === 'page');
    if (!page) throw new Error('Chrome exposed no page target.');
    const { sessionId } = await this.send('Target.attachToTarget', { targetId: page.targetId, flatten: true }, null);
    this.sessionId = sessionId;
  }
}

async function evaluate(client, source) {
  const result = await client.send('Runtime.evaluate', {
    expression: `(async () => { ${source} })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

function waitForExit(child, timeout) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Browser did not exit within ${timeout}ms.`));
    }, timeout);
    const onExit = () => { cleanup(); resolve(); };
    const cleanup = () => { clearTimeout(timer); child.removeListener('exit', onExit); };
    child.once('exit', onExit);
  });
}

async function stopBrowser(browser) {
  if (browser.exitCode !== null || browser.signalCode !== null) return;
  browser.kill('SIGTERM');
  try { await waitForExit(browser, 3_000); }
  catch {
    browser.kill('SIGKILL');
    await waitForExit(browser, 3_000);
  }
}

async function stopServer(server) {
  if (!server.listening) return;
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

async function removeProfile(profile, attempts = 50) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await fs.promises.rm(profile, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (!['EBUSY', 'ENOTEMPTY', 'EPERM'].includes(error.code)) throw error;
      await wait(100);
    }
  }
  throw lastError;
}

async function runAcceptance() {
  const executable = browserBinary();
  let server;
  let sitePort;
  let profile;
  let browser;
  let client;
  let primaryError;
  try {
    const startedServer = await startStaticServer();
    server = startedServer.server;
    sitePort = startedServer.port;
    profile = fs.mkdtempSync(path.join(os.tmpdir(), 'utilcover-browser-'));
    browser = spawn(executable, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
      '--remote-debugging-pipe', `--user-data-dir=${profile}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
    let launchError;
    browser.once('error', error => {
      launchError = error;
      if (client) client.close(new Error(`Could not launch browser: ${error.message}`));
    });
    client = new CdpClient(browser.stdio[4], browser.stdio[3]);
    if (launchError) client.close(new Error(`Could not launch browser: ${launchError.message}`));
    browser.once('exit', (code, signal) => client.close(new Error(`Browser exited unexpectedly (${signal || code}).`)));
    await client.attachToPage();
    const requests = [];
    const exceptions = [];
    client.on('Network.requestWillBeSent', params => requests.push(params.request.url));
    client.on('Runtime.exceptionThrown', params => exceptions.push(params.exceptionDetails.exception?.description || params.exceptionDetails.text));
    await Promise.all([
      client.send('Page.enable'), client.send('Runtime.enable'), client.send('Network.enable'),
    ]);

    const navigate = async route => {
      requests.length = 0;
      exceptions.length = 0;
      const loaded = client.once('Page.loadEventFired');
      await Promise.all([
        client.send('Page.navigate', { url: `http://127.0.0.1:${sitePort}${route}` }),
        loaded,
      ]);
      await wait(150);
      assert.deepEqual(exceptions, [], `${route} raised a browser exception`);
      requests.length = 0;
    };

    const mobile = [];
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
    });
    for (const route of MOBILE_ROUTES) {
      await navigate(route);
      const result = await evaluate(client, `
        const root = document.documentElement;
        const toggle = document.querySelector('.mobile-nav-toggle');
        return {
          viewport: root.clientWidth,
          scrollWidth: root.scrollWidth,
          title: document.title,
          ready: document.readyState,
          toggleVisible: Boolean(toggle) && getComputedStyle(toggle).display !== 'none',
        };
      `);
      assert.equal(result.ready, 'complete', `${route} did not finish loading`);
      assert.ok(result.title, `${route} has no title`);
      assert.ok(result.scrollWidth <= result.viewport + 1, `${route} overflows horizontally: ${result.scrollWidth}px > ${result.viewport}px`);
      assert.equal(result.toggleVisible, true, `${route} mobile navigation toggle is not visible`);
      mobile.push({ route, viewport: result.viewport, scrollWidth: result.scrollWidth });
    }
    await client.send('Emulation.clearDeviceMetricsOverride');

    const jwtStorage = [];
    for (const route of JWT_STORAGE_ROUTES) {
      await navigate('/');
      await evaluate(client, 'localStorage.clear(); return true;');
      await navigate(route);
      const result = await evaluate(client, `
        return {
          keys: Object.keys(localStorage),
          recent: localStorage.getItem('utilcover.recent'),
        };
      `);
      assert.deepEqual(result.keys, [], `${route} created a localStorage entry`);
      assert.equal(result.recent, null, `${route} recorded JWT in recent-tool history`);
      jwtStorage.push({ route, ...result });
    }

    const passwordResults = [];
    const passwordViewports = [
      { name: 'desktop', width: 1280, height: 800, mobile: false },
      { name: 'mobile', width: 390, height: 844, mobile: true },
    ];
    for (const viewport of passwordViewports) {
      await client.send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile,
      });
      for (const route of PASSWORD_RESULT_ROUTES) {
        await navigate(route);
        const result = await evaluate(client, `
          document.querySelector('#generateButton').click();
          await new Promise(resolve => setTimeout(resolve, 800));
          const card = document.querySelector('#resultsCard');
          const bounds = card.getBoundingClientRect();
          return {
            count: document.querySelector('#passwordList').children.length,
            shown: card.classList.contains('show'),
            cardCenter: bounds.top + (bounds.height / 2),
            viewportCenter: innerHeight / 2,
            pageWidth: document.documentElement.scrollWidth,
            viewportWidth: document.documentElement.clientWidth,
          };
        `);
        assert.ok(result.count > 0, `${route} generated no passwords at ${viewport.name} width`);
        assert.equal(result.shown, true, `${route} did not reveal the password results at ${viewport.name} width`);
        assert.ok(Math.abs(result.cardCenter - result.viewportCenter) <= 2,
          `${route} did not center its generated passwords at ${viewport.name} width (${result.cardCenter}px versus ${result.viewportCenter}px)`);
        assert.ok(result.pageWidth <= result.viewportWidth + 1, `${route} overflows horizontally after generation at ${viewport.name} width`);
        passwordResults.push({ route, viewport: viewport.name, ...result });
      }
    }

    await client.send('Emulation.setEmulatedMedia', {
      media: '',
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
    });
    await navigate('/password/');
    const reducedMotionResult = await evaluate(client, `
      document.querySelector('#generateButton').click();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const card = document.querySelector('#resultsCard');
      const bounds = card.getBoundingClientRect();
      return {
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        cardCenter: bounds.top + (bounds.height / 2),
        viewportCenter: innerHeight / 2,
      };
    `);
    assert.equal(reducedMotionResult.reducedMotion, true, 'Reduced-motion emulation did not apply');
    assert.ok(Math.abs(reducedMotionResult.cardCenter - reducedMotionResult.viewportCenter) <= 2,
      'Password results still animate instead of centering immediately when reduced motion is requested');

    await navigate('/password/');
    const invalidGenerationResult = await evaluate(client, `
      window.alert = () => {};
      scrollTo(0, 200);
      const before = scrollY;
      document.querySelector('#passwordLength').value = '0';
      document.querySelector('#generateButton').click();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {
        before,
        after: scrollY,
        shown: document.querySelector('#resultsCard').classList.contains('show'),
      };
    `);
    assert.equal(invalidGenerationResult.shown, false, 'Invalid password input revealed the results');
    assert.equal(invalidGenerationResult.after, invalidGenerationResult.before,
      'Invalid password input initiated scrolling');

    await client.send('Emulation.setEmulatedMedia', { media: '', features: [] });
    await client.send('Emulation.clearDeviceMetricsOverride');
    const privacy = [];
    for (const [route, flow] of Object.entries(PRIVACY_FLOWS)) {
      if (TEXT_DIFF_ROUTES.includes(route)) {
        await navigate('/');
        await evaluate(client, `
          localStorage.clear();
          sessionStorage.clear();
          for (const cookie of document.cookie.split(';')) {
            const name = cookie.split('=')[0].trim();
            if (name) document.cookie = name + '=; Max-Age=0; path=/';
          }
          return true;
        `);
      }
      await navigate(route);
      const result = await evaluate(client, flow);
      if (route === '/json/') assert.match(result.status, /Valid JSON/i, 'JSON privacy flow did not finish');
      if (route === '/password/') assert.ok(result.count > 0, 'Password privacy flow generated no passwords');
      if (route === '/image/') {
        assert.equal(result.previewVisible, true, 'Image privacy flow did not display its local preview');
        assert.match(result.source, /^blob:/, 'Image privacy flow did not use a local Blob URL');
      }
      if (route === '/hash/') assert.match(result.output, /^[0-9a-f]{64}$/i, 'Hash privacy flow produced no SHA-256 digest');
      if (route === '/jwt/') {
        assert.match(result.header, /"alg": "HS256"/, 'JWT privacy flow decoded no header');
        assert.match(result.payload, /"sub": "browser-check"/, 'JWT privacy flow decoded no payload');
      }
      if (TEXT_DIFF_ROUTES.includes(route)) {
        assert.equal(result.added, '2', `${route} reported the wrong added-line count`);
        assert.equal(result.deleted, '2', `${route} reported the wrong deleted-line count`);
        assert.equal(result.changes, '1', `${route} reported the wrong change-block count`);
        assert.ok(result.rows >= 5, `${route} rendered no line diff`);
        const storage = await evaluate(client, `
          return {
            local: Object.keys(localStorage),
            session: Object.keys(sessionStorage),
            cookies: document.cookie,
          };
        `);
        assert.deepEqual(storage.local, [], `${route} created a localStorage entry`);
        assert.deepEqual(storage.session, [], `${route} created a sessionStorage entry`);
        assert.equal(storage.cookies, '', `${route} created a cookie`);
      }
      await wait(100);
      const networkRequests = requests.filter(url => /^https?:\/\//i.test(url));
      const unexpected = networkRequests.filter(url => {
        try { return new URL(url).origin !== `http://127.0.0.1:${sitePort}`; }
        catch { return false; }
      });
      assert.deepEqual(exceptions, [], `${route} interaction raised a browser exception`);
      assert.deepEqual(unexpected, [], `${route} sent data to an external origin: ${unexpected.join(', ')}`);
      assert.equal(networkRequests.length, 0, `${route} made a post-load network request: ${networkRequests.join(', ')}`);
      privacy.push({ route, networkRequests: networkRequests.length, result });
    }

    const textDiffNavigation = [];
    for (const route of TEXT_DIFF_ROUTES) {
      await navigate(route);
      const result = await evaluate(client, `
        const compare = () => {
          document.querySelector('#leftText').value = 'same-0\\nold-1\\nsame-1\\nold-2\\nsame-2\\nold-3\\nsame-3';
          document.querySelector('#rightText').value = 'same-0\\nnew-1\\nsame-1\\nnew-2\\nsame-2\\nnew-3\\nsame-3';
          document.querySelector('#compareText').click();
        };
        const snapshot = () => {
          const anchor = document.querySelector('[aria-current="true"]');
          const index = anchor?.dataset.changeIndex;
          return {
            status: document.querySelector('#diffStatus').textContent,
            index,
            current: anchor?.getAttribute('aria-current'),
            role: anchor?.getAttribute('role'),
            label: anchor?.getAttribute('aria-label'),
            focused: document.activeElement === anchor,
            ariaCurrentCount: document.querySelectorAll('[aria-current="true"]').length,
            selectedRows: document.querySelectorAll('.diff-current').length,
            programmaticRows: document.querySelectorAll('[data-current-block="true"]').length,
            selectedLabels: [...document.querySelectorAll('.diff-current')].map(row => row.getAttribute('aria-label')),
            blockRows: index === undefined ? 0 : document.querySelectorAll('[data-change-index="' + index + '"]').length,
          };
        };
        compare();
        document.querySelector('#nextDifference').click();
        const initialNext = snapshot();
        document.querySelector('#nextDifference').click();
        const secondNext = snapshot();
        const staleFirstRows = document.querySelectorAll('[data-change-index="0"].diff-current').length;
        compare();
        document.querySelector('#previousDifference').click();
        const initialPrevious = snapshot();
        document.querySelector('#nextDifference').click();
        const wrapped = snapshot();
        return { initialNext, secondNext, staleFirstRows, initialPrevious, wrapped };
      `);
      assert.equal(result.initialNext.index, '0', `${route} initial Next did not select the first change`);
      assert.equal(result.initialNext.ariaCurrentCount, 1, `${route} initial Next did not expose exactly one aria-current anchor`);
      assert.equal(result.initialNext.selectedRows, result.initialNext.blockRows, `${route} initial Next did not mark the complete change block`);
      assert.equal(result.initialNext.programmaticRows, result.initialNext.blockRows, `${route} initial Next did not expose the complete block programmatically`);
      assert.equal(result.initialNext.focused, true, `${route} initial Next did not focus the selected change`);
      assert.equal(result.secondNext.index, '1', `${route} second Next did not select the second change`);
      assert.equal(result.secondNext.ariaCurrentCount, 1, `${route} second Next did not keep aria-current unique`);
      assert.equal(result.secondNext.selectedRows, result.secondNext.blockRows, `${route} second Next did not mark the complete change block`);
      assert.equal(result.secondNext.programmaticRows, result.secondNext.blockRows, `${route} second Next did not expose the complete block programmatically`);
      assert.equal(result.staleFirstRows, 0, `${route} second Next left the prior block selected`);
      assert.equal(result.initialPrevious.index, '2', `${route} initial Previous did not select the last change`);
      assert.equal(result.initialPrevious.current, 'true', `${route} selected change lacks aria-current`);
      assert.equal(result.initialPrevious.role, 'group', `${route} selected change lacks a semantic group role`);
      assert.ok(result.initialPrevious.label, `${route} selected change lacks an accessible label`);
      assert.equal(result.initialPrevious.focused, true, `${route} navigation did not focus the selected change`);
      assert.equal(result.initialPrevious.ariaCurrentCount, 1, `${route} initial Previous did not expose exactly one aria-current anchor`);
      assert.equal(result.initialPrevious.selectedRows, result.initialPrevious.blockRows, `${route} initial Previous did not mark the complete change block`);
      assert.equal(result.wrapped.index, '0', `${route} Next did not wrap to the first change`);
      assert.equal(result.wrapped.focused, true, `${route} wrapped navigation did not move focus`);
      assert.equal(result.wrapped.ariaCurrentCount, 1, `${route} wrapped navigation did not keep aria-current unique`);
      if (route.startsWith('/zh/')) {
        assert.ok(result.initialNext.selectedLabels.every(label => label.includes('当前差异')), `${route} selected block labels are not localized`);
        assert.match(result.initialNext.status, /第 1 项差异，共 3 项/, `${route} initial Next status is not localized`);
        assert.match(result.initialPrevious.status, /第 3 项差异，共 3 项/, `${route} previous status is not localized`);
        assert.match(result.wrapped.status, /第 1 项差异，共 3 项/, `${route} wrapped status is not localized`);
      } else {
        assert.ok(result.initialNext.selectedLabels.every(label => label.includes('Current difference')), `${route} selected block labels are incomplete`);
        assert.match(result.initialNext.status, /Change 1 of 3/, `${route} initial Next status is incorrect`);
        assert.match(result.initialPrevious.status, /Change 3 of 3/, `${route} previous status is incorrect`);
        assert.match(result.wrapped.status, /Change 1 of 3/, `${route} wrapped status is incorrect`);
      }
      textDiffNavigation.push({ route, ...result });
    }

    const textDiffHistory = [];
    for (const route of TEXT_DIFF_ROUTES) {
      await navigate(route);
      await evaluate(client, `
        document.querySelector('#leftText').value = 'history-secret-left';
        document.querySelector('#rightText').value = 'history-secret-right';
        document.querySelector('#ignoreCase').checked = true;
        document.querySelector('#compareText').click();
        return true;
      `);
      await navigate('/about/');
      await evaluate(client, 'history.back(); return true;');
      let restored = false;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await wait(50);
        restored = await evaluate(client, `return location.pathname === '${route}';`);
        if (restored) break;
      }
      assert.equal(restored, true, `${route} did not return through browser history`);
      const result = await evaluate(client, `
        return {
          left: document.querySelector('#leftText').value,
          right: document.querySelector('#rightText').value,
          ignoreCase: document.querySelector('#ignoreCase').checked,
          diffRows: document.querySelectorAll('[data-diff-output] .diff-row').length,
          outputText: document.querySelector('[data-diff-output]').textContent,
          copyDisabled: document.querySelector('#copyDiff').disabled,
        };
      `);
      assert.equal(result.left, '', `${route} restored sensitive text from browser history`);
      assert.equal(result.right, '', `${route} restored sensitive text from browser history`);
      assert.equal(result.ignoreCase, false, `${route} restored comparison options from browser history`);
      assert.equal(result.diffRows, 0, `${route} restored rendered diff output from browser history`);
      assert.doesNotMatch(result.outputText, /history-secret/, `${route} restored sensitive diff output from browser history`);
      assert.equal(result.copyDisabled, true, `${route} restored copied-result state from browser history`);
      textDiffHistory.push({ route, ...result });
    }

    const report = {
      browser: executable,
      mobileRoutes: mobile,
      jwtStorage,
      textDiffNavigation,
      textDiffHistory,
      passwordResults,
      privacyFlows: privacy,
      status: 'passed',
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report;
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (client) client.close();
    const cleanupErrors = [];
    const cleanups = [];
    if (browser) cleanups.push(() => stopBrowser(browser));
    if (server) cleanups.push(() => stopServer(server));
    if (profile) cleanups.push(() => removeProfile(profile));
    for (const cleanup of cleanups) {
      try { await cleanup(); }
      catch (error) { cleanupErrors.push(error); }
    }
    if (cleanupErrors.length) {
      const cleanupMessage = cleanupErrors.map(error => error.message).join('; ');
      if (primaryError) console.error(`Cleanup warning: ${cleanupMessage}`);
      else throw new Error(`Browser acceptance cleanup failed: ${cleanupMessage}`);
    }
  }
}

module.exports = {
  CDP_TIMEOUT_MS, MOBILE_ROUTES, PASSWORD_RESULT_ROUTES, JWT_STORAGE_ROUTES, TEXT_DIFF_ROUTES, PRIVACY_FLOWS, CdpClient,
  runAcceptance, startStaticServer, stopBrowser, stopServer, browserBinary,
};

if (require.main === module) {
  runAcceptance().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
