'use strict';

const MESSAGES = {
  ready: { en: 'Paste one YAML document or JSON value to begin.', zh: '粘贴一个 YAML 文档或 JSON 值以开始。' },
  yamlInputLabel: { en: 'YAML input', zh: 'YAML 输入' },
  jsonInputLabel: { en: 'JSON input', zh: 'JSON 输入' },
  successFormat: { en: 'YAML formatted locally.', zh: '已在本地格式化 YAML。' },
  successYamlJson: { en: 'YAML converted to JSON locally.', zh: '已在本地将 YAML 转换为 JSON。' },
  successJsonYaml: { en: 'JSON converted to YAML locally.', zh: '已在本地将 JSON 转换为 YAML。' },
  errorYaml: { en: 'Invalid YAML', zh: 'YAML 格式无效' },
  errorJson: { en: 'Invalid JSON input.', zh: 'JSON 输入无效。' },
  errorEmpty: { en: 'Enter one document first.', zh: '请先输入一个文档。' },
  errorInput: { en: 'Input exceeds the 250,000-character limit.', zh: '输入超过 250,000 个字符的限制。' },
  errorNodes: { en: 'Document exceeds the 20,000-value limit.', zh: '文档超过 20,000 个值的限制。' },
  errorDepth: { en: 'Document exceeds the 100-level nesting limit.', zh: '文档超过 100 层嵌套限制。' },
  errorNonFinite: { en: 'Non-finite numbers such as Infinity and NaN are not supported.', zh: '不支持 Infinity（无穷大）和 NaN（非数值）。' },
  errorOther: { en: 'Could not safely convert this document.', zh: '无法安全转换此文档。' },
  cleared: { en: 'Input and output cleared.', zh: '已清除输入和输出。' },
  copied: { en: 'Result copied.', zh: '已复制结果。' },
  copyFailed: { en: 'Clipboard access is unavailable in this browser.', zh: '此浏览器无法访问剪贴板。' },
};

const EXAMPLES = {
  yaml: 'service: utilcover\nenabled: true\nretries: 3\nlabels:\n  - private\n  - local\n',
  json: '{\n  "service": "utilcover",\n  "enabled": true,\n  "retries": 3\n}\n',
};

export function attachYamlTool(engine) {
  if (!engine) return;

  const language = String(document.documentElement.lang).toLowerCase().startsWith('zh') ? 'zh' : 'en';
  const input = document.getElementById('yamlInput');
  const inputLabel = document.getElementById('yamlInputLabel');
  const output = document.getElementById('yamlOutput');
  const mode = document.getElementById('yamlMode');
  const status = document.getElementById('yamlStatus');
  const runButton = document.getElementById('runYaml');
  const clearButton = document.getElementById('clearYaml');
  const exampleButton = document.getElementById('yamlExample');
  const copyButton = document.getElementById('copyYaml');
  if (!input || !inputLabel || !output || !mode || !status || !runButton || !clearButton || !exampleButton || !copyButton) return;

  const setStatus = (message, state = 'ready') => {
    status.textContent = message;
    status.dataset.state = state;
  };
  const updateInputLabel = () => {
    inputLabel.textContent = MESSAGES[mode.value === 'json-to-yaml' ? 'jsonInputLabel' : 'yamlInputLabel'][language];
  };
  const resetOutput = () => {
    output.value = '';
    copyButton.disabled = true;
  };
  const clearTransientState = () => {
    input.value = '';
    resetOutput();
    mode.value = 'format-yaml';
    updateInputLabel();
    setStatus(MESSAGES.ready[language]);
  };
  const renderError = error => {
    if (error.code === 'YAML_PARSE_ERROR') {
      if (language === 'zh') {
        const location = Number.isInteger(error.line) && Number.isInteger(error.column)
          ? `（第 ${error.line} 行，第 ${error.column} 列）`
          : '';
        return `YAML 格式无效${location}。请检查缩进、冒号、括号及映射键。`;
      }
      const location = Number.isInteger(error.line) && Number.isInteger(error.column)
        ? ` (line ${error.line}, column ${error.column})`
        : '';
      return `${MESSAGES.errorYaml[language]}${location}: ${error.message}`;
    }
    const key = {
      EMPTY_DOCUMENT: 'errorEmpty',
      INPUT_TOO_LARGE: 'errorInput',
      NODE_LIMIT: 'errorNodes',
      DEPTH_LIMIT: 'errorDepth',
      NON_FINITE_NUMBER: 'errorNonFinite',
      JSON_PARSE_ERROR: 'errorJson',
    }[error.code] || 'errorOther';
    return MESSAGES[key][language];
  };

  runButton.addEventListener('click', () => {
    resetOutput();
    setStatus(language === 'zh' ? '正在本地处理…' : 'Processing locally…', 'working');
    try {
      let result;
      let message;
      if (mode.value === 'format-yaml') {
        result = engine.formatYaml(input.value);
        message = MESSAGES.successFormat[language];
      } else if (mode.value === 'yaml-to-json') {
        result = engine.yamlToJson(input.value);
        message = MESSAGES.successYamlJson[language];
      } else if (mode.value === 'json-to-yaml') {
        result = engine.jsonToYaml(input.value);
        message = MESSAGES.successJsonYaml[language];
      } else {
        throw new Error('Unsupported conversion mode.');
      }
      output.value = result;
      copyButton.disabled = result.length === 0;
      setStatus(message, 'success');
    } catch (error) {
      resetOutput();
      setStatus(renderError(error), 'error');
    }
  });

  input.addEventListener('input', () => {
    resetOutput();
    setStatus(MESSAGES.ready[language]);
  });
  mode.addEventListener('change', () => {
    resetOutput();
    updateInputLabel();
    setStatus(MESSAGES.ready[language]);
  });
  exampleButton.addEventListener('click', () => {
    input.value = mode.value === 'json-to-yaml' ? EXAMPLES.json : EXAMPLES.yaml;
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
  updateInputLabel();
  setStatus(MESSAGES.ready[language]);
}

export { MESSAGES, EXAMPLES };
