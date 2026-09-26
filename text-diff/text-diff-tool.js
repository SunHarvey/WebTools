'use strict';

const MAX_DIFF_CHARACTERS = 200_000;
const MAX_DIFF_LINES = 3_000;
const MAX_DIFF_TOTAL_LINES = 3_000;
const MAX_DIFF_WORK = 2_000_000;

const DIFF_MESSAGES = {
  ready: { en: 'Ready', zh: '就绪' },
  compared: { en: 'Comparison complete', zh: '比较完成' },
  identical: { en: 'The texts are identical under the selected options', zh: '在当前选项下，两段文本完全相同' },
  failed: { en: 'Text comparison failed', zh: '文本比较失败' },
  copied: { en: 'Diff copied', zh: '差异结果已复制' },
  copyFailed: { en: 'Copy failed', zh: '复制失败' },
  nothingToCopy: { en: 'Compare text before copying', zh: '请先比较文本再复制' },
  noChanges: { en: 'No differences to navigate', zh: '没有可导航的差异' },
  changePosition: { en: 'Change {current} of {total}', zh: '第 {current} 项差异，共 {total} 项' },
  currentDifference: { en: 'Current difference', zh: '当前差异' },
  addedLine: { en: 'Added line {line}', zh: '新增第 {line} 行' },
  deletedLine: { en: 'Deleted line {line}', zh: '删除第 {line} 行' },
  unchangedLine: { en: 'Unchanged line {line}', zh: '未改变的第 {line} 行' },
};

function diffMessage(key, language, values = {}) {
  const locale = String(language).toLowerCase().startsWith('zh') ? 'zh' : 'en';
  return DIFF_MESSAGES[key][locale].replace(/\{(\w+)\}/gu, (_, name) => String(values[name] ?? ''));
}

function validateInput(value, label) {
  const text = String(value ?? '');
  if (text.length > MAX_DIFF_CHARACTERS) throw new RangeError(`${label} text is too large.`);
  const lines = text === '' ? 0 : (text.match(/\r\n|\r|\n/gu)?.length || 0) + 1;
  if (lines > MAX_DIFF_LINES) throw new RangeError(`${label} text has too many lines.`);
  return text;
}

function splitLines(value) {
  return value === '' ? [] : value.replace(/\r\n?/gu, '\n').split('\n');
}

function normalizeLine(line, options) {
  let value = line;
  if (options.ignoreWhitespace) value = value.trim().replace(/\s+/gu, ' ');
  if (options.ignoreCase) value = value.toLowerCase();
  return value;
}

function lcsLengths(left, right) {
  let previous = new Uint32Array(right.length + 1);
  let current = new Uint32Array(right.length + 1);
  for (const leftValue of left) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = leftValue === right[rightIndex - 1]
        ? previous[rightIndex - 1] + 1
        : Math.max(previous[rightIndex], current[rightIndex - 1]);
    }
    [previous, current] = [current, previous];
    current.fill(0);
  }
  return previous;
}

function lcsMatches(left, right, leftOffset = 0, rightOffset = 0) {
  if (left.length === 0 || right.length === 0) return [];
  if (left.length === 1) {
    const rightIndex = right.indexOf(left[0]);
    return rightIndex === -1 ? [] : [[leftOffset, rightOffset + rightIndex]];
  }

  const midpoint = Math.floor(left.length / 2);
  const leftScores = lcsLengths(left.slice(0, midpoint), right);
  const rightScores = lcsLengths(
    left.slice(midpoint).reverse(),
    right.slice().reverse(),
  );
  let split = 0;
  let best = -1;
  for (let index = 0; index <= right.length; index += 1) {
    const score = leftScores[index] + rightScores[right.length - index];
    if (score > best) {
      best = score;
      split = index;
    }
  }
  return [
    ...lcsMatches(left.slice(0, midpoint), right.slice(0, split), leftOffset, rightOffset),
    ...lcsMatches(left.slice(midpoint), right.slice(split), leftOffset + midpoint, rightOffset + split),
  ];
}

function compareLines(leftValue, rightValue, options = {}) {
  const leftText = validateInput(leftValue, 'Left');
  const rightText = validateInput(rightValue, 'Right');
  const leftLines = splitLines(leftText);
  const rightLines = splitLines(rightText);
  if (leftLines.length + rightLines.length > MAX_DIFF_TOTAL_LINES) {
    throw new RangeError('The comparison has too many total lines.');
  }
  if (leftLines.length * rightLines.length > MAX_DIFF_WORK) {
    throw new RangeError('The comparison is too complex to process safely.');
  }
  const settings = {
    ignoreCase: Boolean(options.ignoreCase),
    ignoreWhitespace: Boolean(options.ignoreWhitespace),
  };
  const leftKeys = leftLines.map(line => normalizeLine(line, settings));
  const rightKeys = rightLines.map(line => normalizeLine(line, settings));
  const matches = lcsMatches(leftKeys, rightKeys);
  const rows = [];
  let leftIndex = 0;
  let rightIndex = 0;

  const appendGaps = (leftEnd, rightEnd) => {
    while (leftIndex < leftEnd && rightIndex < rightEnd) {
      rows.push({ type: 'delete', left: leftLines[leftIndex], right: null, leftNumber: leftIndex + 1, rightNumber: null });
      leftIndex += 1;
      rows.push({ type: 'insert', left: null, right: rightLines[rightIndex], leftNumber: null, rightNumber: rightIndex + 1 });
      rightIndex += 1;
    }
    while (leftIndex < leftEnd) {
      rows.push({ type: 'delete', left: leftLines[leftIndex], right: null, leftNumber: leftIndex + 1, rightNumber: null });
      leftIndex += 1;
    }
    while (rightIndex < rightEnd) {
      rows.push({ type: 'insert', left: null, right: rightLines[rightIndex], leftNumber: null, rightNumber: rightIndex + 1 });
      rightIndex += 1;
    }
  };

  for (const [matchedLeft, matchedRight] of matches) {
    appendGaps(matchedLeft, matchedRight);
    rows.push({
      type: 'equal',
      left: leftLines[matchedLeft],
      right: rightLines[matchedRight],
      leftNumber: matchedLeft + 1,
      rightNumber: matchedRight + 1,
    });
    leftIndex = matchedLeft + 1;
    rightIndex = matchedRight + 1;
  }
  appendGaps(leftLines.length, rightLines.length);
  return rows;
}

function summarizeDiff(rows) {
  let added = 0;
  let deleted = 0;
  let unchanged = 0;
  let changes = 0;
  let insideChange = false;
  for (const row of rows) {
    if (row.type === 'insert') added += 1;
    else if (row.type === 'delete') deleted += 1;
    else unchanged += 1;
    if (row.type === 'equal') insideChange = false;
    else if (!insideChange) {
      changes += 1;
      insideChange = true;
    }
  }
  return { added, deleted, unchanged, changes, identical: added === 0 && deleted === 0 };
}

function formatDiffText(rows) {
  return rows.map(row => {
    if (row.type === 'insert') return `+ ${row.right}`;
    if (row.type === 'delete') return `- ${row.left}`;
    return `  ${row.left}`;
  }).join('\n');
}

function nextChangeIndex(current, total, direction) {
  if (total <= 0) return -1;
  if (current < 0) return direction < 0 ? total - 1 : 0;
  return (current + direction + total) % total;
}

function attachTextDiffTool() {
  const language = document.documentElement.lang;
  const leftInput = document.getElementById('leftText');
  const rightInput = document.getElementById('rightText');
  const output = document.querySelector('[data-diff-output]');
  const status = document.getElementById('diffStatus');
  const copyButton = document.getElementById('copyDiff');
  if (!leftInput || !rightInput || !output || !status || !copyButton) return;

  const summaryElements = Object.fromEntries(['added', 'deleted', 'unchanged', 'changes'].map(key => [key, document.querySelector(`[data-diff-summary="${key}"]`)]));
  let lastRows = null;
  let changeTargets = [];
  let currentChange = -1;

  const setSummary = summary => {
    for (const [key, element] of Object.entries(summaryElements)) if (element) element.textContent = String(summary[key]);
  };

  const clearOutput = () => {
    output.replaceChildren();
    lastRows = null;
    changeTargets = [];
    currentChange = -1;
    setSummary({ added: 0, deleted: 0, unchanged: 0, changes: 0 });
    copyButton.disabled = true;
  };

  const clearSensitiveState = () => {
    leftInput.value = '';
    rightInput.value = '';
    document.getElementById('ignoreCase').checked = false;
    document.getElementById('ignoreWhitespace').checked = false;
    clearOutput();
    status.textContent = diffMessage('ready', language);
    status.dataset.state = '';
  };

  const createCell = (className, number, text) => {
    const cell = document.createElement('div');
    cell.className = className;
    const lineNumber = document.createElement('span');
    lineNumber.className = 'diff-line-number';
    lineNumber.textContent = number === null ? '' : String(number);
    const content = document.createElement('code');
    content.textContent = text ?? '';
    cell.append(lineNumber, content);
    return cell;
  };

  const render = rows => {
    output.replaceChildren();
    changeTargets = [];
    currentChange = -1;
    let insideChange = false;
    let changeIndex = -1;
    for (const row of rows) {
      if (row.type === 'equal') insideChange = false;
      else if (!insideChange) {
        changeIndex += 1;
        insideChange = true;
      }
      const item = document.createElement('div');
      item.className = `diff-row diff-${row.type}`;
      item.setAttribute('role', 'group');
      const labelKey = row.type === 'insert' ? 'addedLine' : (row.type === 'delete' ? 'deletedLine' : 'unchangedLine');
      const rowLabel = diffMessage(labelKey, language, { line: row.rightNumber ?? row.leftNumber });
      item.dataset.baseLabel = rowLabel;
      item.setAttribute('aria-label', rowLabel);
      if (row.type !== 'equal') {
        item.dataset.changeIndex = String(changeIndex);
        item.tabIndex = -1;
        if (!changeTargets[changeIndex]) changeTargets[changeIndex] = [];
        changeTargets[changeIndex].push(item);
      }
      item.append(
        createCell('diff-cell diff-left', row.leftNumber, row.left),
        createCell('diff-cell diff-right', row.rightNumber, row.right),
      );
      output.appendChild(item);
    }
    if (rows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'diff-empty';
      empty.textContent = diffMessage('identical', language);
      output.appendChild(empty);
    }
  };

  const compare = () => {
    try {
      const rows = compareLines(leftInput.value, rightInput.value, {
        ignoreCase: document.getElementById('ignoreCase').checked,
        ignoreWhitespace: document.getElementById('ignoreWhitespace').checked,
      });
      const summary = summarizeDiff(rows);
      lastRows = rows;
      render(rows);
      setSummary(summary);
      copyButton.disabled = false;
      status.textContent = diffMessage(summary.identical ? 'identical' : 'compared', language);
      status.dataset.state = 'success';
    } catch (error) {
      clearOutput();
      status.textContent = String(language).toLowerCase().startsWith('zh')
        ? diffMessage('failed', language)
        : (error instanceof Error ? error.message : diffMessage('failed', language));
      status.dataset.state = 'error';
    }
  };

  const navigate = direction => {
    if (changeTargets.length === 0) {
      status.textContent = diffMessage('noChanges', language);
      return;
    }
    const previous = changeTargets[currentChange] || [];
    for (const row of previous) {
      row.classList.remove('diff-current');
      row.removeAttribute('data-current-block');
      row.removeAttribute('aria-current');
      row.setAttribute('aria-label', row.dataset.baseLabel);
    }
    currentChange = nextChangeIndex(currentChange, changeTargets.length, direction);
    const block = changeTargets[currentChange];
    const currentLabel = diffMessage('currentDifference', language);
    const currentLabelSeparator = String(language).toLowerCase().startsWith('zh') ? '，' : '. ';
    for (const row of block) {
      row.classList.add('diff-current');
      row.dataset.currentBlock = 'true';
      row.setAttribute('aria-label', `${row.dataset.baseLabel}${currentLabelSeparator}${currentLabel}`);
    }
    const target = block[0];
    target.setAttribute('aria-current', 'true');
    target.scrollIntoView({ block: 'center' });
    target.focus({ preventScroll: true });
    status.textContent = diffMessage('changePosition', language, { current: currentChange + 1, total: changeTargets.length });
  };

  document.getElementById('compareText').addEventListener('click', compare);
  document.getElementById('swapText').addEventListener('click', () => {
    [leftInput.value, rightInput.value] = [rightInput.value, leftInput.value];
    clearOutput();
    status.textContent = diffMessage('ready', language);
    status.dataset.state = '';
  });
  document.getElementById('clearDiff').addEventListener('click', () => {
    clearSensitiveState();
    leftInput.focus();
  });
  document.getElementById('previousDifference').addEventListener('click', () => navigate(-1));
  document.getElementById('nextDifference').addEventListener('click', () => navigate(1));
  copyButton.addEventListener('click', async () => {
    if (!lastRows) {
      status.textContent = diffMessage('nothingToCopy', language);
      return;
    }
    try {
      await navigator.clipboard.writeText(formatDiffText(lastRows));
      status.textContent = diffMessage('copied', language);
      status.dataset.state = 'success';
    } catch {
      status.textContent = diffMessage('copyFailed', language);
      status.dataset.state = 'error';
    }
  });
  window.addEventListener('pagehide', clearSensitiveState);
  window.addEventListener('pageshow', event => {
    if (event.persisted) clearSensitiveState();
  });
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', attachTextDiffTool);
if (typeof module !== 'undefined' && module.exports) module.exports = {
  MAX_DIFF_CHARACTERS,
  MAX_DIFF_LINES,
  MAX_DIFF_TOTAL_LINES,
  MAX_DIFF_WORK,
  compareLines,
  diffMessage,
  formatDiffText,
  nextChangeIndex,
  summarizeDiff,
};
