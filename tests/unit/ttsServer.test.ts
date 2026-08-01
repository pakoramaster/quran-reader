import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const mockGenerateAsync = jest.fn(async () => ({
  sampleRate: 24_000,
  samples: Float32Array.from([0, 0.25, -0.25]),
}));

jest.mock('sherpa-onnx-node', () => ({
  OfflineTts: {
    createAsync: jest.fn(async () => ({ generateAsync: mockGenerateAsync })),
  },
}));

// The Electron voice service remains CommonJS so it can run without transpilation.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createTtsService, encodeWav, generationRequest, prepareTtsChunks, resolveArchiveTarget } = require('../../desktop/ttsServer.cjs');

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

  it('uses the same natural sentence boundaries as the native engine', () => {
    expect(prepareTtsChunks('Dr. Smith listened. Mercy—compassion…always')).toEqual(['Dr. Smith listened.', 'Mercy, compassion...', 'always.']);
  });

  it('loads the bundled int8 model and reuses synthesized audio', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quran-folio-tts-test-'));
    const model = path.join(root, 'kokoro-int8-en-v0_19');
    fs.mkdirSync(path.join(model, 'espeak-ng-data'), { recursive: true });
    for (const filename of ['model.int8.onnx', 'voices.bin', 'tokens.txt']) fs.writeFileSync(path.join(model, filename), 'fixture');

    try {
      mockGenerateAsync.mockClear();
      const service = createTtsService(path.join(root, 'unused-user-data'), root);
      const request = { speakerId: 2, speed: 1, text: 'A bundled standard voice.' };
      const first = await service.synthesize(request);
      const second = await service.synthesize(request);

      expect(service.ready()).toBe(true);
      expect(first.equals(second)).toBe(true);
      expect(mockGenerateAsync).toHaveBeenCalledTimes(1);
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });
});
