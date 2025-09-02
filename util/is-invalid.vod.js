function isInvalidVodName(name) {
  if (!name || name == '') return true;

  const normalized = name.toLowerCase().trim();

  // Padrões comuns de “falsos filmes” ou placeholders
  const invalidPatterns = [
    /group\s*title\s*=/,   // "group title="
    /tvg[-_]id\s*=/,       // "tvg-id="
    /http(s)?:\/\//,       // links
    /\(.*?undefined.*?\)/,  // "(undefined)"
    /^n\/a$/i,             // "N/A"
    /test/i,               // "test"
    /sample/i,             // "sample"
  ];

  return invalidPatterns.some(p => p.test(normalized));
}
module.exports = isInvalidVodName