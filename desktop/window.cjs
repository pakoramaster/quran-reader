function isExternalWebUrl(url) {
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

async function createMainWindow({ BrowserWindow, shell, startUrl }) {
  const window = new BrowserWindow({
    title: 'Quran Folio',
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#F4EEDF',
    autoHideMenuBar: true,
    webPreferences: {
      allowRunningInsecureContent: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  const appOrigin = new URL(startUrl).origin;

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalWebUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    let isSameOrigin = false;
    try {
      isSameOrigin = new URL(url).origin === appOrigin;
    } catch {
      // Invalid navigation targets are blocked below.
    }
    if (!isSameOrigin) {
      event.preventDefault();
      if (isExternalWebUrl(url)) void shell.openExternal(url);
    }
  });

  await window.loadURL(startUrl);
  return window;
}

module.exports = { createMainWindow, isExternalWebUrl };
