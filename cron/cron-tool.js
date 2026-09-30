'use strict';

const MESSAGES = {
  ready: { en: 'Enter a five-field cron expression to see its schedule.', zh: '输入五字段 Cron 表达式以查看运行时间。' },
  working: { en: 'Calculating upcoming times…', zh: '正在计算接下来的运行时间…' },
  complete: { en: 'Upcoming run times calculated locally.', zh: '已在本地计算后续运行时间。' },
  invalid: { en: 'Check the expression, timezone, and field limits.', zh: '请检查表达式、时区和字段范围。' },
  noTimes: { en: 'No matching run time was found within the six-year search window.', zh: '未来六年的搜索范围内没有找到匹配的运行时间。' },
  cleared: { en: 'Expression and results cleared.', zh: '已清除表达式和结果。' },
};
const FIELD_LABELS = {
  minute: { en: 'Minute', zh: '分钟' }, hour: { en: 'Hour', zh: '小时' }, dayOfMonth: { en: 'Day of month', zh: '日期' },
  month: { en: 'Month', zh: '月份' }, dayOfWeek: { en: 'Day of week', zh: '星期' },
};
const FIELD_RANGES = { minute: '0–59', hour: '0–23', dayOfMonth: '1–31', month: '1–12', dayOfWeek: '0–7 (Sun = 0 or 7)' };
const FIELD_RANGES_ZH = { minute: '0–59', hour: '0–23', dayOfMonth: '1–31', month: '1–12', dayOfWeek: '0–7（周日为 0 或 7）' };

function attachCronTool() {
  if (!globalThis.UtilCoverCron) return;
  const language = String(document.documentElement.lang).toLowerCase().startsWith('zh') ? 'zh' : 'en';
  const expressionInput = document.getElementById('cronExpression');
  const timezoneInput = document.getElementById('cronTimezone');
  const status = document.getElementById('cronStatus');
  const fieldsBody = document.getElementById('cronFieldsBody');
  const nextList = document.getElementById('cronNextList');
  if (!expressionInput || !timezoneInput || !status || !fieldsBody || !nextList) return;
  const setStatus = (key, state = 'ready') => { status.textContent = MESSAGES[key][language]; status.dataset.state = state; };
  const addCell = (row, text, className = '') => {
    const cell = document.createElement('td');
    if (className) cell.className = className;
    cell.textContent = text;
    row.append(cell);
  };
  const clearResults = () => { fieldsBody.replaceChildren(); nextList.replaceChildren(); };
  document.getElementById('runCron').addEventListener('click', () => {
    clearResults();
    setStatus('working', 'working');
    try {
      const expression = globalThis.UtilCoverCron.parseCron(expressionInput.value);
      const zone = timezoneInput.value.trim() || 'UTC';
      const occurrences = globalThis.UtilCoverCron.nextCronOccurrences(expression.expression, { from: Date.now(), timeZone: zone, count: 5 });
      const sourceFields = expression.expression.split(/\s+/);
      const keys = ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'];
      for (const [index, key] of keys.entries()) {
        const row = document.createElement('tr');
        addCell(row, FIELD_LABELS[key][language]);
        addCell(row, sourceFields[index], 'cron-value');
        const selected = sourceFields[index] === '*' ? (language === 'zh' ? '全部' : 'All') : [...expression[key].values].sort((a, b) => a - b).join(', ');
        addCell(row, selected || '—', 'cron-value');
        addCell(row, language === 'zh' ? FIELD_RANGES_ZH[key] : FIELD_RANGES[key]);
        fieldsBody.append(row);
      }
      const formatter = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
        timeZone: zone, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
      });
      for (const occurrence of occurrences) {
        const item = document.createElement('li');
        item.textContent = `${formatter.format(new Date(occurrence.milliseconds))} · ${occurrence.iso}`;
        nextList.append(item);
      }
      setStatus('complete', 'success');
    } catch (error) {
      clearResults();
      setStatus(error instanceof RangeError && /No further occurrences/i.test(error.message) ? 'noTimes' : 'invalid', 'error');
    }
  });
  document.getElementById('clearCron').addEventListener('click', () => {
    expressionInput.value = '';
    clearResults();
    setStatus('cleared', 'ready');
    expressionInput.focus();
  });
  document.querySelectorAll('[data-cron-example]').forEach(button => button.addEventListener('click', () => {
    expressionInput.value = button.dataset.cronExample || '';
    document.getElementById('runCron').click();
  }));
  const clearTransientState = () => {
    expressionInput.value = '';
    clearResults();
    setStatus('cleared', 'ready');
  };
  window.addEventListener('pagehide', clearTransientState);
  window.addEventListener('pageshow', event => { if (event.persisted) clearTransientState(); });
  setStatus('ready');
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', attachCronTool);
if (typeof module !== 'undefined' && module.exports) module.exports = { MESSAGES, FIELD_LABELS };
