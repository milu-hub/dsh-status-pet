'use strict';

/**
 * Find the largest axis-aligned rectangle in the artwork that contains no drawn
 * pixel — the pocket the speech bubble can occupy while touching the pet's
 * artwork exactly.
 *
 * Usage: node tools/free-rect.js [targetWidth]
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const { readAlpha } = require('./png-alpha.js');

const artwork = readAlpha(path.join(__dirname, '..', 'app', 'assets', 'pet.png'));
const { width, height, alpha } = artwork;
const DRAWN = 32;

/** Largest all-free rectangle in a binary matrix (histogram method). */
function largestFreeRect() {
  const heights = new Int32Array(width);
  let best = { x: 0, y: 0, w: 0, h: 0, area: 0 };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) heights[x] = alpha[y * width + x] > DRAWN ? 0 : heights[x] + 1;
    // Largest rectangle in a histogram, with the stack trick.
    const stack = [];
    for (let x = 0; x <= width; x++) {
      const current = x === width ? 0 : heights[x];
      while (stack.length > 0 && heights[stack[stack.length - 1]] >= current) {
        const top = stack.pop();
        const barHeight = heights[top];
        const left = stack.length === 0 ? 0 : stack[stack.length - 1] + 1;
        const rectWidth = x - left;
        const area = barHeight * rectWidth;
        if (area > best.area) {
          best = { x: left, y: y - barHeight + 1, w: rectWidth, h: barHeight, area };
        }
      }
      stack.push(x);
    }
  }
  return best;
}

const rect = largestFreeRect();
const pct = (v, total) => ((100 * v) / total).toFixed(1);
console.log(`artwork ${width}x${height}`);
console.log(
  `largest free rectangle: x ${rect.x}..${rect.x + rect.w - 1} y ${rect.y}..${rect.y + rect.h - 1}  ` +
    `(${rect.w}x${rect.h} = ${pct(rect.w, width)}% x ${pct(rect.h, height)}%)`,
);
console.log(
  `as ratios: left ${(rect.x / width).toFixed(4)}  top ${(rect.y / height).toFixed(4)}  ` +
    `right ${((rect.x + rect.w) / width).toFixed(4)}  bottom ${((rect.y + rect.h) / height).toFixed(4)}`,
);

// How wide is the free pocket at various rows, to sanity-check the answer.
console.log('\nfree run length from the left edge, per row band:');
for (const frac of [0.02, 0.06, 0.1, 0.14, 0.18, 0.22, 0.26]) {
  const y = Math.round(frac * height);
  let run = 0;
  while (run < width && alpha[y * width + run] <= DRAWN) run += 1;
  console.log(`  y ${String(y).padStart(4)} (${(frac * 100).toFixed(0)}%): free to x=${run} (${pct(run, width)}%)`);
}
void fs;
