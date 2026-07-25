import { spawn } from 'node:child_process';

const electronCommand = process.platform === 'win32'
  ? 'node_modules\\electron\\dist\\electron.exe'
  : 'node_modules/.bin/electron';
const electronEnvironment = { ...process.env };

// Some Node-oriented development hosts set this globally. It must not leak into
// Electron or the runtime starts in Node compatibility mode without browser APIs.
delete electronEnvironment.ELECTRON_RUN_AS_NODE;

const electron = spawn(electronCommand, process.argv.slice(2), {
  env: electronEnvironment,
  stdio: 'inherit',
  shell: false,
});

electron.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
