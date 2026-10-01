'use strict';

/**
 * Inspect the *running* pet over the Chrome DevTools protocol: push the widget to
 * a corner through the app's own IPC, read back what the renderer actually applied
 * (classes, `--flip`, and the boxes of the pet, its image, the bubble and the
 * tail), and save a PNG of what it really painted.
 *
 * This is the only way to see the live renderer without editing the app, so it is
 * what to reach for when a pose looks wrong on screen. Capturing through the app
 * itself also avoids the desktop-capture trap: the pet is shown with
 * `showInactive` and no activation, so a screen grab often catches whatever window
 * happens to be in front of it.
 *
 * Usage:
 *   electron.exe . --remote-debugging-port=9222      # start the pet first
 *   node tools/inspect-live.js [left|right] [outDir]
 */

const fs = require('fs');
const http = require('http');
const path = require('path');

const PORT = Number(process.env.CDP_PORT || 9222);

/** @returns {Promise<object>} the `/json/list` payload. */
function targets() {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: PORT, path: '/json/list', timeout: 8000 }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', reject)
      .on('timeout', function onTimeout() {
        this.destroy(new Error('timed out talking to the debug port'));
      });
  });
}

const SNAPSHOT = `
  (() => {
    const rect = (node) => {
      if (node === null) return null;
      const r = node.getBoundingClientRect();
      return [r.left, r.top, r.right, r.bottom].map((v) => Number(v.toFixed(1)));
    };
    const stage = document.getElementById('stage');
    const pet = document.getElementById('pet');
    const bubble = document.getElementById('bubble');
    const cs = (node) => getComputedStyle(node);
    return {
      stageClass: stage.className,
      flipVar: cs(document.documentElement).getPropertyValue('--flip').trim(),
      petSizeVar: cs(document.documentElement).getPropertyValue('--pet-size').trim(),
      viewport: [window.innerWidth, window.innerHeight],
      pet: rect(pet),
      petTransform: cs(pet).transform,
      petPosition: [cs(pet).left, cs(pet).right],
      image: rect(document.getElementById('pet-image')),
      imageTransform: cs(document.getElementById('pet-image')).transform,
      bubble: rect(bubble),
      bubbleTransform: cs(bubble).transform,
      bubblePosition: [cs(bubble).left, cs(bubble).right],
      bubbleSize: [cs(bubble).width, cs(bubble).height],
      tail: rect(document.querySelector('.bubble-fill path')),
      text: rect(document.querySelector('.bubble-text')),
      textTransform: cs(document.querySelector('.bubble-text')).transform,
      mirroredInDom: window.__petMirrorSeen ?? null,
    };
  })()
`;

/** Minimal CDP client over the page's WebSocket. */
async function cdp(wsUrl, calls) {
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('websocket failed')), { once: true });
  });
  const results = [];
  for (const [method, params] of calls) {
    const id = results.length + 1;
    results.push(
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 15000);
        const onMessage = (event) => {
          const message = JSON.parse(String(event.data));
          if (message.id !== id) return;
          clearTimeout(timer);
          socket.removeEventListener('message', onMessage);
          if (message.error) reject(new Error(`${method}: ${JSON.stringify(message.error)}`));
          else resolve(message.result);
        };
        socket.addEventListener('message', onMessage);
        socket.send(JSON.stringify({ id, method, params }));
      }),
    );
  }
  socket.close();
  return results;
}

/** Evaluate an expression in the page and return its value. */
async function evaluate(wsUrl, expression) {
  const [result] = await cdp(wsUrl, [['Runtime.evaluate', { expression, returnByValue: true }]]);
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

/** Capture the page as a PNG through the app's own compositor. */
async function screenshot(wsUrl, file) {
  const [result] = await cdp(wsUrl, [['Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }]]);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(result.data, 'base64'));
  return file;
}

(async () => {
  const list = await targets();
  const page = list.find((entry) => entry.type === 'page' && entry.title === 'DSH Status Pet');
  if (page === undefined) {
    console.error('the pet page is not on the debug port; start it with --remote-debugging-port');
    process.exit(1);
  }
  const outDir = process.argv[3] || path.join(__dirname, '..', '.shots', 'live');
  const wantLeft = process.argv[2] !== 'right';

  console.log(`asking the app to snap to the bottom-${wantLeft ? 'left' : 'right'}…`);
  // The widget's own snap request, exactly what the context menu sends.
  await evaluate(page.webSocketDebuggerUrl, `window.pet.snap('${wantLeft ? 'left' : 'right'}'), 'sent'`);
  await new Promise((resolve) => setTimeout(resolve, 1400));

  const snapshot = await evaluate(page.webSocketDebuggerUrl, SNAPSHOT);
  console.log(JSON.stringify(snapshot, null, 2));
  const file = await screenshot(page.webSocketDebuggerUrl, path.join(outDir, `live-${wantLeft ? 'left' : 'right'}.png`));

  const mirrored = (transform) => String(transform).startsWith('matrix(-1');
  const wanted = wantLeft;
  console.log('');
  console.log(`stage class      : ${snapshot.stageClass}`);
  console.log(`--flip           : ${snapshot.flipVar}`);
  console.log(`pet mirrored     : ${mirrored(snapshot.petTransform)}   (transform ${snapshot.petTransform})`);
  console.log(`bubble mirrored  : ${mirrored(snapshot.bubbleTransform)}   (transform ${snapshot.bubbleTransform})`);
  console.log(`text mirrored    : ${mirrored(snapshot.textTransform)}   (transform ${snapshot.textTransform})`);
  console.log(`pet box          : ${JSON.stringify(snapshot.pet)}  in a ${snapshot.viewport.join('x')} window`);
  console.log(`bubble box       : ${JSON.stringify(snapshot.bubble)}  size ${snapshot.bubbleSize.join(' x ')}`);
  console.log(`tail box         : ${JSON.stringify(snapshot.tail)}`);
  console.log(`saved            : ${file}`);

  // The pose the app actually reached has to match the one that was asked for.
  const failures = [
    mirrored(snapshot.petTransform) !== wanted && 'pet flip',
    mirrored(snapshot.bubbleTransform) !== wanted && 'bubble flip',
    mirrored(snapshot.textTransform) !== wanted && 'text counter-flip',
    snapshot.stageClass.includes(wanted ? 'is-left' : 'is-right') ? false : 'stage class',
    snapshot.flipVar === (wanted ? '-1' : '1') ? false : '--flip',
  ].filter(Boolean);
  console.log(failures.length === 0 ? '\nlive pose OK' : `\nlive pose FAILED: ${failures.join(', ')}`);
  process.exit(failures.length === 0 ? 0 : 1);
})();
