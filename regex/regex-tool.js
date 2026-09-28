'use strict';

const REGEX_TIMEOUT_MS = 500;
const MAX_RENDERED_MATCHES = 200;
const MAX_RENDERED_DETAILS = 1_000;

const REGEX_MESSAGES = {
  ready: { en: 'Ready', zh: '就绪' },
  running: { en: 'Testing pattern locally…', zh: '正在本地测试正则表达式…' },
  complete: { en: '{count} matches found', zh: '找到 {count} 个匹配项' },
  noMatches: { en: 'No matches found', zh: '没有找到匹配项' },
  truncated: { en: 'Showing the first {count} matches; replacement preview is disabled at the match limit', zh: '仅显示前 {count} 个匹配项；达到匹配上限后不生成替换预览' },
  timedOut: { en: 'Pattern stopped after 500 ms to protect this tab', zh: '为保护当前标签页，正则表达式运行 500 毫秒后已停止' },
  invalidPattern: { en: 'The regular expression is invalid', zh: '正则表达式无效' },
  patternTooLarge: { en: 'Pattern must not exceed 2,000 characters', zh: '正则表达式不能超过 2,000 个字符' },
  textTooLarge: { en: 'Test text must not exceed 200,000 characters', zh: '测试文本不能超过 200,000 个字符' },
  replacementTooLarge: { en: 'Replacement must not exceed 2,000 characters', zh: '替换文本不能超过 2,000 个字符' },
  invalidFlags: { en: 'Select only supported flags once', zh: '只能选择受支持且不重复的标志' },
  tooManyCaptures: { en: 'Pattern must not contain more than 50 capture groups', zh: '正则表达式不能包含超过 50 个捕获组' },
  outputTooLarge: { en: 'Replacement output exceeds the 500,000-character limit', zh: '替换结果超过 500,000 个字符限制' },
  resultTooLarge: { en: 'Match and capture output exceeds the 500,000-character limit', zh: '匹配与捕获组结果超过 500,000 个字符限制' },
  failed: { en: 'Regex testing failed', zh: '正则测试失败' },
  copied: { en: 'Replacement result copied', zh: '替换结果已复制' },
  matchesCopied: { en: 'Match results copied', zh: '匹配结果已复制' },
  copyFailed: { en: 'Copy failed', zh: '复制失败' },
  nothingToCopy: { en: 'Run the regex before copying', zh: '请先运行正则表达式再复制' },
  matchPosition: { en: 'Match {current} of {total}', zh: '第 {current} 个匹配，共 {total} 个' },
  emptyMatch: { en: 'empty match', zh: '空匹配' },
  undefinedCapture: { en: 'undefined', zh: '未参与匹配' },
  matchLabel: { en: 'Match {number}, characters {start} to {end}', zh: '第 {number} 个匹配，字符位置 {start} 至 {end}' },
  listLimited: { en: 'The detail list shows the first {count} matches.', zh: '详细列表仅显示前 {count} 个匹配项。' },
  detailsLimited: { en: 'Capture details stop at {count} rows to keep this tab responsive.', zh: '为保持当前标签页响应，捕获组详情最多显示 {count} 行。' },
};

function regexMessage(key, language, values = {}) {
  const locale = String(language).toLowerCase().startsWith('zh') ? 'zh' : 'en';
  return REGEX_MESSAGES[key][locale].replace(/\{(\w+)\}/gu, (_, name) => String(values[name] ?? ''));
}

function attachRegexTool() {
  const language = document.documentElement.lang;
  const patternInput = document.getElementById('patternInput');
  const testText = document.getElementById('testText');
  const replacementInput = document.getElementById('replacementInput');
  const status = document.getElementById('regexStatus');
  const highlightedOutput = document.querySelector('[data-regex-highlighted]');
  const matchList = document.querySelector('[data-regex-matches]');
  const replacementOutput = document.querySelector('[data-regex-replacement]');
  const countOutput = document.querySelector('[data-regex-count]');
  const copyMatchesButton = document.getElementById('copyMatches');
  const copyButton = document.getElementById('copyReplacement');
  const previousButton = document.getElementById('previousMatch');
  const nextButton = document.getElementById('nextMatch');
  const flagInputs = [...document.querySelectorAll('[data-regex-flag]')];
  if (!patternInput || !testText || !replacementInput || !status || !highlightedOutput || !matchList || !replacementOutput || !countOutput || !copyMatchesButton || !copyButton || !previousButton || !nextButton) return;

  let activeWorker = null;
  let activeTimer = null;
  let activeJob = 0;
  let currentMatch = -1;
  let matchMarks = [];
  let lastReplacement = null;
  let lastMatchesText = '';

  const stopWorker = () => {
    if (activeTimer !== null) window.clearTimeout(activeTimer);
    activeTimer = null;
    if (activeWorker) activeWorker.terminate();
    activeWorker = null;
  };

  const setStatus = (message, state = '') => {
    status.textContent = message;
    status.dataset.state = state;
  };

  const clearResults = () => {
    highlightedOutput.replaceChildren();
    matchList.replaceChildren();
    replacementOutput.textContent = '';
    countOutput.textContent = '0';
    currentMatch = -1;
    matchMarks = [];
    lastReplacement = null;
    lastMatchesText = '';
    copyMatchesButton.disabled = true;
    copyButton.disabled = true;
    previousButton.disabled = true;
    nextButton.disabled = true;
  };

  const selectedFlags = () => flagInputs.filter(input => input.checked).map(input => input.value).join('');

  const createMark = (match, index) => {
    const mark = document.createElement('mark');
    mark.className = 'regex-match';
    mark.dataset.matchIndex = String(index);
    mark.tabIndex = -1;
    mark.textContent = match.value || '∅';
    mark.setAttribute('aria-label', regexMessage('matchLabel', language, {
      number: index + 1,
      start: match.index,
      end: match.end,
    }));
    if (!match.value) mark.classList.add('regex-empty-match');
    return mark;
  };

  const renderHighlighted = (text, matches) => {
    highlightedOutput.replaceChildren();
    matchMarks = [];
    let cursor = 0;
    matches.forEach((match, index) => {
      if (match.index > cursor) highlightedOutput.appendChild(document.createTextNode(text.slice(cursor, match.index)));
      const mark = createMark(match, index);
      highlightedOutput.appendChild(mark);
      matchMarks.push(mark);
      cursor = Math.max(cursor, match.end);
    });
    if (cursor < text.length) highlightedOutput.appendChild(document.createTextNode(text.slice(cursor)));
    if (text === '' && matches.length === 0) highlightedOutput.textContent = '';
  };

  const appendDetail = (container, label, value) => {
    const row = document.createElement('div');
    row.className = 'regex-detail-row';
    const name = document.createElement('span');
    name.textContent = label;
    const code = document.createElement('code');
    code.textContent = value ?? '';
    row.append(name, code);
    container.appendChild(row);
  };

  const displayCapture = value => value === undefined ? regexMessage('undefinedCapture', language) : value;

  const renderMatchList = matches => {
    matchList.replaceChildren();
    let detailCount = 0;
    let detailsLimited = false;
    for (const [index, match] of matches.slice(0, MAX_RENDERED_MATCHES).entries()) {
      if (detailCount >= MAX_RENDERED_DETAILS) { detailsLimited = true; break; }
      const card = document.createElement('article');
      card.className = 'regex-match-card';
      const heading = document.createElement('h3');
      heading.textContent = `#${index + 1} · ${match.index}–${match.end}`;
      card.appendChild(heading);
      const details = [
        [language.startsWith('zh') ? '匹配' : 'Match', match.value || regexMessage('emptyMatch', language)],
        ...match.captures.map((capture, captureIndex) => [`$${captureIndex + 1}`, displayCapture(capture)]),
        ...Object.entries(match.groups).map(([name, value]) => [name, displayCapture(value)]),
      ];
      for (const [label, value] of details) {
        if (detailCount >= MAX_RENDERED_DETAILS) { detailsLimited = true; break; }
        appendDetail(card, label, value);
        detailCount += 1;
      }
      matchList.appendChild(card);
      if (detailsLimited) break;
    }
    if (matches.length > MAX_RENDERED_MATCHES) {
      const note = document.createElement('p');
      note.className = 'regex-list-note';
      note.textContent = regexMessage('listLimited', language, { count: MAX_RENDERED_MATCHES });
      matchList.appendChild(note);
    }
    if (detailsLimited) {
      const note = document.createElement('p');
      note.className = 'regex-list-note';
      note.textContent = regexMessage('detailsLimited', language, { count: MAX_RENDERED_DETAILS });
      matchList.appendChild(note);
    }
  };

  const formatMatchesForCopy = matches => matches.map((match, index) => {
    const lines = [`#${index + 1} [${match.index}–${match.end}] ${match.value || regexMessage('emptyMatch', language)}`];
    match.captures.forEach((capture, captureIndex) => lines.push(`$${captureIndex + 1}: ${displayCapture(capture)}`));
    for (const [name, value] of Object.entries(match.groups)) lines.push(`${name}: ${displayCapture(value)}`);
    return lines.join('\n');
  }).join('\n\n');

  const renderResult = result => {
    renderHighlighted(testText.value, result.matches.slice(0, MAX_RENDERED_MATCHES));
    renderMatchList(result.matches);
    countOutput.textContent = String(result.matches.length);
    lastMatchesText = formatMatchesForCopy(result.matches);
    lastReplacement = result.replacement;
    replacementOutput.textContent = result.replacement ?? '';
    copyMatchesButton.disabled = result.matches.length === 0;
    copyButton.disabled = result.replacement === null;
    previousButton.disabled = result.matches.length === 0;
    nextButton.disabled = result.matches.length === 0;
    if (result.truncated) setStatus(regexMessage('truncated', language, { count: result.matches.length }), 'warning');
    else if (result.matches.length === 0) setStatus(regexMessage('noMatches', language), 'success');
    else setStatus(regexMessage('complete', language, { count: result.matches.length }), 'success');
  };

  const errorMessage = code => ({
    'invalid-pattern': 'invalidPattern',
    'pattern-too-large': 'patternTooLarge',
    'text-too-large': 'textTooLarge',
    'replacement-too-large': 'replacementTooLarge',
    'invalid-flags': 'invalidFlags',
    'too-many-captures': 'tooManyCaptures',
    'output-too-large': 'outputTooLarge',
    'result-too-large': 'resultTooLarge',
  }[code] || 'failed');

  const run = () => {
    stopWorker();
    clearResults();
    const request = {
      pattern: patternInput.value,
      text: testText.value,
      flags: selectedFlags(),
      replacement: replacementInput.value,
    };
    try {
      globalThis.RegexEngine.validateRegexRequest(request);
    } catch (error) {
      setStatus(regexMessage(errorMessage(error.code), language), 'error');
      return;
    }

    const job = ++activeJob;
    setStatus(regexMessage('running', language), 'working');
    const worker = new Worker('/regex/regex-worker.js');
    activeWorker = worker;
    activeTimer = window.setTimeout(() => {
      if (job !== activeJob) return;
      stopWorker();
      clearResults();
      setStatus(regexMessage('timedOut', language), 'error');
    }, REGEX_TIMEOUT_MS);

    worker.addEventListener('message', event => {
      if (event.data?.id !== job || worker !== activeWorker) return;
      stopWorker();
      if (event.data.ok) renderResult(event.data.result);
      else setStatus(regexMessage(errorMessage(event.data.error?.code), language), 'error');
    });
    worker.addEventListener('error', () => {
      if (worker !== activeWorker) return;
      stopWorker();
      clearResults();
      setStatus(regexMessage('failed', language), 'error');
    });
    worker.postMessage({ id: job, action: 'analyze', request });
  };

  const navigate = direction => {
    if (matchMarks.length === 0) return;
    const previous = matchMarks[currentMatch];
    if (previous) {
      previous.classList.remove('regex-current');
      previous.removeAttribute('aria-current');
    }
    currentMatch = currentMatch < 0
      ? (direction < 0 ? matchMarks.length - 1 : 0)
      : (currentMatch + direction + matchMarks.length) % matchMarks.length;
    const target = matchMarks[currentMatch];
    target.classList.add('regex-current');
    target.setAttribute('aria-current', 'true');
    target.scrollIntoView({ block: 'center' });
    target.focus({ preventScroll: true });
    setStatus(regexMessage('matchPosition', language, { current: currentMatch + 1, total: matchMarks.length }), 'success');
  };

  const clearSensitiveState = () => {
    activeJob += 1;
    stopWorker();
    patternInput.value = '';
    testText.value = '';
    replacementInput.value = '';
    flagInputs.forEach(input => { input.checked = input.value === 'g'; });
    clearResults();
    setStatus(regexMessage('ready', language));
  };

  document.getElementById('runRegex').addEventListener('click', run);
  document.getElementById('clearRegex').addEventListener('click', () => {
    clearSensitiveState();
    patternInput.focus();
  });
  document.getElementById('regexExample').addEventListener('click', () => {
    patternInput.value = '(?<name>[A-Za-z]+)\\s+(?<email>[\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,})';
    testText.value = 'Alice alice@example.com\nBob bob@example.net';
    replacementInput.value = '$<email> ($<name>)';
    flagInputs.forEach(input => { input.checked = input.value === 'g' || input.value === 'i'; });
    run();
  });
  previousButton.addEventListener('click', () => navigate(-1));
  nextButton.addEventListener('click', () => navigate(1));
  copyMatchesButton.addEventListener('click', async () => {
    if (!lastMatchesText) {
      setStatus(regexMessage('nothingToCopy', language), 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(lastMatchesText);
      setStatus(regexMessage('matchesCopied', language), 'success');
    } catch {
      setStatus(regexMessage('copyFailed', language), 'error');
    }
  });
  copyButton.addEventListener('click', async () => {
    if (lastReplacement === null) {
      setStatus(regexMessage('nothingToCopy', language), 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(lastReplacement);
      setStatus(regexMessage('copied', language), 'success');
    } catch {
      setStatus(regexMessage('copyFailed', language), 'error');
    }
  });
  window.addEventListener('pagehide', clearSensitiveState);
  window.addEventListener('pageshow', event => {
    if (event.persisted) clearSensitiveState();
  });
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', attachRegexTool);
if (typeof module !== 'undefined' && module.exports) module.exports = { MAX_RENDERED_DETAILS, MAX_RENDERED_MATCHES, REGEX_TIMEOUT_MS, regexMessage };
