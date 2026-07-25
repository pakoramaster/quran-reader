// The Electron main process remains CommonJS so it can run without transpilation.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createMainWindow, isExternalWebUrl } = require('../../desktop/window.cjs');

describe('desktop window', () => {
  it('recognizes only HTTP(S) links as external web URLs', () => {
    expect(isExternalWebUrl('https://example.com')).toBe(true);
    expect(isExternalWebUrl('http://example.com')).toBe(true);
    expect(isExternalWebUrl('file:///C:/private.txt')).toBe(false);
    expect(isExternalWebUrl('javascript:alert(1)')).toBe(false);
    expect(isExternalWebUrl('not a URL')).toBe(false);
  });

  it('creates a sandboxed renderer and blocks external navigation', async () => {
    const listeners = new Map<string, (event: { preventDefault: jest.Mock }, url: string) => void>();
    let openHandler: ({ url }: { url: string }) => { action: string } = () => ({ action: 'allow' });
    const webContents = {
      on: jest.fn((event: string, listener: (event: { preventDefault: jest.Mock }, url: string) => void) => listeners.set(event, listener)),
      setWindowOpenHandler: jest.fn((handler: typeof openHandler) => { openHandler = handler; }),
    };
    const loadURL = jest.fn().mockResolvedValue(undefined);
    const BrowserWindow = jest.fn(() => ({ loadURL, webContents }));
    const shell = { openExternal: jest.fn().mockResolvedValue(undefined) };

    await createMainWindow({ BrowserWindow, shell, startUrl: 'http://127.0.0.1:47831' });

    expect(BrowserWindow).toHaveBeenCalledWith(expect.objectContaining({
      webPreferences: expect.objectContaining({
        allowRunningInsecureContent: false,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      }),
    }));
    expect(loadURL).toHaveBeenCalledWith('http://127.0.0.1:47831');

    expect(openHandler({ url: 'https://example.com' })).toEqual({ action: 'deny' });
    expect(shell.openExternal).toHaveBeenCalledWith('https://example.com');

    const externalEvent = { preventDefault: jest.fn() };
    listeners.get('will-navigate')?.(externalEvent, 'https://example.com/path');
    expect(externalEvent.preventDefault).toHaveBeenCalledTimes(1);

    const internalEvent = { preventDefault: jest.fn() };
    listeners.get('will-navigate')?.(internalEvent, 'http://127.0.0.1:47831/surah/2');
    expect(internalEvent.preventDefault).not.toHaveBeenCalled();
  });
});
