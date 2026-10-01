'use strict';

/**
 * Drive the pet through each size the menu offers and report the window the app
 * itself logs, so the size setting is verified end to end.
 *
 * Usage: node tools/size-cycle.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const appData = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'DSH Status Pet');
const settingsFile = path.join(appData, 'settings.json');
const logFile = path.join(appData, 'pet.log');
const launcher = path.join(__dirname, 'launch.js');

/** @returns {string|null} the most recent "window shown" log line. */
function lastShown() {
  try {
    const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (lines[i].includes('window shown')) return lines[i];
    }
  } catch {
    /* no log yet */
  }
  return null;
}

for (const petSize of [180, 280, 420]) {
  try {
    execSync('taskkill /IM electron.exe /F', { stdio: 'ignore' });
  } catch {
    /* nothing running */
  }
  spawnSync('powershell', ['-NoProfile', '-Command', 'Start-Sleep -Milliseconds 1800'], { stdio: 'ignore' });
  fs.writeFileSync(settingsFile, `${JSON.stringify({ petSize, language: 'zh', bubbleVisible: true }, null, 2)}\n`, 'utf8');
  try {
    fs.unlinkSync(logFile);
  } catch {
    /* first run */
  }
  spawnSync(process.execPath, [launcher], { stdio: 'ignore' });
  spawnSync('powershell', ['-NoProfile', '-Command', 'Start-Sleep -Seconds 6'], { stdio: 'ignore' });
  const stored = JSON.parse(fs.readFileSync(settingsFile, 'utf8')).petSize;
  console.log(`asked ${String(petSize).padStart(3)}px  settings=${String(stored).padStart(3)}px  ${lastShown() ?? 'no window line'}`);
}
