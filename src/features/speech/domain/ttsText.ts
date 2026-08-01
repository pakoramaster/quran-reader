const DEFAULT_MAX_CHUNK_LENGTH = 700;
const ABBREVIATION_END = /\b(?:dr|mr|mrs|ms|prof|sr|jr|st|vs|etc)\.$/i;

export function normalizeTtsText(text: string): string {
  const normalized = text
    .normalize('NFKC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\s*[\u2013\u2014]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/([,;:!?])(?=[A-Za-z])/g, '$1 ')
    .trim();

  if (!normalized) return '';
  return /[.!?]["']?$/.test(normalized) ? normalized : `${normalized}.`;
}

function splitLongSentence(sentence: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let remainder = sentence.trim();
  while (remainder.length > maxLength) {
    const window = remainder.slice(0, maxLength + 1);
    const minimumCut = Math.floor(maxLength * 0.55);
    const punctuationCut = Math.max(window.lastIndexOf('; '), window.lastIndexOf(': '), window.lastIndexOf(', '));
    const whitespaceCut = window.lastIndexOf(' ');
    const cut = punctuationCut >= minimumCut ? punctuationCut + 1 : whitespaceCut >= minimumCut ? whitespaceCut : maxLength;
    const chunk = remainder.slice(0, cut).trim();
    chunks.push(/[.!?;:,]["']?$/.test(chunk) ? chunk : `${chunk},`);
    remainder = remainder.slice(cut).trim();
  }
  if (remainder) chunks.push(remainder);
  return chunks;
}

export function prepareTtsChunks(text: string, maxLength = DEFAULT_MAX_CHUNK_LENGTH): string[] {
  const normalized = normalizeTtsText(text);
  if (!normalized) return [];

  const matches = normalized.match(/[^.!?]+(?:[.!?]+["']?|$)/g) ?? [normalized];
  const sentences: string[] = [];
  for (const match of matches) {
    const sentence = match.trim();
    if (!sentence) continue;
    if (sentences.length && ABBREVIATION_END.test(sentences[sentences.length - 1]!)) {
      sentences[sentences.length - 1] = `${sentences[sentences.length - 1]} ${sentence}`;
    } else {
      sentences.push(sentence);
    }
  }
  return sentences.flatMap((sentence) => splitLongSentence(sentence, Math.max(80, maxLength)));
}
