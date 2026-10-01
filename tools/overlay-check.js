'use strict';

/**
 * Report where the bubble and its tail land relative to the pet artwork, in the
 * widget's own pixels, and how much drawn artwork they cover — in both poses, so
 * the mirrored layout can be eyeballed while tuning.
 *
 * The geometry comes from `widget-geometry.js`, which mirrors the CSS and the
 * SVG by hand; `check-layout.js` is the authoritative assertion.
 *
 * Usage: node tools/overlay-check.js [petSize]
 */

const path = require('path');

const { readAlpha } = require('./png-alpha.js');
const geometry = require('./widget-geometry.js');

const petSize = Number(process.argv[2] || 280);
const artwork = readAlpha(path.join(__dirname, '..', 'app', 'assets', 'pet.png'));

/**
 * Count drawn artwork pixels under one rectangle, and the first and last row
 * that hit.
 * @param {{left: number, top: number, right: number, bottom: number}} rect - rectangle.
 * @param {{left: number, top: number, right: number, bottom: number}} pet - the artwork's box.
 * @param {{width: number, height: number}} stage - the widget box.
 * @returns {{hits: number, firstRow: number|null, lastRow: number|null}} coverage.
 */
function coverage(rect, pet, stage) {
  const scaleX = artwork.width / (pet.right - pet.left);
  const scaleY = artwork.height / (pet.bottom - pet.top);
  let hits = 0;
  let firstRow = null;
  let lastRow = null;
  for (let y = Math.max(0, Math.floor(rect.top)); y < Math.min(stage.height, Math.ceil(rect.bottom)); y++) {
    const ay = Math.min(artwork.height - 1, Math.max(0, Math.floor((y - pet.top) * scaleY)));
    for (let x = Math.max(0, Math.floor(rect.left)); x < Math.min(stage.width, Math.ceil(rect.right)); x++) {
      const ax = Math.min(artwork.width - 1, Math.max(0, Math.floor((x - pet.left) * scaleX)));
      if (artwork.alpha[ay * artwork.width + ax] > 32) {
        hits += 1;
        if (firstRow === null) firstRow = y;
        lastRow = y;
      }
    }
  }
  return { hits, firstRow, lastRow };
}

const format = (rect) => `x ${rect.left.toFixed(0).padStart(4)}..${rect.right.toFixed(0).padStart(4)}  y ${rect.top.toFixed(0).padStart(4)}..${rect.bottom.toFixed(0).padStart(4)}`;

/**
 * Ceiling on the drawn artwork the bubble's outer corner may reach, as a fraction
 * of the artwork's pixels — the same budget `check-layout.js` asserts. The bubble
 * is an earlier DOM sibling of the pet, so the artwork paints over its outer edge;
 * `check-layout.js` is the authoritative assertion, and this is the tuning view.
 */
const COVERAGE_BUDGET = 0.0155;

let failures = 0;
for (const pose of geometry.POSES) {
  const { stage, pet, bubble, tail } = geometry.layout(petSize, pose);
  const body = coverage(bubble, pet, stage);
  const tip = coverage(tail, pet, stage);
  const gapX = pose === 'left' ? pet.right - tail.right : pet.left - tail.right;
  const fraction = (body.hits + tip.hits) / (artwork.width * artwork.height);
  if (fraction > COVERAGE_BUDGET) failures += 1;
  console.log(
    `${pose === 'left' ? 'left ' : 'right'} pose: pet in bottom-${pose}   window ${stage.width}x${stage.height}   artwork box x ${pet.left.toFixed(0)}..${pet.right.toFixed(0)}`,
  );
  console.log(`            bubble  ${format(bubble)}   covers drawn pixels: ${body.hits}`);
  console.log(
    `            tail    ${format(tail)}   covers drawn pixels: ${tip.hits}   gap to the pet x ${gapX.toFixed(1)}px`,
  );
  console.log(`            total covered ${(fraction * 100).toFixed(2)}% of the artwork (budget ${(COVERAGE_BUDGET * 100).toFixed(2)}%)`);

  // Where the pocket ends: the first artwork column whose drawn pixels rise
  // above the bubble's bottom edge. Everything left of it is free space the
  // bubble could have used, so comparing it with the bubble's left edge says how
  // much room the current width is spending.
  const petWidth = pet.right - pet.left;
  let pocketEdge = null;
  for (let column = 0; column < artwork.width && pocketEdge === null; column++) {
    const widgetX = pet.left + (column / artwork.width) * petWidth;
    if (widgetX > bubble.right) break;
    for (let y = 0; y < artwork.height; y++) {
      if (artwork.alpha[y * artwork.width + column] > 32) {
        if (pet.top + (y / artwork.height) * (pet.bottom - pet.top) < bubble.bottom) pocketEdge = column / artwork.width;
        break;
      }
    }
  }
  console.log(
    `            the pocket (artwork columns clear above the bubble's bottom) runs to x ${pocketEdge === null ? 'the far edge' : pocketEdge.toFixed(3)}` +
      `; the bubble spans x ${((bubble.left - pet.left) / petWidth).toFixed(3)}..${((bubble.right - pet.left) / petWidth).toFixed(3)} of the pet\n`,
  );
}

console.log(
  failures === 0
    ? 'OK: both poses stay within the coverage budget'
    : 'OVER: the bubble or its tail reached past the coverage budget',
);
process.exit(failures === 0 ? 0 : 1);
