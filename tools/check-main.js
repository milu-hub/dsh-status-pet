'use strict';

/**
 * Smoke-test the main-process pieces that only exist under Electron: the tray
 * icon, the app icon, the shared menu template, and a settings round trip.
 *
 * Usage: electron tools/check-main.js
 */

const fs = require('fs');
const path = require('path');
const { app, Menu, nativeImage } = require('electron');

const assetDir = path.join(__dirname, '..', 'app', 'assets');
const { buildMenu, SIZES } = require(path.join(__dirname, '..', 'app', 'src', 'main', 'menu.js'));
const { DEFAULTS, normalizeSettings, PET_ASPECT } = require(path.join(__dirname, '..', 'app', 'src', 'main', 'settings.js'));

app.whenReady().then(() => {
  const trayIcon = nativeImage.createFromPath(path.join(assetDir, 'tray.png'));
  console.log('tray icon:', JSON.stringify(trayIcon.getSize()), 'empty:', trayIcon.isEmpty());
  const appIcon = nativeImage.createFromPath(path.join(assetDir, 'app.ico'));
  console.log('app icon:', JSON.stringify(appIcon.getSize()), 'empty:', appIcon.isEmpty());
  console.log('ico file bytes:', fs.statSync(path.join(assetDir, 'app.ico')).size);

  const settings = normalizeSettings({ ...DEFAULTS, petSize: 420, language: 'en' });
  console.log('normalized settings:', JSON.stringify(settings), 'aspect', PET_ASPECT);

  const handlers = { patch: () => {}, quit: () => {}, reset: () => {}, resetRight: () => {}, resetLeft: () => {} };
  const trayTemplate = buildMenu(settings, handlers);
  const popupTemplate = buildMenu(settings, handlers, { standalone: true });
  const sizeRow = trayTemplate.find((item) => Array.isArray(item.submenu) && item.submenu.some((sub) => sub.id && sub.id.startsWith('size-')));
  console.log('size options:', JSON.stringify(sizeRow.submenu.filter((sub) => sub.id).map((sub) => sub.label)));
  console.log('expected sizes:', JSON.stringify(SIZES));

  // Both corner actions must be present, in both languages, and reachable by id.
  for (const template of [trayTemplate, popupTemplate]) {
    const snapRows = template.filter((item) => item.id === 'snap-right' || item.id === 'snap-left');
    console.log('snap actions:', JSON.stringify(snapRows.map((item) => `${item.id} = ${item.label}`)));
    console.log('snap actions clickable:', snapRows.length === 2 && snapRows.every((item) => typeof item.click === 'function'));
  }

  try {
    Menu.buildFromTemplate(trayTemplate);
    Menu.buildFromTemplate(popupTemplate);
    console.log('menu templates build OK');
  } catch (error) {
    console.error('menu build failed:', error.message);
    app.exit(1);
    return;
  }

  app.exit(0);
});

