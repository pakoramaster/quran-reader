const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const standardVoiceSpeakerIds = new Set([0, 6, 8, 9]);

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.sqlite': 'application/vnd.sqlite3',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function setSecurityHeaders(response) {
  response.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' https://everyayah.com https://api.github.com https://raw.githubusercontent.com",
    "media-src 'self' https://everyayah.com blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'none'",
  ].join('; '));
  response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('X-Content-Type-Options', 'nosniff');
}

function send(response, method, status, headers, body = '') {
  response.writeHead(status, headers);
  response.end(method === 'HEAD' ? undefined : body);
}

function sendJson(response, method, status, value) {
  send(response, method, status, { 'Content-Type': 'application/json; charset=utf-8' }, JSON.stringify(value));
}

function readJsonBody(request, maximumBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let received = 0;
    request.on('data', (chunk) => {
      received += chunk.length;
      if (received > maximumBytes) {
        reject(new Error('Request body is too large.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('Request body must be valid JSON.'));
      }
    });
    request.on('error', reject);
  });
}

function resolveRequestFile(webRoot, requestPath) {
  let relativePath;
  try {
    relativePath = decodeURIComponent(requestPath).replace(/^\/+/, '');
  } catch {
    return { status: 400 };
  }

  if (!relativePath) relativePath = 'index.html';
  const requestedPath = path.resolve(webRoot, relativePath);
  const isInsideRoot = requestedPath === webRoot || requestedPath.startsWith(`${webRoot}${path.sep}`);
  if (!isInsideRoot) return { status: 404 };

  if (fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()) {
    return { filePath: requestedPath, status: 200 };
  }

  // Expo Router uses an SPA export. Only navigation-like paths fall back to
  // index.html; missing assets must remain visible as real 404 responses.
  if (!path.extname(relativePath)) return { filePath: path.join(webRoot, 'index.html'), status: 200 };
  return { status: 404 };
}

function createRequestHandler(webRoot, ttsService = null) {
  return async (request, response) => {
    setSecurityHeaders(response);
    const method = request.method || 'GET';
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');

    if (requestUrl.pathname === '/api/tts/status') {
      if (method !== 'GET' && method !== 'HEAD') {
        send(response, method, 405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' }, 'Method not allowed.');
        return;
      }
      if (!ttsService) {
        sendJson(response, method, 503, { ready: false, error: 'Standard voices are available in the Windows app.' });
        return;
      }
      try {
        if (requestUrl.searchParams.get('ensure') === '1') {
          if (ttsService.warm) await ttsService.warm();
          else await ttsService.ensureModel();
        }
        sendJson(response, method, 200, { ready: ttsService.ready() });
      } catch (error) {
        sendJson(response, method, 500, { ready: false, error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    if (requestUrl.pathname === '/api/tts') {
      if (method !== 'POST') {
        send(response, method, 405, { Allow: 'POST', 'Content-Type': 'text/plain; charset=utf-8' }, 'Method not allowed.');
        return;
      }
      if (!ttsService) {
        send(response, method, 503, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Standard voices are available in the Windows app.');
        return;
      }
      try {
        const body = await readJsonBody(request);
        const text = typeof body?.text === 'string' ? body.text.trim() : '';
        const speakerId = Number(body?.speakerId);
        const speed = Number(body?.speed);
        const priority = body?.priority === 'background' ? 'background' : 'foreground';
        if (!text || text.length > 20_000) throw new Error('Translation text must contain between 1 and 20,000 characters.');
        if (!Number.isInteger(speakerId) || !standardVoiceSpeakerIds.has(speakerId)) throw new Error('The selected standard voice is invalid.');
        if (!Number.isFinite(speed) || speed < 0.5 || speed > 2) throw new Error('The selected speech speed is invalid.');
        const wav = await ttsService.synthesize({ text, speakerId, speed, priority });
        send(response, method, 200, {
          'Cache-Control': 'no-store',
          'Content-Length': wav.length,
          'Content-Type': 'audio/wav',
        }, wav);
      } catch (error) {
        send(response, method, 400, { 'Content-Type': 'text/plain; charset=utf-8' }, error instanceof Error ? error.message : 'Translation speech failed.');
      }
      return;
    }

    if (method !== 'GET' && method !== 'HEAD') {
      send(response, method, 405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' }, 'Method not allowed.');
      return;
    }

    const resolved = resolveRequestFile(webRoot, requestUrl.pathname);
    if (!resolved.filePath) {
      send(response, method, resolved.status, { 'Content-Type': 'text/plain; charset=utf-8' }, resolved.status === 400 ? 'Bad request.' : 'Not found.');
      return;
    }

    fs.readFile(resolved.filePath, (error, contents) => {
      if (error) {
        send(response, method, 500, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Quran Folio could not load its application files.');
        return;
      }

      send(response, method, 200, {
        'Cache-Control': resolved.filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
        'Content-Type': mimeTypes[path.extname(resolved.filePath).toLowerCase()] || 'application/octet-stream',
      }, contents);
    });
  };
}

function startStaticServer({ port, webRoot, dataRoot, bundledModelsRoot, ttsService }) {
  const service = ttsService ?? (dataRoot ? require('./ttsServer.cjs').createTtsService(path.resolve(dataRoot), bundledModelsRoot) : null);
  const server = http.createServer(createRequestHandler(path.resolve(webRoot), service));
  return new Promise((resolve, reject) => {
    const handleError = (error) => {
      if (error?.code === 'EADDRINUSE') {
        reject(new Error(`Local desktop port ${port} is already in use. Close the other application using it and try again.`));
        return;
      }
      reject(error);
    };
    server.once('error', handleError);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', handleError);
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not determine the local desktop server address.'));
        return;
      }
      resolve({
        close: () => server.close(),
        url: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

module.exports = { createRequestHandler, readJsonBody, resolveRequestFile, startStaticServer };
