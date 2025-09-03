function normalizeName(fullName) {
    return fullName.replaceAll('[L]', '')
            .replaceAll('[4K]', '')
            .replaceAll('[LEG]', '')
            .replaceAll('(L)', '')
            .replaceAll('[CAM]', '');
}

module.exports = normalizeName;