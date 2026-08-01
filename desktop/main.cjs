const { app, BrowserWindow, dialog, shell } = require('electron');
const path = require('node:path');

const { startStaticServer } = require('./staticServer.cjs');
const { createMainWindow } = require('./window.cjs');

const productionPort = 47831;
let localServer;
let startUrl;

function focusExistingWindow() {
  const existingWindow = BrowserWindow.getAllWindows()[0];
  if (existingWindow?.isMinimized()) existingWindow.restore();
  existingWindow?.focus();
}

async function resolveStartUrl() {
  if (!app.isPackaged && process.env.ELECTRON_START_URL) return process.env.ELECTRON_START_URL;
  if (startUrl) return startUrl;

  const appRoot = app.isPackaged ? app.getAppPath() : path.resolve(__dirname, '..');
  const bundledModelsRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', 'tts-native', 'models')
    : path.join(appRoot, 'assets', 'tts-native', 'models');
  localServer = await startStaticServer({
    bundledModelsRoot,
    dataRoot: app.getPath('userData'),
    port: productionPort,
    webRoot: path.join(appRoot, 'dist'),
  });
  startUrl = localServer.url;
  return startUrl;
}

async function openWindow() {
  const window = await createMainWindow({
    BrowserWindow,
    shell,
    startUrl: await resolveStartUrl(),
  });

  if (!app.isPackaged && (process.env.QURAN_FOLIO_SMOKE_TEST === '1'
    || process.env.QURAN_FOLIO_INPUT_SMOKE_TEST === '1'
    || process.env.QURAN_FOLIO_AUDIO_SMOKE_TEST === '1')) {
    const { runRequestedSmokeTest } = require('./testing/smoke.cjs');
    await runRequestedSmokeTest({ app, window });
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', focusExistingWindow);
  app.whenReady()
    .then(async () => {
      await openWindow();
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) void openWindow();
      });
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      dialog.showErrorBox('Quran Folio could not start', message);
      app.exit(1);
    });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => localServer?.close());
