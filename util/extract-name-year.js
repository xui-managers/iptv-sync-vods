function extractNameAndYear(vod) {
    if(!vod?.name && !vod.title) {
        return { name: '', year: '' };
    }
    
    const vodName = vod.name ?? vod.title;
    const yearMatch = vodName?.match(/\b(19|20)\d{2}\b/);
    let year = yearMatch ? yearMatch[0] : null;

    const name = vod.name
        .replace(/\s*\(?\b(19|20)\d{2}\b\)?\s*/, '')
        .trim();

    if (!year)
        year = vod?.release_date?.slice(0, 4)?.toString() ?? null;

    return { name, year };
}

module.exports = extractNameAndYear;