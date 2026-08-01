import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

import tar from 'tar-stream';
import unbzip2 from 'unbzip2-stream';

const modelId = 'kokoro-int8-en-v0_19';
const modelUrl = `https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/${modelId}.tar.bz2`;
const expectedSha256 = 'c9f0dd393615805b0bab050c340834d5e684e732aec91c0e860cd30e982c08bd';
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modelsRoot = path.join(projectRoot, 'assets', 'tts-native', 'models');
const modelRoot = path.join(modelsRoot, modelId);
const stampPath = path.join(modelRoot, '.quran-folio-model');

async function findModelFile(root) {
  for (const filename of ['model.int8.onnx', 'model.onnx']) {
    try {
      await access(path.join(root, filename));
      return filename;
    } catch {
      // Try the next supported Kokoro filename.
    }
  }
  throw new Error(`No Kokoro ONNX model found in ${root}.`);
}

async function modelIsReady() {
  try {
    const stamp = JSON.parse(await readFile(stampPath, 'utf8'));
    await findModelFile(modelRoot);
    await Promise.all([access(path.join(modelRoot, 'voices.bin')), access(path.join(modelRoot, 'tokens.txt')), access(path.join(modelRoot, 'espeak-ng-data'))]);
    return stamp.id === modelId && stamp.sha256 === expectedSha256 && stamp.url === modelUrl;
  } catch {
    return false;
  }
}

function safeArchiveTarget(destination, entryName) {
  const root = path.resolve(destination);
  const target = path.resolve(root, entryName);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Unsafe path in Kokoro archive: ${entryName}`);
  }
  return target;
}

async function extractArchive(archivePath, destination) {
  const extract = tar.extract();

  extract.on('entry', (header, stream, next) => {
    const target = safeArchiveTarget(destination, header.name);
    if (header.type === 'directory') {
      void mkdir(target, { recursive: true }).then(
        () => {
          stream.resume();
          stream.once('end', next);
        },
        (error) => extract.destroy(error),
      );
      return;
    }
    if (header.type !== 'file') {
      stream.resume();
      stream.once('end', next);
      return;
    }
    void mkdir(path.dirname(target), { recursive: true })
      .then(() => pipeline(stream, createWriteStream(target, { flags: 'w' })))
      .then(next, (error) => extract.destroy(error));
  });

  await pipeline(createReadStream(archivePath), unbzip2(), extract);
}

async function main() {
  if (await modelIsReady()) {
    console.log(`Bundled Kokoro model is ready: ${path.relative(projectRoot, modelRoot)}`);
    return;
  }

  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'quran-folio-kokoro-'));
  const archivePath = path.join(temporaryRoot, `${modelId}.tar.bz2`);
  const extractionRoot = path.join(temporaryRoot, 'extracted');

  try {
    console.log(`Downloading ${modelId} for app packaging...`);
    const response = await fetch(modelUrl, { redirect: 'follow' });
    if (!response.ok || !response.body) {
      throw new Error(`Kokoro model download failed (${response.status} ${response.statusText}).`);
    }
    await pipeline(response.body, createWriteStream(archivePath, { flags: 'wx' }));
    const checksum = createHash('sha256')
      .update(await readFile(archivePath))
      .digest('hex');
    if (checksum !== expectedSha256) {
      throw new Error(`Kokoro model checksum mismatch: expected ${expectedSha256}, received ${checksum}.`);
    }

    await mkdir(extractionRoot, { recursive: true });
    await extractArchive(archivePath, extractionRoot);
    const extractedModelRoot = path.join(extractionRoot, modelId);
    await findModelFile(extractedModelRoot);
    await Promise.all([access(path.join(extractedModelRoot, 'voices.bin')), access(path.join(extractedModelRoot, 'tokens.txt')), access(path.join(extractedModelRoot, 'espeak-ng-data'))]);

    await mkdir(modelsRoot, { recursive: true });
    const stagedRoot = path.join(modelsRoot, `${modelId}.staged`);
    await rm(stagedRoot, { recursive: true, force: true });
    await cp(extractedModelRoot, stagedRoot, { recursive: true });
    await writeFile(path.join(stagedRoot, '.quran-folio-model'), `${JSON.stringify({ id: modelId, sha256: checksum, url: modelUrl }, null, 2)}\n`);
    await rm(modelRoot, { recursive: true, force: true });
    await rename(stagedRoot, modelRoot);
    console.log(`Prepared bundled Kokoro model (${checksum.slice(0, 12)}...).`);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

await main();
