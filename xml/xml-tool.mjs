'use strict';

const MESSAGES = {
  ready: { en: 'Paste one complete XML document to begin.', zh: '粘贴一个完整 XML 文档以开始。' },
  working: { en: 'Processing XML locally…', zh: '正在本地处理 XML…' },
  formatSuccess: { en: 'XML formatted and rechecked locally.', zh: '已在本地格式化并重新校验 XML。' },
  validateSuccess: { en: 'XML is well-formed. No formatted output was generated.', zh: 'XML 文档格式良构。仅校验模式不会生成格式化输出。' },
  empty: { en: 'Enter one XML document first.', zh: '请先输入一个 XML 文档。' },
  tooLarge: { en: 'Input exceeds the 250,000-character limit.', zh: '输入超过 250,000 个字符的限制。' },
  nodeLimit: { en: 'Document exceeds the 20,000-node limit.', zh: '文档超过 20,000 个节点的限制。' },
  depthLimit: { en: 'Document exceeds the 100-level nesting limit.', zh: '文档超过 100 层嵌套限制。' },
  outputLimit: { en: 'Formatted output exceeds the 500,000-character limit.', zh: '格式化输出超过 500,000 个字符的限制。' },
  doctype: { en: 'DOCTYPE and DTD declarations are not supported.', zh: '不支持 DOCTYPE 和 DTD 声明。' },
  malformed: { en: 'XML is not well-formed', zh: 'XML 格式不正确' },
  serialize: { en: 'The formatter output could not pass XML validation.', zh: '格式化结果未能通过 XML 校验。' },
  unavailable: { en: 'This browser does not provide the required XML APIs.', zh: '此浏览器未提供所需的 XML API。' },
  other: { en: 'Could not safely process this XML document.', zh: '无法安全处理此 XML 文档。' },
  cleared: { en: 'Input and output cleared.', zh: '已清除输入和输出。' },
  copied: { en: 'Formatted XML copied.', zh: '已复制格式化后的 XML。' },
  copyFailed: { en: 'Clipboard access is unavailable in this browser.', zh: '此浏览器无法访问剪贴板。' },
};

const EXAMPLE = '<?xml version="1.0" encoding="UTF-8"?>\n<service><name>utilcover</name><enabled>true</enabled><items><item>local</item><item>private</item></items></service>';

export function attachXmlTool(engine) {
  if (!engine || typeof document === 'undefined') return;
  const language = String(document.documentElement.lang).toLowerCase().startsWith('zh') ? 'zh' : 'en';
  const input = document.getElementById('xmlInput');
  const output = document.getElementById('xmlOutput');
  const mode = document.getElementById('xmlMode');
  const status = document.getElementById('xmlStatus');
  const runButton = document.getElementById('runXml');
  const clearButton = document.getElementById('clearXml');
  const exampleButton = document.getElementById('xmlExample');
  const copyButton = document.getElementById('copyXml');
  if (!input || !output || !mode || !status || !runButton || !clearButton || !exampleButton || !copyButton) return;

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
    resetOutput();
    mode.value = 'format-xml';
    setStatus(MESSAGES.ready[language]);
  };
  const renderError = error => {
    if (error?.code === 'MALFORMED_XML') {
      const location = Number.isInteger(error.line) && Number.isInteger(error.column)
        ? (language === 'zh' ? `（第 ${error.line} 行，第 ${error.column} 列）` : ` (line ${error.line}, column ${error.column})`)
        : '';
      const guidance = language === 'zh'
        ? '请检查 XML 标签、属性和实体引用。'
        : 'Check the document tags, attributes, and entity references.';
      return `${MESSAGES.malformed[language]}${location}${language === 'zh' ? '。' : '.'} ${guidance}`;
    }
    const key = ({
      EMPTY_INPUT: 'empty',
      INPUT_TOO_LARGE: 'tooLarge',
      NODE_LIMIT: 'nodeLimit',
      DEPTH_LIMIT: 'depthLimit',
      OUTPUT_TOO_LARGE: 'outputLimit',
      DOCTYPE_UNSUPPORTED: 'doctype',
      SERIALIZE_ERROR: 'serialize',
      PLATFORM_UNAVAILABLE: 'unavailable',
    })[error?.code] || 'other';
    return MESSAGES[key][language];
  };

  runButton.addEventListener('click', () => {
    resetOutput();
    setStatus(MESSAGES.working[language], 'working');
    try {
      if (mode.value === 'format-xml') {
        output.value = engine.formatXml(input.value);
        copyButton.disabled = output.value.length === 0;
        setStatus(MESSAGES.formatSuccess[language], 'success');
      } else if (mode.value === 'validate-xml') {
        engine.validateXml(input.value);
        setStatus(MESSAGES.validateSuccess[language], 'success');
      } else {
        setStatus(MESSAGES.other[language], 'error');
      }
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
    setStatus(MESSAGES.ready[language]);
  });
  exampleButton.addEventListener('click', () => {
    input.value = EXAMPLE;
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

export { EXAMPLE, MESSAGES };