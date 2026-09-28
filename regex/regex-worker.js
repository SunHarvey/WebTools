'use strict';

importScripts('/regex/regex-engine.js');

self.addEventListener('message', event => {
  const id = event.data?.id;
  if (!Number.isSafeInteger(id) || event.data?.action !== 'analyze') return;
  try {
    const result = self.RegexEngine.analyzeRegex(event.data.request || {});
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    const code = error?.code || (error instanceof SyntaxError ? 'invalid-pattern' : 'failed');
    self.postMessage({ id, ok: false, error: { code } });
  }
});
