document.addEventListener('DOMContentLoaded', () => {
    const generateButton = document.getElementById('generate');
    const lengthSelect = document.getElementById('length');
    const countSelect = document.getElementById('count');
    const includeLowercase = document.getElementById('include-lowercase');
    const includeUppercase = document.getElementById('include-uppercase');
    const includeNumbers = document.getElementById('include-numbers');
    const includeSymbols = document.getElementById('include-symbols');
    const excludeEnabled = document.getElementById('exclude-enabled');
    const excludeInput = document.getElementById('exclude');
    const resultTextarea = document.getElementById('result');

    generateButton.addEventListener('click', () => {
        const length = parseInt(lengthSelect.value);
        const count = parseInt(countSelect.value);
        const excludeChars = excludeEnabled.checked ? excludeInput.value : '';

        const chars = {
            lowercase: 'abcdefghijklmnopqrstuvwxyz',
            uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
            numbers: '0123456789',
            symbols: '!@#$%^&*()_+[]{}|;:,.<>?'
        };

        let charset = '';
        if (includeLowercase.checked) charset += chars.lowercase;
        if (includeUppercase.checked) charset += chars.uppercase;
        if (includeNumbers.checked) charset += chars.numbers;
        if (includeSymbols.checked) charset += chars.symbols;

        let filteredCharset = charset.split('').filter(char => !excludeChars.includes(char)).join('');

        let passwords = [];
        for (let i = 0; i < count; i++) {
            let password = '';
            for (let j = 0; j < length; j++) {
                const randomIndex = Math.floor(Math.random() * filteredCharset.length);
                password += filteredCharset[randomIndex];
            }
            passwords.push(password);
        }
        resultTextarea.value = passwords.join('\n');
    });

    excludeEnabled.addEventListener('change', () => {
        excludeInput.disabled = !excludeEnabled.checked;
    });
});
