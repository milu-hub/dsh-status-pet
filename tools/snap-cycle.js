'use strict';

/**
 * Drive "snap to a corner" end to end and report what the app itself logs: the
 * window has to move to the named bottom corner and the pet has to end up facing
 * into the screen, so the bottom-right action restores the default facing and the
 * bottom-left action lands mirrored.
 *
 * Only the bottom-right action has a global trigger (starting the app a second
 * time, which is what the tray's single-instance handling calls), so the
 * bottom-left action is exercised through the same `resolveSnap` the handler uses
 * by `tools/check-snap.js`.
 *
 * Usage: node tools/snap-cycle.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const appDir = path.join(__dirname, '..', 'app');
const appData = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'DSH Status Pet');
const settingsFile = path.join(appData, 'settings.json');
const logFile = path.join(appData, 'pet.log');
const launcher = path.join(__dirname, 'launch.js');

const sleep = (seconds) => spawnSync('powershell', ['-NoProfile', '-Command', `Start-Sleep -Seconds ${String(seconds)}`], { stdio: 'ignore' });
const logLines = () => {
  try {
    return fs.readFileSync(logFile, 'utf8').split('\n');
  } catch {
    return [];
  }
};
const findLast = (needle) => {
  const lines = logLines().filter((line) => line.includes(needle));
  return lines.length === 0 ? null : lines[lines.length - 1];
};

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail === '' ? '' : `   ${detail}`}`);
};

const killApp = () => {
  try {
    execSync('taskkill /IM electron.exe /F', { stdio: 'ignore' });
  } catch {
    /* nothing running */
  }
};

const writeSettings = (settings) => {
  fs.mkdirSync(appData, { recursive: true });
  fs.writeFileSync(settingsFile, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
};

// 1. Find the real bottom-right anchor by letting the app place itself with no
//    stored position, and reading the window bounds it logs.
killApp();
sleep(2);
writeSettings({ petSize: 280, language: 'zh', position: null });
try {
  fs.unlinkSync(logFile);
} catch {
  /* first run */
}
spawnSync(process.execPath, [launcher], { stdio: 'ignore' });
sleep(7);

const shown = findLast('window shown at ');
if (shown === null) {
  console.error('the app never logged "window shown"; is Electron starting at all?');
  process.exit(1);
}
/** The default anchor, straight from the app. */
const anchor = JSON.parse(/\{.*\}/.exec(shown)[0]);
console.log(`default anchor from the app: ${JSON.stringify(anchor)}`);
check('bottom-right anchor is mirrored=false on startup', findLast('mirrored') === null, 'the startup log has no mirror line, as expected');

// 2. Drag the widget away, then trigger the second-instance handler, which is the
//    same snap the "回到右下角" menu entry runs.
const dragged = { x: anchor.x - 320, y: anchor.y - 210 };
writeSettings({ petSize: 280, language: 'zh', position: dragged, petVisible: true });
killApp();
sleep(2);
spawnSync(process.execPath, [launcher], { stdio: 'ignore' });
sleep(7);
const beforeSnap = JSON.parse(/\{.*\}/.exec(findLast('window shown at '))[0]);
check('a stored drag position is honoured on start', beforeSnap.x === dragged.x && beforeSnap.y === dragged.y, `${JSON.stringify(beforeSnap)} vs ${JSON.stringify(dragged)}`);

spawnSync(process.execPath, [launcher], { stdio: 'ignore' });
sleep(4);

const snapLine = findLast('snapped to bottom-');
for (const line of logLines().filter((line) => line.includes('snapped to bottom-'))) console.log(`   ${line.trim()}`);
const match = snapLine === null ? null : /snapped to bottom-(\w+) at (\{.*\}) mirrored=(\w+)/.exec(snapLine);
check('the snap was logged', match !== null, snapLine === null ? 'no snapped-to line in pet.log' : '');
if (match !== null) {
  const bounds = JSON.parse(match[2]);
  check('snapped to the bottom-right corner', match[1] === 'right', `side=${match[1]}`);
  check('landed on the anchor the app started from', bounds.x === anchor.x && bounds.y === anchor.y, `${JSON.stringify(bounds)} vs ${JSON.stringify(anchor)}`);
  check('restored the default facing', match[3] === 'false', `mirrored=${match[3]}`);
  const stored = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  check('dropped the stored drag position', stored.position === null, JSON.stringify(stored.position));
}

killApp();
console.log(failures === 0 ? '\nsnap OK' : `\n${String(failures)} snap check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
