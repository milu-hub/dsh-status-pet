'use strict';

/**
 * Measure how much room each bubble string actually needs, in both languages and
 * every size the menu offers, so the font size can be chosen from real widths
 * instead of guessed. Loads the real renderer and reports, per string, the width
 * it wants at the current CSS font size against the width the bubble gives it.
 *
 * Usage: electron tools/measure-text.js
 */

const path = require('path');
const { pathToFileURL } = require('url');
const { app, BrowserWindow, ipcMain, net, protocol } = require('electron');

const rendererDir = path.join(__dirname, '..', 'app', 'src', 'renderer');
const assetDir = path.join(__dirname, '..', 'app', 'assets');
const { SIZES } = require(path.join(__dirname, '..', 'app', 'src', 'main', 'menu.js'));
const geometry = require('./widget-geometry.js');

protocol.registerSchemesAsPrivileged([
  { scheme: 'pet-asset', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const settings = { language: 'zh', bubbleVisible: true, petVisible: true, soundEnabled: false, petSize: 280 };
let status = { state: 'idle', lastError: null };
let mirrored = false;
const fixture = () => ({ settings, status, mirrored, version: 'measure-text' });

/** Every headline the strings file can produce, longest first within a language. */
async function strings(win) {
  return win.webContents.executeJavaScript('JSON.stringify(window.PET_STRINGS)').then(JSON.parse);
}

/**
 * Measure each candidate string with the bubble line's real font, and report it
 * against the width the bubble's text box actually gives it. `texts` is injected
 * as an argument rather than closed over, so the expression stays a single
 * self-contained call.
 */
const MEASURE = `
  ((texts) => {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-weight:600;letter-spacing:0.01em';
    const line = document.getElementById('bubble-line-1');
    const computed = getComputedStyle(line);
    probe.style.fontSize = computed.fontSize;
    probe.style.fontFamily = computed.fontFamily;
    document.body.appendChild(probe);
    const widths = [];
    for (const text of texts) {
      probe.textContent = text;
      widths.push({ text, width: probe.getBoundingClientRect().width });
    }
    probe.remove();
    const box = document.querySelector('.bubble-text').getBoundingClientRect();
    return { available: box.width, fontSize: computed.fontSize, widths };
  })
`;

app.whenReady().then(async () => {
  protocol.handle('pet-asset', (request) => {
    const name = decodeURIComponent(new URL(request.url).pathname).replace(/^[\\/]+/, '');
    return net.fetch(pathToFileURL(path.join(assetDir, name)).toString());
  });
  ipcMain.handle('pet:hello', () => fixture());
  ipcMain.on('pet:patch', () => {});
  ipcMain.on('pet:menu', () => {});
  ipcMain.on('pet:drag', () => {});
  ipcMain.on('pet:drag-end', () => {});
  ipcMain.on('pet:snap', () => {});

  const win = new BrowserWindow({
    width: 378,
    height: 280,
    show: false,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'app', 'src', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  await win.loadFile(path.join(rendererDir, 'index.html'));
  await new Promise((resolve) => setTimeout(resolve, 500));

  const table = await strings(win);

  for (const language of ['zh', 'en']) {
    const texts = Object.values(table[language]).map((entry) => entry.line1);
    console.log(`\n=== ${language} ===`);
    for (const petSize of SIZES) {
      const stage = geometry.stageSize(petSize);
      win.setContentSize(stage.width, stage.height);
      settings.language = language;
      settings.petSize = petSize;
      win.webContents.send('pet:state', fixture());
      await new Promise((resolve) => setTimeout(resolve, 260));

      const measured = await win.webContents.executeJavaScript(`(${MEASURE})(${JSON.stringify(texts)})`);
      const available = measured.available;
      const fontPx = Number.parseFloat(measured.fontSize);
      console.log(`  petSize ${String(petSize).padStart(3)}  font ${measured.fontSize.padStart(7)}  text box ${available.toFixed(1)}px`);
      for (const { text, width } of measured.widths) {
        const ratio = width / available;
        // The font size that would make this string exactly fill the box.
        const fitting = (fontPx * available) / width;
        console.log(
          `              ${(ratio * 100).toFixed(0).padStart(4)}% of the box  needs ${width.toFixed(1).padStart(6)}px` +
            `  fits at ${fitting.toFixed(1).padStart(5)}px  "${text}"${ratio > 1 ? '  OVERFLOWS' : ''}`,
        );
      }
    }
  }
  app.exit(0);
});
