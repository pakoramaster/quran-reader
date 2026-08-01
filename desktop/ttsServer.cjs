const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');
const tar = require('tar-stream');
const unbzip2 = require('unbzip2-stream');

const modelId = 'kitten-nano-en-v0_1-fp16';
const modelUrl = `https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/${modelId}.tar.bz2`;
const abbreviationEnd = /\b(?:dr|mr|mrs|ms|prof|sr|jr|st|vs|etc)\.$/i;

function normalizeTtsText(text) {
  const normalized = String(text)
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

function splitLongSentence(sentence, maxLength) {
  const chunks = [];
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

function prepareTtsChunks(text, maxLength = 220) {
  const normalized = normalizeTtsText(text);
  if (!normalized) return [];
  const matches = normalized.match(/[^.!?]+(?:[.!?]+["']?|$)/g) || [normalized];
  const sentences = [];
  for (const match of matches) {
    const sentence = match.trim();
    if (!sentence) continue;
    if (sentences.length && abbreviationEnd.test(sentences[sentences.length - 1])) {
      sentences[sentences.length - 1] = `${sentences[sentences.length - 1]} ${sentence}`;
    } else {
      sentences.push(sentence);
    }
  }
  return sentences.flatMap((sentence) => splitLongSentence(sentence, Math.max(80, maxLength)));
}

function modelFiles(modelRoot) {
  return {
    model: path.join(modelRoot, 'model.fp16.onnx'),
    voices: path.join(modelRoot, 'voices.bin'),
    tokens: path.join(modelRoot, 'tokens.txt'),
    dataDir: path.join(modelRoot, 'espeak-ng-data'),
  };
}

function isReady(modelRoot) {
  const files = modelFiles(modelRoot);
  return fs.existsSync(files.model) && fs.existsSync(files.voices) && fs.existsSync(files.tokens) && fs.existsSync(files.dataDir);
}

function resolveArchiveTarget(destination, entryName) {
  const root = path.resolve(destination);
  const target = path.resolve(root, entryName);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error('The voice archive contains an unsafe path.');
  }
  return target;
}

async function extractTarBz2(archivePath, destination) {
  const extract = tar.extract();
  const root = path.resolve(destination);
  extract.on('entry', (header, stream, next) => {
    let target;
    try {
      target = resolveArchiveTarget(root, header.name);
    } catch (error) {
      stream.resume();
      extract.destroy(error);
      return;
    }
    if (header.type === 'directory') {
      fs.mkdirSync(target, { recursive: true });
      stream.resume();
      stream.once('end', next);
      return;
    }
    if (header.type !== 'file') {
      stream.resume();
      stream.once('end', next);
      return;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    pipeline(stream, fs.createWriteStream(target, { flags: 'w' })).then(next, (error) => extract.destroy(error));
  });
  await pipeline(fs.createReadStream(archivePath), unbzip2(), extract);
}

function encodeWav(samples, sampleRate) {
  const buffer = Buffer.allocUnsafe(44 + samples.length * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    buffer.writeInt16LE(sample < 0 ? sample * 32768 : sample * 32767, 44 + index * 2);
  }
  return buffer;
}

function generationRequest(text, speakerId, speed) {
  return { text, sid: speakerId, speed, enableExternalBuffer: false };
}

function createTtsService(dataRoot) {
  const voiceRoot = path.join(dataRoot, 'voice-models');
  const modelRoot = path.join(voiceRoot, modelId);
  const archivePath = path.join(voiceRoot, `${modelId}.tar.bz2`);
  let ensurePromise;
  let enginePromise;

  async function ensureModel() {
    if (isReady(modelRoot)) return modelRoot;
    if (!ensurePromise) ensurePromise = (async () => {
      fs.mkdirSync(voiceRoot, { recursive: true });
      const response = await fetch(modelUrl);
      if (!response.ok || !response.body) throw new Error(`Voice pack download failed (${response.status}).`);
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(archivePath, { flags: 'w' }));
      await extractTarBz2(archivePath, voiceRoot);
      fs.rmSync(archivePath, { force: true });
      if (!isReady(modelRoot)) throw new Error('The downloaded voice pack is incomplete.');
      return modelRoot;
    })().finally(() => { ensurePromise = undefined; });
    return ensurePromise;
  }

  async function engine() {
    if (!enginePromise) enginePromise = (async () => {
      const root = await ensureModel();
      const { OfflineTts } = require('sherpa-onnx-node');
      return OfflineTts.createAsync({ model: { kitten: modelFiles(root) }, numThreads: 2, maxNumSentences: 1 });
    })().catch((error) => { enginePromise = undefined; throw error; });
    return enginePromise;
  }

  return {
    ready: () => isReady(modelRoot),
    ensureModel,
    async synthesize({ text, speakerId, speed }) {
      const tts = await engine();
      // Electron 21+ does not permit Node-API external buffers. Asking Sherpa
      // for an owned buffer keeps the same samples while remaining compatible.
      const chunks = prepareTtsChunks(text);
      if (!chunks.length) throw new Error('Translation speech text is empty.');
      const generated = [];
      let sampleRate = 0;
      let sampleCount = 0;
      for (const chunk of chunks) {
        const audio = await tts.generateAsync(generationRequest(chunk, speakerId, speed));
        if (!sampleRate) sampleRate = audio.sampleRate;
        const pauseLength = generated.length ? Math.round(sampleRate * 0.12) : 0;
        generated.push({ samples: audio.samples, pauseLength });
        sampleCount += pauseLength + audio.samples.length;
      }
      const samples = new Float32Array(sampleCount);
      let offset = 0;
      for (const audio of generated) {
        offset += audio.pauseLength;
        samples.set(audio.samples, offset);
        offset += audio.samples.length;
      }
      return encodeWav(samples, sampleRate);
    },
  };
}

module.exports = { createTtsService, encodeWav, extractTarBz2, generationRequest, isReady, normalizeTtsText, prepareTtsChunks, resolveArchiveTarget };
