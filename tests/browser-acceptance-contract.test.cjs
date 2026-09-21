'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');

const root = path.resolve(__dirname, '..');

test('browser acceptance covers every required EN and ZH mobile route', () => {
  const acceptance = require(path.join(root, 'scripts/browser-acceptance.cjs'));
  assert.deepEqual(acceptance.MOBILE_ROUTES, [
    '/', '/zh/',
    '/json/', '/zh/json/',
    '/image/', '/zh/image/',
    '/qr/', '/zh/qr/',
    '/timestamp/', '/zh/timestamp/',
    '/uuid/', '/zh/uuid/',
  ]);
});

test('browser acceptance exercises all privacy-critical tools', () => {
  const acceptance = require(path.join(root, 'scripts/browser-acceptance.cjs'));
  assert.deepEqual(Object.keys(acceptance.PRIVACY_FLOWS), [
    '/json/', '/password/', '/image/', '/hash/',
  ]);
});

test('browser acceptance centers generated passwords in both locales', () => {
  const acceptance = require(path.join(root, 'scripts/browser-acceptance.cjs'));
  assert.deepEqual(acceptance.PASSWORD_RESULT_ROUTES, ['/password/', '/zh/password/']);
});

test('package exposes the durable browser acceptance command', () => {
  const packageJson = require(path.join(root, 'package.json'));
  assert.equal(packageJson.scripts['check:browser'], 'node scripts/browser-acceptance.cjs');
});

test('CDP uses the Node 18 compatible pipe transport with bounded commands', async () => {
  const acceptance = require(path.join(root, 'scripts/browser-acceptance.cjs'));
  const input = new PassThrough();
  const output = new PassThrough();
  const client = new acceptance.CdpClient(input, output, 20);
  await assert.rejects(client.send('Runtime.enable', {}, null), /timed out.*Runtime\.enable/i);
  client.close();
  const source = require('node:fs').readFileSync(path.join(root, 'scripts/browser-acceptance.cjs'), 'utf8');
  assert.match(source, /--remote-debugging-pipe/);
  assert.doesNotMatch(source, /new WebSocket/);
});

test('closing the CDP pipe rejects pending commands and events without hanging', async () => {
  const acceptance = require(path.join(root, 'scripts/browser-acceptance.cjs'));
  const input = new PassThrough();
  const output = new PassThrough();
  const client = new acceptance.CdpClient(input, output, 1_000);
  const pending = Promise.all([
    client.send('Page.navigate', {}, null),
    client.once('Page.loadEventFired'),
  ]);
  input.end();
  await assert.rejects(pending, /pipe closed/i);
  const source = fs.readFileSync(path.join(root, 'scripts/browser-acceptance.cjs'), 'utf8');
  assert.match(source, /Promise\.all\(\[\s*client\.send\('Page\.navigate'[\s\S]*loaded,[\s\S]*\]\)/);
});

test('browser cleanup waits for the child process to exit', async () => {
  const acceptance = require(path.join(root, 'scripts/browser-acceptance.cjs'));
  class FakeChild extends EventEmitter {
    constructor() { super(); this.exitCode = null; this.signalCode = null; }
    kill(signal) {
      setTimeout(() => {
        this.signalCode = signal;
        this.emit('exit', null, signal);
      }, 20);
      return true;
    }
  }
  const child = new FakeChild();
  await acceptance.stopBrowser(child);
  assert.equal(child.signalCode, 'SIGTERM');
});

test('acceptance server rejects NUL-containing paths', async () => {
  const acceptance = require(path.join(root, 'scripts/browser-acceptance.cjs'));
  const { server, port } = await acceptance.startStaticServer();
  try {
    const status = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/%00`, response => {
        response.resume();
        response.on('end', () => resolve(response.statusCode));
      }).on('error', reject);
    });
    assert.equal(status, 400);
  } finally {
    await acceptance.stopServer(server);
  }
});

test('browser discovery rejects missing and non-executable binaries before launch', () => {
  const acceptance = require(path.join(root, 'scripts/browser-acceptance.cjs'));
  assert.throws(() => acceptance.browserBinary(['/definitely/missing/utilcover-browser']), /No executable Chromium browser/i);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'utilcover-nonexec-'));
  const filename = path.join(directory, 'browser');
  try {
    fs.writeFileSync(filename, '#!/bin/sh\nexit 1\n', { mode: 0o600 });
    assert.throws(() => acceptance.browserBinary([filename]), /No executable Chromium browser/i);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('failed browser launch rejects promptly and cleans its temporary profile', async () => {
  const acceptance = require(path.join(root, 'scripts/browser-acceptance.cjs'));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'utilcover-failing-browser-'));
  const filename = path.join(directory, 'browser');
  const previousBrowser = process.env.BROWSER_BIN;
  const previousTmpdir = process.env.TMPDIR;
  const profiles = () => fs.readdirSync(directory).filter(name => name.startsWith('utilcover-browser-'));
  try {
    fs.writeFileSync(filename, '#!/bin/sh\nexit 1\n', { mode: 0o700 });
    process.env.BROWSER_BIN = filename;
    process.env.TMPDIR = directory;
    await assert.rejects(acceptance.runAcceptance(), error => error instanceof Error);
    assert.deepEqual(profiles(), []);
  } finally {
    if (previousBrowser === undefined) delete process.env.BROWSER_BIN;
    else process.env.BROWSER_BIN = previousBrowser;
    if (previousTmpdir === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previousTmpdir;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
