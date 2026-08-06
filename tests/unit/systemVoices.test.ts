import { filterSystemVoices, getSystemSpeechRate, type SystemVoice } from '@/features/speech/domain/systemVoices';

const voices: SystemVoice[] = [
  { identifier: 'fr', language: 'fr-FR', name: 'Amelie', quality: 'Default' },
  { identifier: 'en-gb', language: 'en-GB', name: 'George', quality: 'Default' },
  { identifier: 'en-us', language: 'en_US', name: 'Ava', quality: 'Enhanced' },
];

describe('system speech voices', () => {
  it('prefers voices matching the translation language and sorts their names', () => {
    expect(filterSystemVoices(voices, 'en-CA').map((voice) => voice.identifier)).toEqual(['en-us', 'en-gb']);
  });

  it('falls back to every installed voice when the language has no match', () => {
    expect(filterSystemVoices(voices, 'ar').map((voice) => voice.identifier)).toEqual(['fr', 'en-us', 'en-gb']);
  });

  it('uses visibly different rates for system synthesizers', () => {
    expect([0.9, 1, 1.1, 1.2, 1.3].map(getSystemSpeechRate)).toEqual([0.5, 0.75, 1, 1.25, 1.5]);
  });
});
