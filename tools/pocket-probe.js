'use strict';

/**
 * Sweep the bubble's box against the artwork's alpha channel and report which
 * placements cover no drawn pixel at all, so the CSS numbers come from the
 * artwork instead of from eye-balling it.
 *
 * A box covers artwork exactly when some drawn pixel sits inside it. Per column
 * the only question is whether any drawn pixel falls within the box's own
 * vertical span, which is what this measures — a column whose artwork starts
 * below the box is free space.
 *
 * Usage: node tools/pocket-probe.js
 */

const path = require('path');

const { readAlpha } = require('./png-alpha.js');

const artwork = readAlpha(path.join(__dirname, '..', 'app', 'assets', 'pet.png'));
const { width, height, alpha } = artwork;

/**
 * Topmost drawn pixel (alpha > 32) per column, as a fraction of the square.
 * Columns with nothing drawn read 1.0, i.e. "artwork starts below the canvas".
 */
const topOfColumn = new Float64Array(width).fill(1);
let firstCol = width;
let firstRow = height;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (alpha[y * width + x] > 32) {
      if (y / height < topOfColumn[x]) topOfColumn[x] = y / height;
      if (x < firstCol) firstCol = x;
      if (y < firstRow) firstRow = y;
    }
  }
}

/**
 * The highest drawn pixel anywhere under a box's horizontal span, as a fraction.
 * @param {number} left - left edge, as a fraction of --pet-size.
 * @param {number} right - right edge, as a fraction of --pet-size.
 * @returns {number} the smallest column-top in that span, or 1 when all clear.
 */
function floorUnder(left, right) {
  const x0 = Math.max(0, Math.floor(left * width));
  const x1 = Math.min(width, Math.ceil(right * width));
  let floor = 1;
  for (let x = x0; x < x1; x++) if (topOfColumn[x] < floor) floor = topOfColumn[x];
  return floor;
}

/**
 * Whether a box (fractions of --pet-size, from the pet's top-left corner) covers
 * no drawn pixel. Height is tested against the artwork's top edge under the box.
 * @param {{left: number, top: number, right: number, bottom: number}} box - box.
 * @returns {boolean} true when the box is clear of the artwork.
 */
const clear = (box) => box.bottom <= floorUnder(box.left, box.right);

const pct = (v) => `${(v * 100).toFixed(1)}%`;

console.log(`artwork ${width}x${height}; drawn pixels start at x ${pct(firstCol / width)}, y ${pct(firstRow / height)}`);
console.log('\nthe artwork\'s top edge across the widget, as fractions of --pet-size:');
for (let f = 0.30; f <= 0.95; f += 0.05) {
  const x = Math.round(f * width);
  console.log(`  artwork x ${f.toFixed(2)} (pet x ${((x / width)).toFixed(2)}) -> top ${topOfColumn[x].toFixed(3)}`);
}

/** The widest / tallest clear box at a given top and inset, swept greedily. */
function envelope(inset, top) {
  const rows = [];
  for (let h = 0.15; h <= 0.6; h += 0.01) {
    let best = 0;
    for (let w = 0.1; w <= 1.3; w += 0.005) {
      if (!clear({ left: inset, top, right: inset + w, bottom: top + h })) break;
      best = w;
    }
    rows.push({ h, w: best });
  }
  return rows;
}

console.log('\nwidest clear bubble per height (inset 0.04, top 0.06):');
for (const { h, w } of envelope(0.04, 0.06)) {
  if (Math.round(h * 100) % 5 !== 0) continue;
  console.log(`  height ${h.toFixed(2)} -> widest ${w.toFixed(3)}  (right edge ${(0.04 + w).toFixed(3)}, window inner edge is 1.35)`);
}

/**
 * The tail hangs below the oval, so it needs its own test: its box is
 * viewBox x 0.69..0.93, y 0.483..0.792 of the bubble.
 */
function tailClear(inset, top, w, h) {
  const tail = { left: inset + w * 0.69, right: inset + w * 0.93, top: top + h * 0.483, bottom: top + h * 0.792 };
  return clear(tail);
}

console.log('\ncandidate bubbles, both the oval and its tail held clear:');
console.log('  inset  top   width  height   oval right   tail span        tail bottom');
for (const [inset, top, w, h] of [
  [0.04, 0.06, 0.5, 0.3],
  [0.04, 0.06, 0.55, 0.265],
  [0.04, 0.06, 0.6, 0.24],
  [0.04, 0.06, 0.66, 0.23],
  [0.04, 0.02, 0.6, 0.28],
  [0.04, 0.02, 0.66, 0.26],
  [0.02, 0.02, 0.66, 0.28],
  [0.04, 0.00, 0.66, 0.30],
]) {
  const oval = clear({ left: inset, top, right: inset + w, bottom: top + h });
  const tail = tailClear(inset, top, w, h);
  const tailBox = { left: inset + w * 0.69, right: inset + w * 0.93, bottom: top + h * 0.792 };
  console.log(
    `  ${inset.toFixed(2)}   ${top.toFixed(2)}  ${w.toFixed(2)}   ${h.toFixed(3)}    ${(inset + w).toFixed(3)}        ` +
      `${tailBox.left.toFixed(3)}..${tailBox.right.toFixed(3)}  ${tailBox.bottom.toFixed(3)}   oval ${oval ? 'clear' : 'TOUCHES'}  tail ${tail ? 'clear' : 'TOUCHES'}`,
  );
}
