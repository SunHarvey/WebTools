'use strict';

const unit = (label, symbol, scale, offset = 0) => ({ label, symbol, scale, offset });

const UNIT_CATEGORIES = {
  length: {
    label: 'Length · 长度',
    units: {
      meter: unit('Meter · 米', 'm', 1), kilometer: unit('Kilometer · 千米', 'km', 1000),
      centimeter: unit('Centimeter · 厘米', 'cm', 0.01), millimeter: unit('Millimeter · 毫米', 'mm', 0.001),
      mile: unit('Mile · 英里', 'mi', 1609.344), yard: unit('Yard · 码', 'yd', 0.9144),
      foot: unit('Foot · 英尺', 'ft', 0.3048), inch: unit('Inch · 英寸', 'in', 0.0254),
      nauticalMile: unit('Nautical mile · 海里', 'nmi', 1852),
    },
  },
  mass: {
    label: 'Mass · 质量',
    units: {
      kilogram: unit('Kilogram · 千克', 'kg', 1), gram: unit('Gram · 克', 'g', 0.001),
      milligram: unit('Milligram · 毫克', 'mg', 1e-6), tonne: unit('Metric tonne · 公吨', 't', 1000),
      pound: unit('Pound · 磅', 'lb', 0.45359237), ounce: unit('Ounce · 盎司', 'oz', 0.028349523125),
      stone: unit('Stone · 英石', 'st', 6.35029318),
    },
  },
  temperature: {
    label: 'Temperature · 温度',
    units: {
      celsius: unit('Celsius · 摄氏度', '°C', 1, 0),
      fahrenheit: unit('Fahrenheit · 华氏度', '°F', 5 / 9, -32 * 5 / 9),
      kelvin: unit('Kelvin · 开尔文', 'K', 1, -273.15),
    },
  },
  area: {
    label: 'Area · 面积',
    units: {
      squareMeter: unit('Square meter · 平方米', 'm²', 1), squareKilometer: unit('Square kilometer · 平方千米', 'km²', 1e6),
      squareCentimeter: unit('Square centimeter · 平方厘米', 'cm²', 1e-4), hectare: unit('Hectare · 公顷', 'ha', 10000),
      acre: unit('Acre · 英亩', 'ac', 4046.8564224), squareFoot: unit('Square foot · 平方英尺', 'ft²', 0.09290304),
      squareInch: unit('Square inch · 平方英寸', 'in²', 0.00064516),
    },
  },
  volume: {
    label: 'Volume · 体积',
    units: {
      liter: unit('Liter · 升', 'L', 1), milliliter: unit('Milliliter · 毫升', 'mL', 0.001),
      cubicMeter: unit('Cubic meter · 立方米', 'm³', 1000), cubicCentimeter: unit('Cubic centimeter · 立方厘米', 'cm³', 0.001),
      gallonUS: unit('US gallon · 美制加仑', 'gal', 3.785411784), quartUS: unit('US quart · 美制夸脱', 'qt', 0.946352946),
      cupUS: unit('US cup · 美制杯', 'cup', 0.2365882365), fluidOunceUS: unit('US fluid ounce · 美制液盎司', 'fl oz', 0.0295735295625),
    },
  },
  data: {
    label: 'Data size · 数据大小',
    units: {
      bit: unit('Bit · 位', 'bit', 0.125), byte: unit('Byte · 字节', 'B', 1),
      kilobyte: unit('Kilobyte · 千字节 (10³)', 'kB', 1000), megabyte: unit('Megabyte · 兆字节 (10⁶)', 'MB', 1e6),
      gigabyte: unit('Gigabyte · 吉字节 (10⁹)', 'GB', 1e9), terabyte: unit('Terabyte · 太字节 (10¹²)', 'TB', 1e12),
      kibibyte: unit('Kibibyte · 二进制千字节', 'KiB', 1024), mebibyte: unit('Mebibyte · 二进制兆字节', 'MiB', 1048576),
      gibibyte: unit('Gibibyte · 二进制吉字节', 'GiB', 1073741824), tebibyte: unit('Tebibyte · 二进制太字节', 'TiB', 1099511627776),
    },
  },
};

function convertValue(categoryKey, value, fromKey, toKey) {
  const category = UNIT_CATEGORIES[categoryKey];
  if (!category) throw new RangeError('Choose a valid category.');
  const text = typeof value === 'string' ? value.trim() : value;
  if (text === '') throw new TypeError('Enter a number.');
  const numeric = Number(text);
  if (!Number.isFinite(numeric)) throw new TypeError('Enter a finite number.');
  const from = category.units[fromKey];
  const to = category.units[toKey];
  if (!from || !to) throw new RangeError('Choose units from the selected category.');
  const baseValue = numeric * from.scale + from.offset;
  const result = (baseValue - to.offset) / to.scale;
  // Remove insignificant IEEE-754 residue while retaining useful precision.
  return Number(result.toPrecision(15));
}

function expandExponential(text) {
  if (!/[eE]/.test(text)) return text;
  const [coefficient, exponentText] = text.toLowerCase().split('e');
  const exponent = Number(exponentText);
  const negative = coefficient.startsWith('-');
  const digits = coefficient.replace('-', '').replace('.', '');
  const decimalIndex = coefficient.replace('-', '').indexOf('.') < 0
    ? digits.length : coefficient.replace('-', '').indexOf('.');
  const target = decimalIndex + exponent;
  let expanded;
  if (target <= 0) expanded = `0.${'0'.repeat(-target)}${digits}`;
  else if (target >= digits.length) expanded = digits + '0'.repeat(target - digits.length);
  else expanded = `${digits.slice(0, target)}.${digits.slice(target)}`;
  return negative ? `-${expanded}` : expanded;
}

function formatResult(value) {
  if (!Number.isFinite(value)) throw new TypeError('Result must be finite.');
  if (Object.is(value, -0) || value === 0) return '0';
  if (Number.isSafeInteger(value)) return String(value);
  const rounded = Number(value.toPrecision(12));
  return expandExponential(String(rounded));
}

function attachUnitTool() {
  const categorySelect = document.getElementById('unitCategory');
  const valueInput = document.getElementById('unitValue');
  const fromSelect = document.getElementById('fromUnit');
  const toSelect = document.getElementById('toUnit');
  const resultOutput = document.getElementById('unitResult');
  const resultUnit = document.getElementById('resultUnit');
  const status = document.getElementById('unitStatus');
  const convertButton = document.getElementById('convertUnit');
  const swapButton = document.getElementById('swapUnits');
  if (!categorySelect || !valueInput || !fromSelect || !toSelect || !resultOutput || !resultUnit || !status || !convertButton || !swapButton) return;

  const option = (key, definition) => {
    const item = document.createElement('option');
    item.value = key;
    item.textContent = `${definition.label} (${definition.symbol})`;
    return item;
  };
  const populateUnits = () => {
    const units = UNIT_CATEGORIES[categorySelect.value].units;
    fromSelect.replaceChildren(...Object.entries(units).map(([key, definition]) => option(key, definition)));
    toSelect.replaceChildren(...Object.entries(units).map(([key, definition]) => option(key, definition)));
    toSelect.selectedIndex = Math.min(1, toSelect.options.length - 1);
  };
  const render = () => {
    try {
      const result = convertValue(categorySelect.value, valueInput.value, fromSelect.value, toSelect.value);
      resultOutput.value = formatResult(result);
      resultUnit.textContent = UNIT_CATEGORIES[categorySelect.value].units[toSelect.value].symbol;
      status.textContent = 'Converted · 换算完成';
      status.dataset.state = 'success';
    } catch (error) {
      resultOutput.value = '';
      resultUnit.textContent = '';
      status.textContent = `${error instanceof Error ? error.message : 'Conversion failed'} · 请输入有效数值`;
      status.dataset.state = 'error';
    }
  };

  for (const [key, category] of Object.entries(UNIT_CATEGORIES)) {
    const item = document.createElement('option');
    item.value = key;
    item.textContent = category.label;
    categorySelect.append(item);
  }
  categorySelect.addEventListener('change', () => { populateUnits(); render(); });
  convertButton.addEventListener('click', render);
  valueInput.addEventListener('input', render);
  fromSelect.addEventListener('change', render);
  toSelect.addEventListener('change', render);
  swapButton.addEventListener('click', () => {
    const previousFrom = fromSelect.value;
    fromSelect.value = toSelect.value;
    toSelect.value = previousFrom;
    render();
  });
  populateUnits();
  render();
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', attachUnitTool);
if (typeof module !== 'undefined' && module.exports) module.exports = { UNIT_CATEGORIES, convertValue, formatResult };
