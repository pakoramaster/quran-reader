async function runInputSmokeTest({ app, window }) {
  const currentUrl = new URL(window.webContents.getURL());
  await window.loadURL(`${currentUrl.origin}/notes`);
  await new Promise((resolve) => setTimeout(resolve, 3000));
  window.show();
  window.focus();
  window.webContents.focus();
  const focused = await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('input, textarea');
    input?.focus();
    return { found: Boolean(input), focused: document.activeElement === input };
  })()`);
  for (const character of 'keyboard test') {
    const keyCode = character === ' ' ? 'Space' : character;
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode });
    window.webContents.sendInputEvent({ type: 'char', keyCode: character });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode });
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  const value = await window.webContents.executeJavaScript("document.querySelector('input, textarea')?.value ?? null");
  console.log(`DESKTOP_INPUT_SMOKE_TEST ${JSON.stringify({ ...focused, value })}`);
  process.exitCode = focused.focused && value === 'keyboard test' ? 0 : 1;
  app.quit();
}

async function runApplicationSmokeTest({ app, window }) {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const result = await window.webContents.executeJavaScript(`({
    crossOriginIsolated: globalThis.crossOriginIsolated,
    hasContent: (document.body?.innerText?.trim().length ?? 0) > 20
  })`);
  console.log(`DESKTOP_SMOKE_TEST ${JSON.stringify(result)}`);
  process.exitCode = result.crossOriginIsolated && result.hasContent ? 0 : 1;
  app.quit();
}

async function runAudioSmokeTest({ app, window }) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const result = await window.webContents.executeJavaScript(`new Promise((resolve) => {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    const timeout = setTimeout(() => resolve({ loaded: false, error: 'Timed out loading recitation audio.' }), 15000);
    const finish = (result) => {
      clearTimeout(timeout);
      audio.pause();
      audio.removeAttribute('src');
      resolve(result);
    };
    audio.addEventListener('canplay', () => finish({ loaded: true, error: null }), { once: true });
    audio.addEventListener('error', () => finish({ loaded: false, error: audio.error?.message ?? 'Media element error.' }), { once: true });
    audio.src = 'https://everyayah.com/data/Husary_64kbps/001001.mp3';
    audio.load();
  })`);
  console.log(`DESKTOP_AUDIO_SMOKE_TEST ${JSON.stringify(result)}`);
  process.exitCode = result.loaded ? 0 : 1;
  app.quit();
}

function runRequestedSmokeTest(context) {
  if (process.env.QURAN_FOLIO_AUDIO_SMOKE_TEST === '1') return runAudioSmokeTest(context);
  if (process.env.QURAN_FOLIO_INPUT_SMOKE_TEST === '1') return runInputSmokeTest(context);
  return runApplicationSmokeTest(context);
}

module.exports = { runRequestedSmokeTest };
