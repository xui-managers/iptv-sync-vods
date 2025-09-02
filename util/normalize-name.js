function normalizeName(fullName) {
    return fullName.replaceAll('[L]', '')
            .replaceAll('[4K]', '')
            .replaceAll('[LEG]', '')
            .replaceAll('(L)', '');
}

module.exports = normalizeName;