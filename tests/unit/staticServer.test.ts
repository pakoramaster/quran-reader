import http from 'node:http';
import path from 'node:path';

// The Electron entry remains CommonJS so it can run without a transpilation step.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { startStaticServer } = require('../../desktop/staticServer.cjs');

interface ResponseResult {
  body: string;
  headers: http.IncomingHttpHeaders;
  status: number;
}

function request(url: string, method = 'GET', body?: string): Promise<ResponseResult> {
  return new Promise((resolve, reject) => {
    const outgoing = http.request(
      url,
      {
        headers: body ? { 'Content-Length': Buffer.byteLength(body), 'Content-Type': 'application/json' } : undefined,
        method,
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => resolve({ body, headers: response.headers, status: response.statusCode ?? 0 }));
      },
    );
    outgoing.on('error', reject);
    if (body) outgoing.write(body);
    outgoing.end();
  });
}

describe('desktop static server', () => {
  let server: { close: () => void; url: string };
  let voiceReady = false;
  const synthesize = jest.fn(async () => Buffer.from('RIFFmock'));

  beforeAll(async () => {
    server = await startStaticServer({
      port: 0,
      ttsService: {
        ensureModel: async () => {
          voiceReady = true;
        },
        ready: () => voiceReady,
        synthesize,
      },
      webRoot: path.resolve(__dirname, '../fixtures/desktop-web'),
    });
  });

  afterAll(() => server.close());

  it('serves assets with isolation and immutable-cache headers', async () => {
    const response = await request(`${server.url}/app.js`);
    expect(response.status).toBe(200);
    expect(response.body).toContain('fixtureLoaded');
    expect(response.headers['cross-origin-embedder-policy']).toBe('require-corp');
    expect(response.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(response.headers['content-security-policy']).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(response.headers['content-security-policy']).toContain("connect-src 'self' https://everyayah.com");
    expect(response.headers['content-security-policy']).toContain('https://api.github.com https://raw.githubusercontent.com');
    expect(response.headers['content-security-policy']).toContain("media-src 'self' https://everyayah.com blob:");
    expect(response.headers['content-security-policy']).not.toContain(" 'unsafe-eval'");
    expect(response.headers['cache-control']).toContain('immutable');
  });

  it('uses the SPA fallback for routes but not missing assets', async () => {
    await expect(request(`${server.url}/surah/2`)).resolves.toMatchObject({ status: 200 });
    await expect(request(`${server.url}/missing.js`)).resolves.toMatchObject({ status: 404 });
  });

  it('blocks traversal and unsupported methods', async () => {
    await expect(request(`${server.url}/..%2Fpackage.json`)).resolves.toMatchObject({ status: 404 });
    const response = await request(`${server.url}/`, 'POST');
    expect(response.status).toBe(405);
    expect(response.headers.allow).toBe('GET, HEAD');
  });

  it('supports HEAD without returning a body', async () => {
    await expect(request(`${server.url}/app.js`, 'HEAD')).resolves.toMatchObject({ body: '', status: 200 });
  });

  it('prepares the standard voice model and serves synthesized WAV audio', async () => {
    await expect(request(`${server.url}/api/tts/status`)).resolves.toMatchObject({ body: '{"ready":false}', status: 200 });
    await expect(request(`${server.url}/api/tts/status?ensure=1`)).resolves.toMatchObject({ body: '{"ready":true}', status: 200 });
    const speech = await request(
      `${server.url}/api/tts`,
      'POST',
      JSON.stringify({
        speakerId: 9,
        speed: 0.9,
        text: 'A standard voice.',
      }),
    );
    expect(speech.status).toBe(200);
    expect(speech.headers['content-type']).toBe('audio/wav');
    expect(speech.body).toBe('RIFFmock');
    expect(synthesize).toHaveBeenLastCalledWith({ priority: 'foreground', speakerId: 9, speed: 0.9, text: 'A standard voice.' });
  });

  it('accepts every configured Windows voice and rejects unknown speakers', async () => {
    for (const speakerId of [0, 6, 8, 9]) {
      await expect(request(`${server.url}/api/tts`, 'POST', JSON.stringify({ speakerId, speed: 1, text: 'Voice test.' }))).resolves.toMatchObject({ status: 200 });
    }

    await expect(request(`${server.url}/api/tts`, 'POST', JSON.stringify({ speakerId: 12, speed: 1, text: 'Voice test.' }))).resolves.toMatchObject({
      body: 'The selected standard voice is invalid.',
      status: 400,
    });
  });
});
