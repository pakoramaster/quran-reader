const namedEntities: Readonly<Record<string, string>> = {
  amp: '&',
  apos: "'",
  gt: '>',
  hellip: '…',
  ldquo: '“',
  lsquo: '‘',
  lt: '<',
  mdash: '—',
  nbsp: '\u00a0',
  ndash: '–',
  quot: '"',
  rdquo: '”',
  rsquo: '’',
};

const entityPattern = /&(?:#(\d+)|#x([\da-f]+)|([a-z][a-z\d]+));/gi;

function decodeEntity(match: string, decimal?: string, hexadecimal?: string, named?: string): string {
  if (named) return namedEntities[named.toLowerCase()] ?? match;
  const codePoint = Number.parseInt(decimal ?? hexadecimal ?? '', decimal ? 10 : 16);
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
    return match;
  }
  return String.fromCodePoint(codePoint);
}

export function normalizeTranslationText(text: string): string {
  let normalized = text.replace(/\r\n?/g, '\n');
  // A second pass handles safely double-escaped input such as &amp;quot;.
  for (let pass = 0; pass < 2; pass += 1) {
    const decoded = normalized.replace(entityPattern, decodeEntity);
    if (decoded === normalized) break;
    normalized = decoded;
  }
  return normalized.normalize('NFC');
}
