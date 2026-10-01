'use strict';

/**
 * Standalone render harness: loads the real renderer in a transparent window,
 * exercises the press interaction, and saves window captures so the layout can
 * be reviewed without a live screen grab.
 *
 * Usage: electron tools/capture.js [outDir]
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { app, BrowserWindow, ipcMain, net, protocol } = require('electron');

const rendererDir = path.join(__dirname, '..', 'app', 'src', 'renderer');
const assetDir = path.join(__dirname, '..', 'app', 'assets');
const outDir = process.argv[2] || path.join(__dirname, '..', '.shots');
const { SIZES } = require(path.join(__dirname, '..', 'app', 'src', 'main', 'menu.js'));

protocol.registerSchemesAsPrivileged([
  { scheme: 'pet-asset', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const settings = {
  language: 'zh',
  bubbleVisible: true,
  petVisible: true,
  soundEnabled: false,
  petSize: 420,
};
let status = { state: 'thinking', lastError: null };
/** Mirrors the left-half rule so the flip can be captured too. */
let mirrored = false;
/** Counts the assertions this harness makes, so a regression fails the run. */
let failures = 0;

function fixture() {
  return { settings, status, mirrored, version: '1.0.0-test' };
}

app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  protocol.handle('pet-asset', (request) => {
    const name = decodeURIComponent(new URL(request.url).pathname).replace(/^[\\/]+/, '');
    return net.fetch(pathToFileURL(path.join(assetDir, name)).toString());
  });
  ipcMain.handle('pet:hello', () => fixture());
  ipcMain.on('pet:patch', (_event, patch) => Object.assign(settings, patch || {}));
  ipcMain.on('pet:menu', () => {});
  ipcMain.on('pet:drag', () => {});
  ipcMain.on('pet:drag-end', () => {});

  const win = new BrowserWindow({
    width: 590,
    height: 590,
    x: 0,
    y: 0,
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

  win.webContents.on('console-message', (_e, level, message, line, source) => {
    console.log(`renderer[${level}] ${message} (${source}:${line})`);
  });

  await win.loadFile(path.join(rendererDir, 'index.html'));

  for (const state of ['thinking', 'working', 'waiting', 'error', 'ok', 'idle']) {
    status = { state, lastError: state === 'error' ? '401 Invalid API-key provided by the provider' : null };
    win.webContents.send('pet:state', fixture());
    await new Promise((resolve) => setTimeout(resolve, 900));
    const seen = await win.webContents.executeJavaScript(
      "document.getElementById('bubble-line-1').textContent + ' | ' + document.getElementById('stage').dataset.state + ' | ink=' + getComputedStyle(document.querySelector('.bubble-ink')).stroke",
    );
    const image = await win.capturePage();
    const file = path.join(outDir, `render-${state}.png`);
    fs.writeFileSync(file, image.toPNG());
    console.log(`captured ${state}: ${String(seen)}`);
  }

  // English copy and the pressed pose.
  settings.language = 'en';
  status = { state: 'thinking', lastError: null };
  win.webContents.send('pet:state', fixture());
  await new Promise((resolve) => setTimeout(resolve, 300));
  await win.webContents.executeJavaScript("document.getElementById('pet').classList.add('is-pressed')");
  await new Promise((resolve) => setTimeout(resolve, 130));
  fs.writeFileSync(path.join(outDir, 'render-en-pressed.png'), (await win.capturePage()).toPNG());
  console.log('captured en-pressed');

  // DOM geometry at every size the menu offers. The harness resizes its window
  // exactly like the app does, so the measurements describe the real widget.
  settings.language = 'zh';
  for (const size of SIZES) {
    settings.petSize = size;
    const petEdge = Math.round((size * 1) / 2) * 2;
    win.setContentSize(Math.round((petEdge * 1.35) / 2) * 2, petEdge);
    status = { state: 'idle', lastError: null };
    win.webContents.send('pet:state', fixture());
    await new Promise((resolve) => setTimeout(resolve, 500));
    const box = await win.webContents.executeJavaScript(`
      (() => {
        const rect = (id) => {
          const r = document.getElementById(id).getBoundingClientRect();
          return [r.left, r.top, r.right, r.bottom].map((v) => Math.round(v));
        };
        return { pet: rect('pet'), bubble: rect('bubble'), stage: [window.innerWidth, window.innerHeight] };
      })()
    `);
    const [bl, bt, br, bb] = box.bubble;
    const [pl, pt, pr, pb] = box.pet;
    const inside = bl >= 0 && bt >= 0 && br <= box.stage[0] && bb <= box.stage[1];
    const overlapsBox = !(br <= pl || bl >= pr || bb <= pt || bt >= pb);
    console.log(
      `size ${String(size).padStart(3)}: stage ${box.stage.join('x')}  bubble [${bl},${bt},${br},${bb}]  pet [${pl},${pt},${pr},${pb}]  inside=${String(inside)}  overlapsPetBox=${String(overlapsBox)}`,
    );
    fs.writeFileSync(path.join(outDir, `size-${String(size)}.png`), (await win.capturePage()).toPNG());
  }

  // Mirroring: the pet turns around on the left half of the desktop and the
  // bubble turns with it — box on the other side, tail on the pet's side, text
  // counter-flipped so it still reads left to right. `tools/measure-poses.js` is
  // what asserts the geometry; this only captures the pictures and prints the
  // transforms that prove the flip reached every layer.
  settings.petSize = 280;
  win.setContentSize(378, 280);
  status = { state: 'thinking', lastError: null };
  for (const flip of [false, true]) {
    mirrored = flip;
    win.webContents.send('pet:state', fixture());
    await new Promise((resolve) => setTimeout(resolve, 520));
    const state = await win.webContents.executeJavaScript(`
      (() => {
        const stage = document.getElementById('stage');
        const bubble = document.getElementById('bubble');
        const pet = document.getElementById('pet');
        const box = (node) => {
          const r = node.getBoundingClientRect();
          return [r.left, r.top, r.right, r.bottom].map((v) => Number(v.toFixed(1)));
        };
        return {
          pose: stage.classList.contains('is-left') ? 'left' : 'right',
          flip: getComputedStyle(document.documentElement).getPropertyValue('--flip').trim(),
          petTransform: getComputedStyle(pet).transform,
          bubbleTransform: getComputedStyle(bubble).transform,
          textTransform: getComputedStyle(document.querySelector('.bubble-text')).transform,
          bubble: box(bubble),
          tail: box(document.querySelector('.bubble-fill path')),
          text: box(document.querySelector('.bubble-text')),
          viewport: [window.innerWidth, window.innerHeight],
        };
      })()
    `);
    // The busy pulse scales the bubble while the state is `thinking`, so the
    // assertion is on the flip's sign rather than on the exact matrix. A matrix
    // is `matrix(a, b, c, d, e, f)`; `a` is the horizontal scale, which is
    // negative exactly when the element is mirrored. `none` is the identity, and
    // so is an element with no transform of its own.
    const flipFactor = (transform) => (String(transform) === 'none' ? 1 : Number(String(transform).replace('matrix(', '').split(',')[0]));
    const wanted = flip ? -1 : 1;
    const flipped =
      Math.sign(flipFactor(state.petTransform)) === wanted &&
      Math.sign(flipFactor(state.bubbleTransform)) === wanted &&
      Math.sign(flipFactor(state.textTransform)) === wanted;
    if (!flipped) failures += 1;
    console.log(
      `${flipped ? 'ok  ' : 'FAIL'} pose ${state.pose}: pet ${state.petTransform}  bubble ${state.bubbleTransform}  text ${state.textTransform}`,
    );
    console.log(
      `            bubble [${state.bubble.join(', ')}]  tail [${state.tail.join(', ')}]  text [${state.text.join(', ')}] inside ${state.viewport.join('x')}`,
    );
    fs.writeFileSync(path.join(outDir, `pose-${state.pose}.png`), (await win.capturePage()).toPNG());
  }
  fs.copyFileSync(path.join(outDir, 'pose-left.png'), path.join(outDir, 'mirror-left.png'));
  fs.copyFileSync(path.join(outDir, 'pose-right.png'), path.join(outDir, 'mirror-right.png'));

  // The flip must survive every animation the pet can be running.
  for (const state of ['idle', 'waiting', 'thinking', 'working']) {
    mirrored = true;
    status = { state, lastError: null };
    win.webContents.send('pet:state', fixture());
    await new Promise((resolve) => setTimeout(resolve, 700));
    const transform = await win.webContents.executeJavaScript(
      "getComputedStyle(document.getElementById('pet-image')).transform",
    );
    console.log(`flip while ${state.padEnd(8)}: ${String(transform)}`);
  }
  mirrored = false;
  win.webContents.send('pet:state', fixture());

  // Audio wiring: the squeak must fetch, decode and play from the renderer.
  const audio = await win.webContents.executeJavaScript(`
    (async () => {
      const response = await fetch('pet-asset://local/squeak.wav');
      const bytes = await response.arrayBuffer();
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(bytes.slice(0));
      window.PetSound.prime();
      window.PetSound.squeak(1);
      await new Promise((resolve) => setTimeout(resolve, 250));
      return { ok: response.ok, bytes: bytes.byteLength, seconds: Number(decoded.duration.toFixed(3)), state: ctx.state };
    })()
  `);
  console.log('audio check:', JSON.stringify(audio));

  // The cut-out artwork alone, on a dark page, to review the alpha edges.
  const assetData = await win.webContents.executeJavaScript(
    "document.getElementById('pet-image').src.slice(0, 5) === 'data:' ? Promise.resolve(null) : Promise.resolve('pending')",
  );
  if (assetData === null) {
    const dataUrl = await win.webContents.executeJavaScript("document.getElementById('pet-image').src");
    fs.writeFileSync(path.join(outDir, 'pet-sticker.png'), Buffer.from(String(dataUrl).split(',')[1], 'base64'));
    console.log('captured pet-sticker.png');
  }

  console.log(
    failures === 0
      ? `\ncapture OK: ${String(fs.readdirSync(outDir).length)} files in ${outDir}, the pose flip reached the pet, the bubble and its text`
      : `\n${String(failures)} capture check(s) failed`,
  );
  app.exit(failures === 0 ? 0 : 1);
});



