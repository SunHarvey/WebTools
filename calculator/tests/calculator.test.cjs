const assert = require('node:assert/strict');
const test = require('node:test');
const { CalculatorEngine } = require('../calculator.js');

function enter(engine, value) {
  for (const character of value) engine.handleKey(character);
}

test('starts at zero and accepts keyboard digits and decimal point', () => {
  const calculator = new CalculatorEngine();
  enter(calculator, '12.5');
  assert.equal(calculator.displayValue, '12.5');
});

test('performs basic arithmetic from keyboard input', () => {
  const cases = [
    ['12+7=', '19'],
    ['12-7=', '5'],
    ['12*7=', '84'],
    ['12/4=', '3']
  ];
  for (const [expression, expected] of cases) {
    const calculator = new CalculatorEngine();
    enter(calculator, expression);
    assert.equal(calculator.displayValue, expected, expression);
  }
});

test('chains operations like a basic phone calculator', () => {
  const calculator = new CalculatorEngine();
  enter(calculator, '5+3*2=');
  assert.equal(calculator.displayValue, '16');
});

test('rounds floating point noise for ordinary decimal calculations', () => {
  const calculator = new CalculatorEngine();
  enter(calculator, '0.1+0.2=');
  assert.equal(calculator.displayValue, '0.3');
});

test('supports sign toggle, backspace, and clear keys', () => {
  const calculator = new CalculatorEngine();
  enter(calculator, '123');
  calculator.toggleSign();
  assert.equal(calculator.displayValue, '-123');
  calculator.handleKey('Backspace');
  assert.equal(calculator.displayValue, '-12');
  calculator.handleKey('Escape');
  assert.equal(calculator.displayValue, '0');
});

test('sign toggle applies to the next operand after an operator', () => {
  const calculator = new CalculatorEngine();
  enter(calculator, '5*');
  calculator.toggleSign();
  enter(calculator, '3=');
  assert.equal(calculator.displayValue, '-15');
});

test('sign toggle negates an existing calculated result', () => {
  const calculator = new CalculatorEngine();
  enter(calculator, '5+3=');
  calculator.toggleSign();
  assert.equal(calculator.displayValue, '-8');
});

test('replaces a pending operator before the next operand', () => {
  const calculator = new CalculatorEngine();
  enter(calculator, '9+-3=');
  assert.equal(calculator.displayValue, '6');
});

test('fails closed on division by zero and recovers on the next digit', () => {
  const calculator = new CalculatorEngine();
  enter(calculator, '8/0=');
  assert.equal(calculator.displayValue, 'Error');
  calculator.handleKey('7');
  assert.equal(calculator.displayValue, '7');
});

test('calculator page exposes complete mouse controls without inline handlers', () => {
  const fs = require('node:fs');
  const html = fs.readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
  const script = fs.readFileSync(require('node:path').join(__dirname, '..', 'calculator.js'), 'utf8');

  assert.equal((html.match(/<button /g) || []).length, 19);
  for (const operator of ['+', '-', '*', '/']) {
    assert.ok(html.includes(`data-operator="${operator}"`));
  }
  for (const action of ['clear', 'sign', 'backspace', 'decimal', 'equals']) {
    assert.ok(html.includes(`data-action="${action}"`));
  }
  assert.equal(html.includes('onclick='), false);
  assert.equal(script.includes('eval('), false);
  assert.equal(script.includes('new Function'), false);
  assert.equal(script.includes('innerHTML'), false);
  assert.ok(script.includes("document.addEventListener('keydown'"));
});

test('limits displayed numeric input without blocking operations', () => {
  const calculator = new CalculatorEngine({ maxDigits: 12 });
  enter(calculator, '123456789012345');
  assert.equal(calculator.displayValue, '123456789012');
  enter(calculator, '+1=');
  assert.equal(calculator.displayValue, '123456789013');
});
