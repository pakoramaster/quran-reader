import path from 'node:path';

// The Electron voice service remains CommonJS so it can run without transpilation.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { encodeWav, generationRequest, resolveArchiveTarget } = require('../../desktop/ttsServer.cjs');

describe('desktop uniform voice service', () => {
  it('encodes generated floating-point samples as a valid mono PCM WAV', () => {
    const wav = encodeWav(Float32Array.from([-1, 0, 1]), 24_000) as Buffer;

    expect(wav.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(wav.subarray(8, 12).toString('ascii')).toBe('WAVE');
    expect(wav.readUInt16LE(20)).toBe(1);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(24_000);
    expect(wav.subarray(36, 40).toString('ascii')).toBe('data');
    expect(wav.readUInt32LE(40)).toBe(6);
    expect(wav.readInt16LE(44)).toBe(-32_768);
    expect(wav.readInt16LE(46)).toBe(0);
    expect(wav.readInt16LE(48)).toBe(32_767);
  });

  it('keeps extracted voice files inside the model directory', () => {
    const root = path.resolve('voice-model');
    expect(resolveArchiveTarget(root, 'kitten/model.onnx')).toContain('kitten');
    expect(() => resolveArchiveTarget(root, '../outside.dll')).toThrow(/unsafe path/i);
    expect(() => resolveArchiveTarget(root, 'kitten/../../outside.dll')).toThrow(/unsafe path/i);
  });

  it('requests an Electron-compatible owned audio buffer', () => {
    expect(generationRequest('A standard voice.', 2, 0.9)).toEqual({
      enableExternalBuffer: false,
      sid: 2,
      speed: 0.9,
      text: 'A standard voice.',
    });
  });
});
