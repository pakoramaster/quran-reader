const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');
const tar = require('tar-stream');
const unbzip2 = require('unbzip2-stream');

const modelId = 'kokoro-en-v0_19';
const modelUrl =
  `https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/${modelId}.tar.bz2`;

const abbreviationEnd =
  /\b(?:dr|mr|mrs|ms|prof|sr|jr|st|vs|etc)\.$/i;

/**
 * Normalizes text before sending it to the TTS model.
 *
 * Kokoro benefits from normal sentence-ending punctuation for more natural prosody.
 */
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

  if (!normalized) {
    return '';
  }

  return /[.!?]["']?$/.test(normalized)
    ? normalized
    : `${normalized}.`;
}

/**
 * Breaks a long sentence into smaller TTS-friendly chunks.
 */
function splitLongSentence(sentence, maxLength) {
  const chunks = [];
  let remainder = sentence.trim();

  while (remainder.length > maxLength) {
    const window = remainder.slice(0, maxLength + 1);
    const minimumCut = Math.floor(maxLength * 0.55);

    const punctuationCut = Math.max(
      window.lastIndexOf('; '),
      window.lastIndexOf(': '),
      window.lastIndexOf(', '),
    );

    const whitespaceCut = window.lastIndexOf(' ');

    const cut =
      punctuationCut >= minimumCut
        ? punctuationCut + 1
        : whitespaceCut >= minimumCut
          ? whitespaceCut
          : maxLength;

    const chunk = remainder.slice(0, cut).trim();

    if (chunk) {
      chunks.push(
        /[.!?;:,]["']?$/.test(chunk)
          ? chunk
          : `${chunk},`,
      );
    }

    remainder = remainder.slice(cut).trim();
  }

  if (remainder) {
    chunks.push(remainder);
  }

  return chunks;
}

/**
 * Splits normalized text into sentences and repairs splits caused by common
 * abbreviations such as "Dr." or "Mr.".
 */
function prepareTtsChunks(text, maxLength = 280) {
  const normalized = normalizeTtsText(text);

  if (!normalized) {
    return [];
  }

  const matches =
    normalized.match(/[^.!?]+(?:[.!?]+["']?|$)/g) ||
    [normalized];

  const sentences = [];

  for (const match of matches) {
    const sentence = match.trim();

    if (!sentence) {
      continue;
    }

    const previous = sentences.at(-1);

    if (previous && abbreviationEnd.test(previous)) {
      sentences[sentences.length - 1] =
        `${previous} ${sentence}`;
    } else {
      sentences.push(sentence);
    }
  }

  return sentences.flatMap((sentence) =>
    splitLongSentence(
      sentence,
      Math.max(80, maxLength),
    ),
  );
}

function modelFiles(modelRoot) {
  return {
    model: path.join(modelRoot, 'model.onnx'),
    voices: path.join(modelRoot, 'voices.bin'),
    tokens: path.join(modelRoot, 'tokens.txt'),
    dataDir: path.join(modelRoot, 'espeak-ng-data'),
  };
}

function isReady(modelRoot) {
  const files = modelFiles(modelRoot);

  return (
    fs.existsSync(files.model) &&
    fs.existsSync(files.voices) &&
    fs.existsSync(files.tokens) &&
    fs.existsSync(files.dataDir)
  );
}

function resolveArchiveTarget(destination, entryName) {
  const root = path.resolve(destination);
  const target = path.resolve(root, entryName);

  if (
    target !== root &&
    !target.startsWith(`${root}${path.sep}`)
  ) {
    throw new Error(
      'The voice archive contains an unsafe path.',
    );
  }

  return target;
}

async function extractTarBz2(
  archivePath,
  destination,
) {
  const extract = tar.extract();
  const root = path.resolve(destination);

  extract.on('entry', (header, stream, next) => {
    let target;

    try {
      target = resolveArchiveTarget(
        root,
        header.name,
      );
    } catch (error) {
      stream.resume();
      extract.destroy(error);
      return;
    }

    if (header.type === 'directory') {
      fs.mkdirSync(target, {
        recursive: true,
      });

      stream.resume();
      stream.once('end', next);
      return;
    }

    if (header.type !== 'file') {
      stream.resume();
      stream.once('end', next);
      return;
    }

    fs.mkdirSync(path.dirname(target), {
      recursive: true,
    });

    pipeline(
      stream,
      fs.createWriteStream(target, {
        flags: 'w',
      }),
    ).then(
      next,
      (error) => extract.destroy(error),
    );
  });

  await pipeline(
    fs.createReadStream(archivePath),
    unbzip2(),
    extract,
  );
}

/**
 * Returns raw generated audio without any post-processing so synthesis stays
 * fast and avoids the overhead of trimming or fading.
 */
function processGeneratedAudio(samples) {
  return samples;
}

function encodeWav(samples, sampleRate) {
  if (
    !Number.isInteger(sampleRate) ||
    sampleRate <= 0
  ) {
    throw new Error(
      'A valid audio sample rate is required.',
    );
  }

  const dataLength = samples.length * 2;

  const buffer = Buffer.allocUnsafe(
    44 + dataLength,
  );

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(
    36 + dataLength,
    4,
  );
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(
    sampleRate * 2,
    28,
  );
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);

  for (
    let index = 0;
    index < samples.length;
    index += 1
  ) {
    const sample = Math.max(
      -1,
      Math.min(
        1,
        samples[index] ?? 0,
      ),
    );

    const pcmValue =
      sample < 0
        ? Math.round(sample * 32768)
        : Math.round(sample * 32767);

    buffer.writeInt16LE(
      pcmValue,
      44 + index * 2,
    );
  }

  return buffer;
}

function generationRequest(
  text,
  speakerId,
  speed,
) {
  return {
    text,
    sid: speakerId,
    speed,
    enableExternalBuffer: false,
  };
}

function createTtsService(dataRoot) {
  const voiceRoot = path.join(
    dataRoot,
    'voice-models',
  );

  const modelRoot = path.join(
    voiceRoot,
    modelId,
  );

  const archivePath = path.join(
    voiceRoot,
    `${modelId}.tar.bz2`,
  );

  let ensurePromise;
  let enginePromise;
  let engineInstance = null;

  async function ensureModel() {
    if (isReady(modelRoot)) {
      return modelRoot;
    }

    if (!ensurePromise) {
      ensurePromise = (async () => {
        fs.mkdirSync(voiceRoot, {
          recursive: true,
        });

        try {
          const response =
            await fetch(modelUrl);

          if (
            !response.ok ||
            !response.body
          ) {
            throw new Error(
              `Voice pack download failed ` +
              `(${response.status} ${response.statusText}).`,
            );
          }

          await pipeline(
            Readable.fromWeb(
              response.body,
            ),
            fs.createWriteStream(
              archivePath,
              {
                flags: 'w',
              },
            ),
          );

          await extractTarBz2(
            archivePath,
            voiceRoot,
          );

          if (!isReady(modelRoot)) {
            fs.rmSync(modelRoot, {
              recursive: true,
              force: true,
            });

            throw new Error(
              'The downloaded voice pack is incomplete.',
            );
          }

          return modelRoot;
        } finally {
          fs.rmSync(archivePath, {
            force: true,
          });
        }
      })().finally(() => {
        ensurePromise = undefined;
      });
    }

    return ensurePromise;
  }

  async function engine() {
    if (engineInstance) {
      return engineInstance;
    }

    if (!enginePromise) {
      enginePromise = (async () => {
        const root =
          await ensureModel();

        const { OfflineTts } = require(
          'sherpa-onnx-node',
        );

        engineInstance = await OfflineTts.createAsync({
          model: {
            kokoro: modelFiles(root),
          },
          numThreads: 4,
          maxNumSentences: 1,
        });

        return engineInstance;
      })().catch((error) => {
        enginePromise = undefined;
        engineInstance = null;
        throw error;
      });
    }

    return enginePromise;
  }

  return {
    ready() {
      return isReady(modelRoot);
    },

    ensureModel,

    async synthesize({
      text,
      speakerId,
      speed,
    }) {
      const tts = await engine();

      const chunks =
        prepareTtsChunks(text);

      if (!chunks.length) {
        throw new Error(
          'Translation speech text is empty.',
        );
      }

      const generated = [];

      let sampleRate = 0;
      let sampleCount = 0;

      for (
        let index = 0;
        index < chunks.length;
        index += 1
      ) {
        const chunk = chunks[index];

        const audio =
          await tts.generateAsync(
            generationRequest(
              chunk,
              speakerId,
              speed,
            ),
          );

        if (
          !audio ||
          !audio.samples ||
          audio.samples.length === 0 ||
          !audio.sampleRate
        ) {
          throw new Error(
            'The TTS engine returned empty audio.',
          );
        }

        if (!sampleRate) {
          sampleRate = audio.sampleRate;
        } else if (
          audio.sampleRate !== sampleRate
        ) {
          throw new Error(
            `TTS sample rate changed from ` +
            `${sampleRate} to ` +
            `${audio.sampleRate}.`,
          );
        }

        const isFinalChunk =
          index === chunks.length - 1;

        const chunkSamples =
          processGeneratedAudio(
            audio.samples,
          );

        if (!chunkSamples.length) {
          throw new Error(
            'Audio trimming removed the entire generated chunk.',
          );
        }

        /*
         * The pause is inserted before every chunk except the first. It does
         * not add silence after the final chunk.
         */
        const pauseLength =
          generated.length > 0
            ? Math.round(
                sampleRate * 0.12,
              )
            : 0;

        generated.push({
          samples: chunkSamples,
          pauseLength,
        });

        sampleCount +=
          pauseLength +
          chunkSamples.length;
      }

      const samples =
        new Float32Array(sampleCount);

      let offset = 0;

      for (const audio of generated) {
        offset += audio.pauseLength;

        samples.set(
          audio.samples,
          offset,
        );

        offset +=
          audio.samples.length;
      }

      return encodeWav(
        samples,
        sampleRate,
      );
    },
  };
}

module.exports = {
  createTtsService,
  encodeWav,
  extractTarBz2,
  generationRequest,
  isReady,
  normalizeTtsText,
  prepareTtsChunks,
  processGeneratedAudio,
  resolveArchiveTarget,
};