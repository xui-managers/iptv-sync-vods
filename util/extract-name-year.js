function extractNameAndYear(vod) {
    if (!vod?.name && !vod?.title) {
        return { name: '', year: '' };
    }

    const vodName = vod.name ?? vod.title;

    const yearMatch = vodName.match(/\((\d{4})\)|\b(19|20)\d{2}\b$/);
    let year = yearMatch ? yearMatch[1] || yearMatch[0] : null;

    const name = vodName.replace(/\s*\(\d{4}\)|\s*\b(19|20)\d{2}\b$/, '').trim();

    if (!year) {
        year = vod?.release_date?.slice(0, 4)?.toString() ?? null;
    }

    return { name, year };
}

module.exports = extractNameAndYear;