'use strict';

const MESSAGES = {
  ready: { en: 'Paste SQL, choose a dialect and style, then run locally.', zh: '粘贴 SQL，选择方言与样式，然后在本地处理。' },
  working: { en: 'Processing locally…', zh: '正在本地处理…' },
  empty: { en: 'Enter SQL text first.', zh: '请先输入 SQL。' },
  inputInvalid: { en: 'Input must be SQL text.', zh: '输入内容必须是 SQL 文本。' },
  inputTooLarge: { en: 'SQL input exceeds the 250,000-character limit.', zh: 'SQL 输入超过 250,000 个字符的限制。' },
  tokenLimit: { en: 'SQL input exceeds the 50,000-token limit.', zh: 'SQL 输入超过 50,000 个词法单元的限制。' },
  depthLimit: { en: 'Nested parentheses exceed the 100-level limit.', zh: '括号嵌套超过 100 层的限制。' },
  outputTooLarge: { en: 'Output exceeds the 500,000-character limit.', zh: '输出超过 500,000 个字符的限制。' },
  dialectInvalid: { en: 'Choose PostgreSQL, MySQL, or SQLite.', zh: '请选择 PostgreSQL、MySQL 或 SQLite。' },
  optionInvalid: { en: 'Choose one of the listed formatting options.', zh: '请选择列表中的格式选项。' },
  unclosedString: { en: 'A quoted value or identifier was not closed.', zh: '带引号的值或标识符未闭合。' },
  unclosedComment: { en: 'A block comment was not closed.', zh: '块注释未闭合。' },
  other: { en: 'Could not safely process this SQL input.', zh: '无法安全处理此 SQL 输入。' },
  formatSuccess: { en: 'SQL formatted locally. Syntax is not validated or executed.', zh: '已在本地格式化 SQL；不会验证或执行语法。' },
  minifySuccess: { en: 'SQL whitespace compacted locally. Comments and quoted values are preserved.', zh: '已在本地压缩 SQL 空白；注释和带引号的值均会保留。' },
  cleared: { en: 'Input and output cleared.', zh: '已清除输入和输出。' },
  copied: { en: 'Output copied.', zh: '已复制输出。' },
  copyFailed: { en: 'Clipboard access is unavailable in this browser.', zh: '此浏览器无法访问剪贴板。' },
};

const ERROR_KEYS = {
  EMPTY_INPUT: 'empty',
  INPUT_INVALID: 'inputInvalid',
  INPUT_TOO_LARGE: 'inputTooLarge',
  TOKEN_LIMIT: 'tokenLimit',
  DEPTH_LIMIT: 'depthLimit',
  OUTPUT_TOO_LARGE: 'outputTooLarge',
  DIALECT_INVALID: 'dialectInvalid',
  OPTION_INVALID: 'optionInvalid',
  UNCLOSED_STRING: 'unclosedString',
  UNCLOSED_COMMENT: 'unclosedComment',
};
const COORDINATE_ERRORS = new Set(['UNCLOSED_STRING', 'UNCLOSED_COMMENT']);

function languageCode(language) {
  return String(language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function renderSqlError(error, language = 'en') {
  const lang = languageCode(language);
  const message = MESSAGES[ERROR_KEYS[error?.code] || 'other'][lang];
  if (COORDINATE_ERRORS.has(error?.code) && Number.isInteger(error?.line) && error.line > 0
    && Number.isInteger(error?.column) && error.column > 0) {
    const location = lang === 'zh'
      ? `（第 ${error.line} 行，第 ${error.column} 列）`
      : ` (line ${error.line}, column ${error.column})`;
    return `${message}${location}`;
  }
  return message;
}

function exampleFor(dialect) {
  if (dialect === 'mysql') return 'SELECT `id`, `name` FROM `users` WHERE `enabled` = 1 LIMIT 20;';
  if (dialect === 'sqlite') return 'SELECT [id], [name] FROM [users] WHERE [enabled] = 1;';
  return 'WITH active_users AS (SELECT id, name FROM users WHERE enabled = TRUE) SELECT id, name FROM active_users ORDER BY name;';
}

export function attachSqlTool(engine) {
  if (!engine || typeof document === 'undefined') return;
  const language = languageCode(document.documentElement.lang);
  const input = document.getElementById('sqlInput');
  const output = document.getElementById('sqlOutput');
  const mode = document.getElementById('sqlMode');
  const dialect = document.getElementById('sqlDialect');
  const keywordCase = document.getElementById('sqlKeywordCase');
  const indent = document.getElementById('sqlIndent');
  const status = document.getElementById('sqlStatus');
  const runButton = document.getElementById('runSql');
  const clearButton = document.getElementById('clearSql');
  const exampleButton = document.getElementById('sqlExample');
  const copyButton = document.getElementById('copySql');
  if (![input, output, mode, dialect, keywordCase, indent, status, runButton, clearButton, exampleButton, copyButton].every(Boolean)) return;

  const setStatus = (message, state = 'ready') => {
    status.textContent = message;
    status.dataset.state = state;
  };
  const resetOutput = () => {
    output.value = '';
    copyButton.disabled = true;
  };
  const clearTransientState = () => {
    input.value = '';
    output.value = '';
    mode.value = 'format';
    dialect.value = 'postgres';
    keywordCase.value = 'upper';
    indent.value = '2';
    resetOutput();
    setStatus(MESSAGES.ready[language]);
  };
  const run = () => {
    resetOutput();
    setStatus(MESSAGES.working[language], 'working');
    try {
      const options = {
        dialect: dialect.value,
        keywordCase: keywordCase.value,
        indent: Number(indent.value),
      };
      const result = mode.value === 'minify'
        ? engine.minifySql(input.value, options)
        : engine.formatSql(input.value, options);
      output.value = result;
      copyButton.disabled = result.length === 0;
      setStatus(MESSAGES[mode.value === 'minify' ? 'minifySuccess' : 'formatSuccess'][language], 'success');
    } catch (error) {
      resetOutput();
      setStatus(renderSqlError(error, language), 'error');
    }
  };

  runButton.addEventListener('click', run);
  input.addEventListener('input', () => { resetOutput(); setStatus(MESSAGES.ready[language]); });
  for (const control of [mode, dialect, keywordCase, indent]) {
    control.addEventListener('change', () => { resetOutput(); setStatus(MESSAGES.ready[language]); });
  }
  exampleButton.addEventListener('click', () => {
    input.value = exampleFor(dialect.value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  });
  clearButton.addEventListener('click', () => {
    clearTransientState();
    setStatus(MESSAGES.cleared[language]);
    input.focus();
  });
  copyButton.addEventListener('click', async () => {
    if (!output.value) return;
    try {
      await navigator.clipboard.writeText(output.value);
      setStatus(MESSAGES.copied[language], 'success');
    } catch {
      setStatus(MESSAGES.copyFailed[language], 'error');
    }
  });
  input.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') runButton.click();
  });
  window.addEventListener('pagehide', clearTransientState);
  window.addEventListener('pageshow', event => {
    if (event.persisted) clearTransientState();
  });
  setStatus(MESSAGES.ready[language]);
}

export { ERROR_KEYS, MESSAGES };
