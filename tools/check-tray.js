'use strict';

/**
 * Check that the tray icon and context menu can really be installed, which is
 * where a bad icon buffer or a null tray surfaces.
 *
 * Usage: electron tools/check-tray.js
 */

const fs = require('fs');
const path = require('path');
const { app, Menu, Tray, nativeImage } = require('electron');

const { buildMenu } = require(path.join(__dirname, '..', 'app', 'src', 'main', 'menu.js'));
const { DEFAULTS, normalizeSettings } = require(path.join(__dirname, '..', 'app', 'src', 'main', 'settings.js'));

app.whenReady().then(() => {
  const iconPath = path.join(__dirname, '..', 'app', 'assets', 'tray.png');
  const fromFile = nativeImage.createFromPath(iconPath);
  const fromBuffer = nativeImage.createFromBuffer(fs.readFileSync(iconPath));
  console.log('icon fromPath:', JSON.stringify(fromFile.getSize()), 'empty:', fromFile.isEmpty());
  console.log('icon fromBuffer:', JSON.stringify(fromBuffer.getSize()), 'empty:', fromBuffer.isEmpty());

  try {
    const tray = new Tray(fromBuffer);
    const handlers = { patch: () => {}, quit: () => {}, reset: () => {}, reveal: () => {} };
    tray.setContextMenu(Menu.buildFromTemplate(buildMenu(normalizeSettings(DEFAULTS), handlers)));
    tray.setToolTip('DSH Status Pet — test');
    tray.destroy();
    console.log('tray create + setContextMenu OK');
  } catch (error) {
    console.error('tray failed:', error.message);
    app.exit(1);
    return;
  }
  app.exit(0);
});
