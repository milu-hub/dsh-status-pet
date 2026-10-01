'use strict';

/**
 * Assert the widget geometry with the *artwork's own alpha channel*: the bubble,
 * including its tail, must stay inside the window, the two poses must be exact
 * reflections of each other, and the tail must always point at the pet.
 *
 * The left pose is the case this check exists for now: the pet turning around
 * while its speech bubble stayed put is exactly what these assertions catch.
 *
 * One deliberate overlap is reported rather than failed. The bubble is an
 * earlier sibling of the pet in the DOM, so the artwork paints over the bubble's
 * outer edge; the check keeps a ceiling on how much artwork that edge may reach
 * so it can never grow into a real collision unnoticed.
 *
 * Usage: node tools/check-layout.js
 */

const path = require('path');

const { readAlpha } = require('./png-alpha.js');
const geometry = require('./widget-geometry.js');
const { SIZES } = require(path.join(__dirname, '..', 'app', 'src', 'main', 'menu.js'));
const { PET_ASPECT } = require(path.join(__dirname, '..', 'app', 'src', 'main', 'settings.js'));
const { widgetSize } = require(path.join(__dirname, '..', 'app', 'src', 'main', 'placement.js'));

/** The artwork is square, so the pet's box is a square of --pet-size. */
if (PET_ASPECT !== 1) {
  console.error(`FAIL this check assumes a square artwork, but PET_ASPECT is ${String(PET_ASPECT)}`);
  process.exit(1);
}

/**
 * Ceiling on the drawn artwork the bubble's outer corner may reach, as a fraction
 * of the artwork's pixels. The shipped layout sits at 0.0000 in the right pose and
 * 0.0005 in the left, the latter only because rounding a width to whole pixels can
 * shift a reflected edge by half a pixel into the hair's outline. Growing the
 * bubble past the pocket pushes this up by whole percent, so the budget is what
 * keeps the bubble off the artwork.
 */
const MAX_BODY_COVERAGE = 0.001;
const MAX_TAIL_COVERAGE = 0.001;

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail === '' ? '' : `   ${detail}`}`);
};

const artwork = readAlpha(path.join(__dirname, '..', 'app', 'assets', 'pet.png'));
console.log(`artwork: ${artwork.width}x${artwork.height}\n`);

/**
 * Count drawn pet pixels (alpha > 32) covered by an axis-aligned rect, and
 * report the first one found.
 * @param {{left: number, top: number, right: number, bottom: number}} rect - rectangle.
 * @param {{left: number, top: number, right: number, bottom: number}} pet - the artwork's box.
 * @returns {{hits: number, worst: object|null}} coverage.
 */
function coveredDrawnPixels(rect, pet) {
  const scaleX = artwork.width / (pet.right - pet.left);
  const scaleY = artwork.height / (pet.bottom - pet.top);
  let hits = 0;
  let worst = null;
  for (let y = Math.max(0, Math.floor(rect.top)); y < Math.min(pet.bottom, Math.ceil(rect.bottom)); y++) {
    const ay = Math.min(artwork.height - 1, Math.max(0, Math.floor((y - pet.top) * scaleY)));
    for (let x = Math.max(0, Math.floor(rect.left)); x < Math.min(pet.right, Math.ceil(rect.right)); x++) {
      const ax = Math.min(artwork.width - 1, Math.max(0, Math.floor((x - pet.left) * scaleX)));
      if (artwork.alpha[ay * artwork.width + ax] > 32) {
        hits += 1;
        if (worst === null) worst = { x, y };
      }
    }
  }
  return { hits, worst };
}

/** Largest per-edge difference between two rectangles, in widget pixels. */
const maxDelta = (a, b) => Math.max(...['left', 'top', 'right', 'bottom'].map((edge) => Math.abs(a[edge] - b[edge])));

/**
 * Sub-pixel tolerance for the reflection identities. The window width is rounded
 * to a whole even number of pixels while the bubble's inset is a fraction of
 * --pet-size, so the two poses can disagree by up to that rounding; a layout bug
 * would move a rectangle by tens of pixels, so this still catches one.
 */
const MIRROR_TOLERANCE = 1.5;

console.log(' pose   size  window      bubble[x1..x2, y1..y2]        tail→pet gap   drawn pixels reached');
const sizes = [...new Set(SIZES)].sort((a, b) => a - b);
const artworkPixels = artwork.width * artwork.height;
for (const pose of geometry.POSES) {
  for (const size of sizes) {
    const { stage, pet, bubble, tail } = geometry.layout(size, pose);
    // Distance from the tail's outer edge to the pet's near edge, so the sign of
    // the gap means the same thing in both poses.
    const gapX = pose === 'left' ? pet.right - tail.right : pet.left - tail.right;
    const gapY = pet.bottom - tail.bottom;
    const insideStage = bubble.left >= 0 && bubble.top >= 0 && bubble.right <= stage.width && bubble.bottom <= stage.height;
    const tailInside = tail.left >= 0 && tail.right <= stage.width && tail.top >= 0 && tail.bottom <= stage.height;
    const body = coveredDrawnPixels(bubble, pet);
    const tip = coveredDrawnPixels(tail, pet);
    const ok =
      insideStage &&
      tailInside &&
      body.hits <= MAX_BODY_COVERAGE * artworkPixels &&
      tip.hits <= MAX_TAIL_COVERAGE * artworkPixels;
    if (!ok) failures += 1;
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${pose.padEnd(5)} ${String(size).padStart(4)}  ${stage.width}x${stage.height}   ` +
        `[${bubble.left.toFixed(0).padStart(3)}..${bubble.right.toFixed(0).padStart(3)}, ${bubble.top.toFixed(0).padStart(3)}..${bubble.bottom.toFixed(0).padStart(3)}]  ` +
        `x ${gapX.toFixed(0).padStart(4)} y ${gapY.toFixed(0).padStart(4)}   ` +
        `body ${(body.hits / artworkPixels).toFixed(4)}  tail ${(tip.hits / artworkPixels).toFixed(4)}` +
        `${insideStage ? '' : '  OVERFLOWS WINDOW'}`,
    );
  }
}

console.log('');
// The window the checks assume must be the window the app actually opens.
for (const size of sizes) {
  const { stage } = geometry.layout(size, 'right');
  check(
    `size ${String(size).padStart(3)}: window matches the main process`,
    JSON.stringify(stage) === JSON.stringify(widgetSize(size, PET_ASPECT)),
    `${JSON.stringify(stage)} vs ${JSON.stringify(widgetSize(size, PET_ASPECT))}`,
  );
}

// The left pose has to be the right pose reflected, or the two poses would not
// be the same composition and the pet would visibly jump when it turns.
for (const size of sizes) {
  const right = geometry.layout(size, 'right');
  const left = geometry.layout(size, 'left');
  const width = right.stage.width;
  for (const part of ['bubble', 'pet']) {
    const delta = maxDelta(left[part], geometry.reflect(right[part], width));
    check(`size ${String(size).padStart(3)}: ${part} mirrors`, delta <= MIRROR_TOLERANCE, `off by ${delta.toFixed(2)}px`);
  }

  // The tail is carried by the bubble's flip about the bubble's centre, so it is
  // reflected inside the box rather than where a reflection of the widget would
  // put it. Mirroring about the centre means the distance from the box's left
  // edge upright has to equal the distance from its right edge flipped.
  const tailNearEdgeGap = (layout) =>
    layout.pose === 'left' ? layout.bubble.right - layout.tail.right : layout.tail.left - layout.bubble.left;
  const gapRight = tailNearEdgeGap(right);
  const gapLeft = tailNearEdgeGap(left);
  check(
    `size ${String(size).padStart(3)}: tail gap mirrors inside the bubble`,
    Math.abs(gapRight - gapLeft) <= MIRROR_TOLERANCE,
    `${gapRight.toFixed(2)}px vs ${gapLeft.toFixed(2)}px`,
  );

  // The pose is what decides which side the tail is on: this is the assertion
  // that fails when the pet turns around and its speech bubble does not follow.
  const tailCentreIsLeft = (rect) => rect.left + (rect.right - rect.left) / 2 < width / 2;
  check(
    `size ${String(size).padStart(3)}: tail changes side with the pose`,
    tailCentreIsLeft(right.tail) !== tailCentreIsLeft(left.tail),
    `right pose ${tailCentreIsLeft(right.tail) ? 'left' : 'right'} half, left pose ${tailCentreIsLeft(left.tail) ? 'left' : 'right'} half`,
  );
}

// The tail has to hang off the oval on the pet's side, not off the far edge.
const ratios = geometry.tailRatios();
check("tail sits in the bubble's outer half when upright", ratios.left >= 0.5, `left ${ratios.left.toFixed(3)}`);
check(
  'tail is inside the bubble box on both axes',
  ratios.top >= 0 && ratios.bottom <= 1 && ratios.left >= 0 && ratios.right <= 1,
);
check(
  'tail hangs off the oval but stays clear of the far edge',
  ratios.left > 0.5 && ratios.right < 0.99,
  `tail occupies x ${ratios.left.toFixed(2)}..${ratios.right.toFixed(2)} of the bubble`,
);

console.log(
  failures === 0
    ? '\nlayout OK: both poses fit the window, mirror exactly, and keep the tail on the pet\'s side'
    : `\n${String(failures)} layout check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
