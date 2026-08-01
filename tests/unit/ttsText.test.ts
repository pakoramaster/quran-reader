import { normalizeTtsText, prepareTtsChunks } from '@/features/speech/domain/ttsText';

describe('translation TTS text preparation', () => {
  it('normalizes punctuation into pauses Kitten can pronounce naturally', () => {
    expect(normalizeTtsText('  Mercy—compassion…always  ')).toBe('Mercy, compassion...always.');
    expect(normalizeTtsText('He said “be patient”')).toBe('He said "be patient".');
    expect(normalizeTtsText('')).toBe('');
  });

  it('keeps natural sentences separate and does not split abbreviations', () => {
    expect(prepareTtsChunks('Dr. Smith listened. Then he reflected.')).toEqual([
      'Dr. Smith listened.',
      'Then he reflected.',
    ]);
  });

  it('breaks unusually long prose near punctuation instead of mid-word', () => {
    const chunks = prepareTtsChunks(
      'This is a deliberately extended clause, with a natural point at which the voice can pause before it continues to the final thought.',
      85,
    );
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 86)).toBe(true);
    expect(chunks.join(' ')).not.toMatch(/\s{2,}/);
  });
});
