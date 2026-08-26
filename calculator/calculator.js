'use strict';

class CalculatorEngine {
    constructor({ maxDigits = 12, onChange = null } = {}) {
        this.maxDigits = maxDigits;
        this.onChange = onChange;
        this.displayValue = '0';
        this.firstOperand = null;
        this.pendingOperator = null;
        this.waitingForOperand = false;
        this.hasError = false;
    }

    notify() {
        if (typeof this.onChange === 'function') {
            this.onChange(this);
        }
    }

    clear() {
        this.displayValue = '0';
        this.firstOperand = null;
        this.pendingOperator = null;
        this.waitingForOperand = false;
        this.hasError = false;
        this.notify();
    }

    inputDigit(digit) {
        if (!/^\d$/.test(digit)) return;
        if (this.hasError) this.clear();

        if (this.waitingForOperand || this.displayValue === '0' || this.displayValue === '-0') {
            const negative = this.displayValue === '-0';
            this.displayValue = negative ? `-${digit}` : digit;
            this.waitingForOperand = false;
        } else {
            const digitCount = (this.displayValue.match(/\d/g) || []).length;
            if (digitCount >= this.maxDigits) return;
            this.displayValue += digit;
        }
        this.notify();
    }

    inputDecimal() {
        if (this.hasError) this.clear();
        if (this.waitingForOperand) {
            this.displayValue = '0.';
            this.waitingForOperand = false;
        } else if (!this.displayValue.includes('.')) {
            this.displayValue += '.';
        }
        this.notify();
    }

    toggleSign() {
        if (this.hasError) return;
        if (this.waitingForOperand && this.pendingOperator !== null) {
            this.displayValue = '-0';
            this.waitingForOperand = false;
        } else {
            this.displayValue = this.displayValue.startsWith('-')
                ? this.displayValue.slice(1)
                : `-${this.displayValue}`;
        }
        this.notify();
    }

    backspace() {
        if (this.hasError) {
            this.clear();
            return;
        }
        if (this.waitingForOperand) return;

        this.displayValue = this.displayValue.length > 1
            ? this.displayValue.slice(0, -1)
            : '0';
        if (this.displayValue === '-') this.displayValue = '0';
        this.notify();
    }

    chooseOperator(operator) {
        if (!['+', '-', '*', '/'].includes(operator) || this.hasError) return;

        if (this.pendingOperator && this.waitingForOperand) {
            this.pendingOperator = operator;
            this.notify();
            return;
        }

        const inputValue = Number(this.displayValue);
        if (this.firstOperand === null) {
            this.firstOperand = inputValue;
        } else if (this.pendingOperator) {
            const result = this.performCalculation(
                this.firstOperand,
                inputValue,
                this.pendingOperator
            );
            if (result === null) return;
            this.displayValue = this.formatNumber(result);
            this.firstOperand = result;
        }

        this.pendingOperator = operator;
        this.waitingForOperand = true;
        this.notify();
    }

    calculate() {
        if (this.hasError || this.pendingOperator === null || this.firstOperand === null) return;

        const secondOperand = Number(this.displayValue);
        const result = this.performCalculation(
            this.firstOperand,
            secondOperand,
            this.pendingOperator
        );
        if (result === null) return;

        this.displayValue = this.formatNumber(result);
        this.firstOperand = null;
        this.pendingOperator = null;
        this.waitingForOperand = true;
        this.notify();
    }

    performCalculation(left, right, operator) {
        let result;
        if (operator === '+') result = left + right;
        if (operator === '-') result = left - right;
        if (operator === '*') result = left * right;
        if (operator === '/') {
            if (right === 0) {
                this.setError();
                return null;
            }
            result = left / right;
        }

        if (!Number.isFinite(result)) {
            this.setError();
            return null;
        }
        return result;
    }

    formatNumber(value) {
        const rounded = Number.parseFloat(value.toPrecision(12));
        const plain = String(rounded);
        return plain.length <= 16
            ? plain
            : rounded.toExponential(8).replace(/\.0+e/, 'e');
    }

    setError() {
        this.displayValue = 'Error';
        this.firstOperand = null;
        this.pendingOperator = null;
        this.waitingForOperand = true;
        this.hasError = true;
        this.notify();
    }

    handleKey(key) {
        if (/^\d$/.test(key)) {
            this.inputDigit(key);
            return true;
        }
        if (key === '.') {
            this.inputDecimal();
            return true;
        }
        if (['+', '-', '*', '/'].includes(key)) {
            this.chooseOperator(key);
            return true;
        }
        if (key === '=' || key === 'Enter') {
            this.calculate();
            return true;
        }
        if (key === 'Backspace') {
            this.backspace();
            return true;
        }
        if (key === 'Escape' || key === 'Delete' || key.toLowerCase() === 'c') {
            this.clear();
            return true;
        }
        return false;
    }
}

function attachCalculator() {
    const display = document.getElementById('calculatorDisplay');
    const keys = document.querySelector('.calculator-keys');
    const operatorButtons = [...document.querySelectorAll('[data-operator]')];

    const render = engine => {
        display.textContent = engine.displayValue;
        display.classList.toggle('error', engine.hasError);
        operatorButtons.forEach(button => {
            button.classList.toggle(
                'active',
                engine.pendingOperator === button.dataset.operator
            );
        });
    };

    const calculator = new CalculatorEngine({ onChange: render });
    render(calculator);

    keys.addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;

        if (button.dataset.digit) calculator.inputDigit(button.dataset.digit);
        if (button.dataset.action === 'decimal') calculator.inputDecimal();
        if (button.dataset.action === 'clear') calculator.clear();
        if (button.dataset.action === 'sign') calculator.toggleSign();
        if (button.dataset.action === 'backspace') calculator.backspace();
        if (button.dataset.action === 'equals') calculator.calculate();
        if (button.dataset.operator) calculator.chooseOperator(button.dataset.operator);
    });

    document.addEventListener('keydown', event => {
        if (calculator.handleKey(event.key)) {
            event.preventDefault();
        }
    });
}

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', attachCalculator);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CalculatorEngine };
}
