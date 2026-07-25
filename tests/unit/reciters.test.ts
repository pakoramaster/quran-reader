import { getRecitationUrl, getReciter, isReciterId } from '@/features/recitation/domain/reciters';

describe('recitation catalog', () => {
  it('builds EveryAyah verse filenames with zero padding', () => {
    expect(getRecitationUrl('husary', '1:1')).toBe('https://everyayah.com/data/Husary_64kbps/001001.mp3');
    expect(getRecitationUrl('abdul-basit', '114:6')).toBe('https://everyayah.com/data/Abdul_Basit_Murattal_64kbps/114006.mp3');
  });

  it('validates persisted reciter IDs', () => {
    expect(isReciterId('husary')).toBe(true);
    expect(isReciterId('unknown')).toBe(false);
    expect(getReciter('abdul-basit').name).toContain('Abdul Basit');
  });
});
