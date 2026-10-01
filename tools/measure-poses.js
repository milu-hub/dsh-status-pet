'use strict';

/**
 * Measure the real widget in a headless window: where the bubble box, its oval,
 * its tail and the text land in each pose, and whether each of them is clipped by
 * the window. This is the ground truth the geometry constants in
 * `tools/widget-geometry.js` are written from.
 *
 * Usage: electron tools/measure-poses.js [petSize...]
 */

const path = require('path');
const { pathToFileURL } = require('url');
const { app, BrowserWindow, ipcMain, net, protocol } = require('electron');

const geometry = require('./widget-geometry.js');

const rendererDir = path.join(__dirname, '..', 'app', 'src', 'renderer');
const assetDir = path.join(__dirname, '..', 'app', 'assets');

protocol.registerSchemesAsPrivileged([
  { scheme: 'pet-asset', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const settings = { language: 'zh', bubbleVisible: true, petVisible: true, soundEnabled: false, petSize: 280 };
let status = { state: 'idle', lastError: null };
let mirrored = false;
const fixture = () => ({ settings, status, mirrored, version: 'measure' });

const SNAPSHOT = `
  (() => {
    const box = (node) => {
      const r = node.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const stage = document.getElementById('stage');
    return {
      pose: stage.classList.contains('is-left') ? 'left' : 'right',
      viewport: { width: window.innerWidth, height: window.innerHeight },
      petSize: getComputedStyle(document.documentElement).getPropertyValue('--pet-size').trim(),
      flip: getComputedStyle(document.documentElement).getPropertyValue('--flip').trim(),
      bubble: box(document.getElementById('bubble')),
      oval: box(document.querySelector('.bubble-fill ellipse')),
      tail: box(document.querySelector('.bubble-fill path')),
      text: box(document.querySelector('.bubble-text')),
      pet: box(document.getElementById('pet')),
      image: box(document.getElementById('pet-image')),
      bubbleTransform: getComputedStyle(document.getElementById('bubble')).transform,
    };
  })()
`;

/** How much of a box falls outside the viewport, in CSS pixels. */
function clipped(box, viewport) {
  return {
    left: Math.max(0, -box.left),
    right: Math.max(0, box.right - viewport.width),
    top: Math.max(0, -box.top),
    bottom: Math.max(0, box.bottom - viewport.height),
  };
}

const totalClip = (box, viewport) => {
  const c = clipped(box, viewport);
  return c.left + c.right + c.top + c.bottom;
};

let failures = 0;

app.whenReady().then(async () => {
  protocol.handle('pet-asset', (request) => {
    const name = decodeURIComponent(new URL(request.url).pathname).replace(/^[\\/]+/, '');
    return net.fetch(pathToFileURL(path.join(assetDir, name)).toString());
  });
  ipcMain.handle('pet:hello', () => fixture());
  ipcMain.on('pet:patch', (_event, patch) => Object.assign(settings, patch || {}));
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
  win.webContents.on('console-message', (_e, level, message) => console.log(`renderer[${level}] ${message}`));
  await win.loadFile(path.join(rendererDir, 'index.html'));
  await new Promise((resolve) => setTimeout(resolve, 400));

  const sizes = process.argv.slice(2).map(Number).filter(Number.isFinite);
  for (const petSize of sizes.length > 0 ? sizes : [180, 280, 420]) {
    const stage = geometry.stageSize(petSize);
    win.setContentSize(stage.width, stage.height);
    settings.petSize = petSize;
    await new Promise((resolve) => setTimeout(resolve, 260));

    console.log(`\n=== petSize ${String(petSize)}  window ${stage.width}x${stage.height} ===`);
    for (const pose of ['right', 'left']) {
      mirrored = pose === 'left';
      win.webContents.send('pet:state', fixture());
      await new Promise((resolve) => setTimeout(resolve, 520));
      const m = await win.webContents.executeJavaScript(SNAPSHOT);
      const fmt = (b) => `[${b.left.toFixed(1).padStart(7)} .. ${b.right.toFixed(1).padStart(7)}]  y ${b.top.toFixed(1).padStart(6)} .. ${b.bottom.toFixed(1).padStart(6)}`;
      console.log(` pose ${m.pose}  flip=${m.flip}  bubbleTransform=${m.bubbleTransform}  petSize=${m.petSize}`);
      console.log(`   bubble ${fmt(m.bubble)}   clip ${totalClip(m.bubble, m.viewport).toFixed(1)}px`);
      console.log(`   oval   ${fmt(m.oval)}   clip ${totalClip(m.oval, m.viewport).toFixed(1)}px`);
      console.log(`   tail   ${fmt(m.tail)}   clip ${totalClip(m.tail, m.viewport).toFixed(1)}px`);
      console.log(`   text   ${fmt(m.text)}   clip ${totalClip(m.text, m.viewport).toFixed(1)}px`);
      console.log(`   image  ${fmt(m.image)}   clip ${totalClip(m.image, m.viewport).toFixed(1)}px`);

      // The real invariants, measured rather than derived:
      //  * nothing may be clipped by the window, in either pose;
      //  * the sentence has to stay centred in the cloud (the text block is
      //    counter-flipped, so getting that wrong slides the words off the oval);
      //  * the tail has to point at the pet, which shows up as its tip poking out
      //    past the oval on the pet's side. Absolute distances are a poor test
      //    here because the viewBox is letterboxed inside the bubble box.
      const centre = (b) => (b.left + b.right) / 2;
      const clippedTotal =
        totalClip(m.bubble, m.viewport) + totalClip(m.oval, m.viewport) + totalClip(m.tail, m.viewport) + totalClip(m.text, m.viewport);
      const textCentreDelta = Math.abs(centre(m.bubble) - centre(m.text));
      const tailPoke = m.pose === 'left' ? m.oval.left - m.tail.left : m.tail.right - m.oval.right;
      const tailTowardPet = tailPoke > 4;
      const ok = clippedTotal === 0 && tailTowardPet && textCentreDelta <= 1.5;
      if (!ok) failures += 1;
      console.log(
        `${ok ? 'ok  ' : 'FAIL'}   checks: clipped ${clippedTotal.toFixed(1)}px` +
          `   tail pokes ${tailPoke.toFixed(1)}px past the oval, toward the pet` +
          `   text ${textCentreDelta.toFixed(2)}px off the cloud centre`,
      );
    }
  }

  mirrored = false;
  console.log(
    failures === 0
      ? '\nmeasure OK: every element is inside the window in both poses, with the tail pointing at the pet'
      : `\n${String(failures)} pose measurement(s) failed`,
  );
  app.exit(failures === 0 ? 0 : 1);
});
