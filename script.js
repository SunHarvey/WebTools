// Character sets definition
const charSets = {
    uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lowercase: 'abcdefghijklmnopqrstuvwxyz',
    numbers: '0123456789',
    special: '!@#$%^&*()-_=+[]{};:,.<>?/|\\`~'
};

// Ambiguous characters
const similarChars = '0oO1IiLl';

const translations = {
    en: {
        invalidLength: 'Password length must be an integer between 1 and 128.',
        invalidCount: 'Number of passwords must be an integer between 1 and 100.',
        selectCharacterType: 'Please select at least one character type!',
        minimumLength: 'Password length must be at least {count} to include every selected character type.',
        secureRandomUnavailable: 'Secure random generation is not supported by this browser.',
        copy: 'Copy',
        copied: 'Copied!',
        copiedAll: '✅ Copied All!',
        strength: 'Strength',
        veryStrong: 'Very Strong',
        good: 'Good',
        fair: 'Fair',
        weak: 'Weak',
        manualCopy: 'Clipboard access is unavailable. Copy the password manually:'
    },
    zh: {
        invalidLength: '密码长度必须是 1 到 128 之间的整数。',
        invalidCount: '生成数量必须是 1 到 100 之间的整数。',
        selectCharacterType: '请至少选择一种字符类型！',
        minimumLength: '要确保每种已选字符都出现，密码长度至少需要 {count} 位。',
        secureRandomUnavailable: '当前浏览器不支持安全随机数生成。',
        copy: '复制',
        copied: '已复制！',
        copiedAll: '✅ 已全部复制！',
        strength: '强度',
        veryStrong: '非常强',
        good: '强',
        fair: '一般',
        weak: '弱',
        manualCopy: '无法访问剪贴板，请手动复制密码：'
    }
};

function currentLanguage() {
    return document.documentElement.lang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function text(key, parameters = {}) {
    let value = translations[currentLanguage()][key];
    for (const [name, replacement] of Object.entries(parameters)) {
        value = value.replace(`{${name}}`, String(replacement));
    }
    return value;
}

function secureRandomIndex(maxExclusive) {
    const uint32Range = 0x100000000;
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > uint32Range) {
        throw new RangeError('maxExclusive must be between 1 and 2^32.');
    }
    if (!globalThis.crypto || typeof globalThis.crypto.getRandomValues !== 'function') {
        throw new Error('Secure random generation is not supported by this browser.');
    }

    const unbiasedLimit = uint32Range - (uint32Range % maxExclusive);
    const sample = new Uint32Array(1);
    do {
        globalThis.crypto.getRandomValues(sample);
    } while (sample[0] >= unbiasedLimit);

    return sample[0] % maxExclusive;
}

function secureShuffle(values) {
    for (let index = values.length - 1; index > 0; index -= 1) {
        const swapIndex = secureRandomIndex(index + 1);
        [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
    }
    return values;
}

function secureRandomCharacter(characters) {
    return characters[secureRandomIndex(characters.length)];
}

function generateSecurePassword(length, selectedSets) {
    if (!Number.isInteger(length) || length < selectedSets.length || selectedSets.length === 0) {
        throw new RangeError('Invalid password length or character sets.');
    }

    const passwordCharacters = selectedSets.map(secureRandomCharacter);
    const combinedCharacters = selectedSets.join('');
    while (passwordCharacters.length < length) {
        passwordCharacters.push(secureRandomCharacter(combinedCharacters));
    }

    return secureShuffle(passwordCharacters).join('');
}

function generatePasswords() {
    const includeNumbers = document.getElementById('includeNumbers').checked;
    const includeLower = document.getElementById('includeLowercase').checked;
    const includeUpper = document.getElementById('includeUppercase').checked;
    const includeSpecial = document.getElementById('includeSpecial').checked;
    const excludeSimilar = document.getElementById('excludeAmbiguous').checked;
    const length = Number(document.getElementById('passwordLength').value);
    const count = Number(document.getElementById('passwordCount').value);

    if (!Number.isInteger(length) || length < 1 || length > 128) {
        alert(text('invalidLength'));
        return;
    }
    if (!Number.isInteger(count) || count < 1 || count > 100) {
        alert(text('invalidCount'));
        return;
    }

    const selectedSets = [];
    if (includeNumbers) selectedSets.push(charSets.numbers);
    if (includeLower) selectedSets.push(charSets.lowercase);
    if (includeUpper) selectedSets.push(charSets.uppercase);
    if (includeSpecial) selectedSets.push(charSets.special);

    const filteredSets = selectedSets
        .map(characters => excludeSimilar
            ? [...characters].filter(character => !similarChars.includes(character)).join('')
            : characters)
        .filter(Boolean);

    if (filteredSets.length === 0) {
        alert(text('selectCharacterType'));
        return;
    }
    if (length < filteredSets.length) {
        alert(text('minimumLength', { count: filteredSets.length }));
        return;
    }

    try {
        const passwords = Array.from(
            { length: count },
            () => generateSecurePassword(length, filteredSets)
        );
        displayPasswords(passwords);
    } catch (error) {
        console.error('Secure password generation failed:', error);
        alert(text('secureRandomUnavailable'));
    }
}

function displayPasswords(passwords) {
    const passwordList = document.getElementById('passwordList');
    const resultsCard = document.getElementById('resultsCard');

    passwordList.replaceChildren();

    passwords.forEach((password, index) => {
        const passwordItem = document.createElement('div');
        passwordItem.className = 'password-item';

        const passwordText = document.createElement('div');
        passwordText.className = 'password-text';
        passwordText.textContent = password;

        const copyButton = document.createElement('button');
        copyButton.className = 'copy-btn';
        copyButton.textContent = text('copy');
        copyButton.addEventListener('click', () => copyPassword(password, index));

        passwordItem.appendChild(passwordText);
        passwordItem.appendChild(copyButton);
        passwordList.appendChild(passwordItem);
    });

    if (passwords.length > 0) {
        updatePasswordStrength(passwords[0]);
    }

    resultsCard.classList.add('show');
}

function updatePasswordStrength(password) {
    const strength = calculatePasswordStrength(password);
    const strengthText = document.getElementById('strengthText');
    const strengthFill = document.getElementById('strengthFill');

    strengthFill.className = `strength-fill ${strength.level}`;
    strengthText.textContent = `${text('strength')}: ${text(strength.textKey)}`;
}

function calculatePasswordStrength(password) {
    let score = 0;

    if (password.length >= 16) {
        score += 40;
    } else if (password.length >= 12) {
        score += 25;
    } else if (password.length >= 8) {
        score += 10;
    }

    if (/[a-z]/.test(password)) score += 10;
    if (/[A-Z]/.test(password)) score += 10;
    if (/[0-9]/.test(password)) score += 15;
    if (/[^a-zA-Z0-9]/.test(password)) score += 25;

    const distinctCharacters = new Set(password).size;
    score += (distinctCharacters / password.length) * 10;

    if (score >= 90) return { level: 'strong', textKey: 'veryStrong' };
    if (score >= 70) return { level: 'good', textKey: 'good' };
    if (score >= 50) return { level: 'fair', textKey: 'fair' };
    return { level: 'weak', textKey: 'weak' };
}

async function writeToClipboard(value) {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        throw new Error('Clipboard API is unavailable.');
    }
    await navigator.clipboard.writeText(value);
}

function requestManualCopy(value) {
    window.prompt(text('manualCopy'), value);
}

async function copyPassword(password, index) {
    try {
        await writeToClipboard(password);

        const button = document.querySelectorAll('.copy-btn')[index];
        const originalText = button.textContent;
        button.textContent = text('copied');
        button.classList.add('copied');

        setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('copied');
        }, 2000);
    } catch (error) {
        console.error('Failed to copy password:', error);
        requestManualCopy(password);
    }
}

async function copyAllPasswords() {
    const passwords = [...document.querySelectorAll('.password-text')]
        .map(element => element.textContent);
    const allPasswords = passwords.join('\n');

    try {
        await writeToClipboard(allPasswords);

        const button = document.querySelector('.copy-all-btn');
        const originalText = button.textContent;
        button.textContent = text('copiedAll');

        setTimeout(() => {
            button.textContent = originalText;
        }, 2000);
    } catch (error) {
        console.error('Failed to copy passwords:', error);
        requestManualCopy(allPasswords);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const generateButton = document.getElementById('generateButton');
    const copyAllButton = document.getElementById('copyAllButton');
    if (generateButton) generateButton.addEventListener('click', generatePasswords);
    if (copyAllButton) copyAllButton.addEventListener('click', copyAllPasswords);

    document.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            generatePasswords();
        }
    });

    document.getElementById('passwordLength').addEventListener('input', function() {
        const value = Number(this.value);
        if (Number.isInteger(value) && value < 1) this.value = 1;
        if (Number.isInteger(value) && value > 128) this.value = 128;
    });

    document.getElementById('passwordCount').addEventListener('input', function() {
        const value = Number(this.value);
        if (Number.isInteger(value) && value < 1) this.value = 1;
        if (Number.isInteger(value) && value > 100) this.value = 100;
    });
});
