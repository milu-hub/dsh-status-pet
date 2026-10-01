'use strict';

/**
 * Capture the desktop through Chromium's own screen-capture pipeline and save a
 * crop, which reports what the compositor actually shows for layered windows.
 *
 * Usage: electron tools/screen-capture.js <out.png> [left top width height] [scale]
 */

const fs = require('fs');
const path = require('path');
const { app, desktopCapturer, nativeImage, screen } = require('electron');

const out = process.argv[2] || path.join(__dirname, '..', '.shots', 'screen.png');
const numeric = process.argv.slice(3).map(Number).filter((n) => Number.isFinite(n));
const [left = 0, top = 0, width = 0, height = 0] = numeric;
const scale = Number(process.env.PET_CAPTURE_SCALE || '1');

app.whenReady().then(async () => {
  const display = screen.getPrimaryDisplay();
  const size = display.size;
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: Math.round(size.width * scale), height: Math.round(size.height * scale) },
  });
  if (sources.length === 0) {
    console.error('no screen sources');
    app.exit(1);
    return;
  }
  const full = sources[0].thumbnail;
  const cropped =
    width > 0 && height > 0
      ? full.crop({
          x: Math.round(left * scale),
          y: Math.round(top * scale),
          width: Math.round(width * scale),
          height: Math.round(height * scale),
        })
      : full;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, cropped.toPNG());
  console.log(`saved ${out} ${cropped.getSize().width}x${cropped.getSize().height}`);
  app.exit(0);
});
