'use strict';

const MESSAGES = {
  ready: { en: 'Choose a direction, paste data, then convert.', zh: '选择转换方向并粘贴数据，然后开始转换。' },
  working: { en: 'Converting locally…', zh: '正在本地转换…' },
  empty: { en: 'Enter CSV or JSON data first.', zh: '请先输入 CSV 或 JSON 数据。' },
  inputInvalid: { en: 'Input must be text.', zh: '输入内容必须是文本。' },
  tooLarge: { en: 'Input exceeds the 250,000-character limit.', zh: '输入超过 250,000 个字符的限制。' },
  recordLimit: { en: 'Conversion exceeds the 10,000-record limit.', zh: '转换内容超过 10,000 条记录的限制。' },
  columnLimit: { en: 'Conversion exceeds the 256-column limit.', zh: '转换内容超过 256 列的限制。' },
  cellLimit: { en: 'Conversion exceeds the 20,000-cell limit.', zh: '转换内容超过 20,000 个单元格的限制。' },
  outputLimit: { en: 'Output exceeds the 500,000-character limit.', zh: '输出超过 500,000 个字符的限制。' },
  delimiterInvalid: { en: 'Choose comma or tab as the delimiter.', zh: '请选择逗号或制表符作为分隔符。' },
  headerEmpty: { en: 'Header names cannot be empty.', zh: '表头名称不能为空。' },
  headerDuplicate: { en: 'Header names must be unique.', zh: '表头名称必须唯一。' },
  rowWidthMismatch: { en: 'Each CSV record must have the same number of fields.', zh: '每条 CSV 记录的字段数必须一致。' },
  unclosedQuote: { en: 'Unclosed quoted field', zh: '引用字段未闭合' },
  quoteInField: { en: 'A quote may only begin at the start of a field.', zh: '双引号只能出现在字段的开头。' },
  charAfterQuote: { en: 'Only a delimiter or line break may follow a closing quote.', zh: '结束引号后只能出现分隔符或换行。' },
  jsonInvalid: { en: 'JSON is invalid. Check its syntax.', zh: 'JSON 格式无效，请检查语法。' },
  jsonArrayRequired: { en: 'JSON input must be an array of objects.', zh: 'JSON 输入必须是对象数组。' },
  jsonRowObjectRequired: { en: 'Every JSON array item must be an object.', zh: 'JSON 数组中的每一项都必须是对象。' },
  jsonDuplicateKey: { en: 'JSON object property names must be unique.', zh: 'JSON 对象属性名不能重复。' },
  nestedValueUnsupported: { en: 'Nested JSON arrays or objects are not supported.', zh: '不支持嵌套的 JSON 数组或对象。' },
  jsonNoColumns: { en: 'JSON objects must contain at least one property.', zh: 'JSON 对象必须至少包含一个属性。' },
  jsonDepthLimit: { en: 'JSON nesting exceeds the 100-level limit.', zh: 'JSON 嵌套超过 100 层的限制。' },
  other: { en: 'Could not safely convert this input.', zh: '无法安全转换此输入。' },
  csvSuccess: { en: 'Converted {count} data records to JSON. Every CSV cell remains a string.', zh: '已将 {count} 条数据记录转换为 JSON。所有 CSV 单元格均保留为字符串。' },
  jsonSuccess: { en: 'Converted {count} JSON objects to CSV. Numeric source text is preserved.', zh: '已将 {count} 个 JSON 对象转换为 CSV，并保留数字的原始文本。' },
  cleared: { en: 'Input and output cleared.', zh: '已清除输入和输出。' },
  copied: { en: 'Result copied.', zh: '已复制结果。' },
  copyFailed: { en: 'Clipboard access is unavailable in this browser.', zh: '此浏览器无法访问剪贴板。' },
};

const ERROR_KEYS = {
  INPUT_INVALID: 'inputInvalid',
  EMPTY_INPUT: 'empty',
  INPUT_TOO_LARGE: 'tooLarge',
  RECORD_LIMIT: 'recordLimit',
  COLUMN_LIMIT: 'columnLimit',
  CELL_LIMIT: 'cellLimit',
  OUTPUT_TOO_LARGE: 'outputLimit',
  DELIMITER_INVALID: 'delimiterInvalid',
  HEADER_EMPTY: 'headerEmpty',
  HEADER_DUPLICATE: 'headerDuplicate',
  ROW_WIDTH_MISMATCH: 'rowWidthMismatch',
  UNCLOSED_QUOTE: 'unclosedQuote',
  QUOTE_IN_UNQUOTED_FIELD: 'quoteInField',
  CHAR_AFTER_QUOTE: 'charAfterQuote',
  JSON_INVALID: 'jsonInvalid',
  JSON_ARRAY_REQUIRED: 'jsonArrayRequired',
  JSON_ROW_OBJECT_REQUIRED: 'jsonRowObjectRequired',
  JSON_DUPLICATE_KEY: 'jsonDuplicateKey',
  NESTED_VALUE_UNSUPPORTED: 'nestedValueUnsupported',
  JSON_NO_COLUMNS: 'jsonNoColumns',
  JSON_DEPTH_LIMIT: 'jsonDepthLimit',
};

const COORDINATE_ERRORS = new Set(['UNCLOSED_QUOTE', 'QUOTE_IN_UNQUOTED_FIELD', 'CHAR_AFTER_QUOTE']);
const ROW_ERRORS = new Set(['ROW_WIDTH_MISMATCH', 'JSON_ROW_OBJECT_REQUIRED', 'JSON_DUPLICATE_KEY', 'NESTED_VALUE_UNSUPPORTED', 'HEADER_EMPTY']);
const EXAMPLE_CSV = 'name,code,note\r\nAda,007,"said ""hello, world"""\r\nLin,042,"first line\r\nsecond line"';
const EXAMPLE_JSON = '[{"name":"Ada","code":7,"active":true},{"name":"Lin","code":42,"active":false}]';

function languageCode(language) {
  return String(language).toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function renderCsvError(error, language = 'en') {
  const lang = languageCode(language);
  const code = error?.code;
  const key = ERROR_KEYS[code] || 'other';
  const message = MESSAGES[key][lang];
  if (COORDINATE_ERRORS.has(code) && Number.isInteger(error?.row) && error.row > 0) {
    if (Number.isInteger(error.column) && error.column > 0) {
      const location = lang === 'zh'
        ? `（第 ${error.row} 行，第 ${error.column} 列）`
        : ` (line ${error.row}, column ${error.column})`;
      const guidance = lang === 'zh' ? '请检查双引号转义和字段边界。' : 'Check doubled quotes and field boundaries.';
      return lang === 'zh'
        ? `${message}${location}。${guidance}`
        : `${message}${location}. ${guidance}`;
    }
  }
  if (ROW_ERRORS.has(code) && Number.isInteger(error?.row) && error.row > 0) {
    const location = lang === 'zh' ? `（第 ${error.row} 条记录）` : ` (record ${error.row})`;
    return `${message}${location}`;
  }
  return message;
}

function countText(value, language) {
  const locale = language === 'zh' ? 'zh-CN' : 'en-US';
  return new Intl.NumberFormat(locale).format(value);
}

export function attachCsvTool(engine) {
  if (!engine || typeof document === 'undefined') return;
  const language = languageCode(document.documentElement.lang);
  const input = document.getElementById('csvInput');
  const output = document.getElementById('csvOutput');
  const mode = document.getElementById('csvMode');
  const delimiterSelect = document.getElementById('csvDelimiter');
  const headerCheckbox = document.getElementById('csvHeader');
  const headerRow = document.getElementById('csvHeaderRow');
  const inputLabel = document.getElementById('csvInputLabel');
  const outputLabel = document.getElementById('csvOutputLabel');
  const modeHelp = document.getElementById('csvModeHelp');
  const status = document.getElementById('csvStatus');
  const runButton = document.getElementById('runCsv');
  const clearButton = document.getElementById('clearCsv');
  const exampleButton = document.getElementById('csvExample');
  const copyButton = document.getElementById('copyCsv');
  if (![input, output, mode, delimiterSelect, headerCheckbox, headerRow, inputLabel, outputLabel, modeHelp, status, runButton, clearButton, exampleButton, copyButton].every(Boolean)) return;

  const setStatus = (message, state = 'ready') => {
    status.textContent = message;
    status.dataset.state = state;
  };
  const resetOutput = () => {
    output.value = '';
    copyButton.disabled = true;
  };
  const updateModeText = () => {
    const csvToJson = mode.value === 'csv-to-json';
    inputLabel.textContent = csvToJson ? (language === 'zh' ? 'CSV / TSV 输入' : 'CSV / TSV input') : (language === 'zh' ? 'JSON 输入' : 'JSON input');
    outputLabel.textContent = csvToJson ? (language === 'zh' ? 'JSON 输出' : 'JSON output') : (language === 'zh' ? 'CSV / TSV 输出' : 'CSV / TSV output');
    modeHelp.textContent = csvToJson
      ? (language === 'zh' ? 'CSV 单元格会作为字符串处理；不会猜测数字或布尔值。' : 'CSV cells stay strings; numbers and booleans are not inferred.')
      : (language === 'zh' ? '仅支持扁平对象数组；嵌套值会明确报错。' : 'Flat object arrays only; nested values return an explicit error.');
    headerRow.hidden = !csvToJson;
    input.placeholder = csvToJson
      ? (language === 'zh' ? 'name,code\nAda,007' : 'name,code\nAda,007')
      : '[{"name":"Ada","code":7}]';
    output.placeholder = csvToJson
      ? (language === 'zh' ? 'JSON 结果将在此显示。' : 'JSON result appears here.')
      : (language === 'zh' ? 'CSV / TSV 结果将在此显示。' : 'CSV / TSV result appears here.');
  };
  const clearTransientState = () => {
    input.value = '';
    output.value = '';
    mode.value = 'csv-to-json';
    delimiterSelect.value = 'comma';
    headerCheckbox.checked = true;
    updateModeText();
    resetOutput();
    setStatus(MESSAGES.ready[language]);
  };
  const run = () => {
    resetOutput();
    setStatus(MESSAGES.working[language], 'working');
    const delimiter = delimiterSelect.value === 'tab' ? '\t' : ',';
    try {
      const result = mode.value === 'json-to-csv'
        ? engine.jsonToCsv(input.value, { delimiter })
        : engine.csvToJson(input.value, { delimiter, firstRowIsHeader: headerCheckbox.checked });
      output.value = result.output;
      copyButton.disabled = result.output.length === 0;
      const count = countText(result.rowCount, language);
      const success = mode.value === 'json-to-csv' ? MESSAGES.jsonSuccess[language] : MESSAGES.csvSuccess[language];
      setStatus(success.replace('{count}', count), 'success');
    } catch (error) {
      resetOutput();
      setStatus(renderCsvError(error, language), 'error');
    }
  };

  runButton.addEventListener('click', run);
  input.addEventListener('input', () => { resetOutput(); setStatus(MESSAGES.ready[language]); });
  mode.addEventListener('change', () => { updateModeText(); resetOutput(); setStatus(MESSAGES.ready[language]); });
  delimiterSelect.addEventListener('change', () => { resetOutput(); setStatus(MESSAGES.ready[language]); });
  headerCheckbox.addEventListener('change', () => { resetOutput(); setStatus(MESSAGES.ready[language]); });
  exampleButton.addEventListener('click', () => {
    input.value = mode.value === 'json-to-csv' ? EXAMPLE_JSON : EXAMPLE_CSV;
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
  updateModeText();
  setStatus(MESSAGES.ready[language]);
}

export { EXAMPLE_CSV, EXAMPLE_JSON, MESSAGES };
