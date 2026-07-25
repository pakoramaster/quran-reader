import { spawn } from 'node:child_process';
import http from 'node:http';

const expoUrl = 'http://127.0.0.1:8081';
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const electronCommand = process.platform === 'win32'
  ? 'node_modules\\electron\\dist\\electron.exe'
  : 'node_modules/.bin/electron';
const electronEnvironment = { ...process.env, ELECTRON_START_URL: expoUrl };
delete electronEnvironment.ELECTRON_RUN_AS_NODE;

const expo = spawn(npmCommand, ['exec', 'expo', 'start', '--', '--web', '--port', '8081'], {
  stdio: 'inherit',
  shell: false,
});

let electron;
let stopped = false;

function waitForExpo(attempt = 0) {
  if (stopped) return;
  http.get(expoUrl, (response) => {
    response.resume();
    electron = spawn(electronCommand, ['desktop/main.cjs'], {
      env: electronEnvironment,
      stdio: 'inherit',
      shell: false,
    });
    electron.on('exit', (code) => {
      stopped = true;
      expo.kill();
      process.exitCode = code ?? 0;
    });
  }).on('error', () => {
    if (attempt >= 120) {
      stopped = true;
      expo.kill();
      throw new Error('Expo did not start within 60 seconds.');
    }
    setTimeout(() => waitForExpo(attempt + 1), 500);
  });
}

expo.on('exit', (code) => {
  if (!stopped) {
    stopped = true;
    electron?.kill();
    process.exitCode = code ?? 1;
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopped = true;
    electron?.kill();
    expo.kill();
  });
}

waitForExpo();
