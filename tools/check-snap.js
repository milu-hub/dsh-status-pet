'use strict';

/**
 * Geometry unit test for the main process's window placement: the widget must be
 * anchored to a bottom corner of the work area, "snap to a corner" must ignore
 * any stored drag position and set the matching orientation, and the mirror rule
 * must flip the pet on the left half of the desktop.
 *
 * Usage: node tools/check-snap.js
 */

const path = require('path');

const {
  SNAP_SIDES,
  snapSide,
  widgetSize,
  snapBounds,
  currentBounds,
  resolveSnap,
  resetPlacement,
  shouldMirror,
} = require(path.join(__dirname, '..', 'app', 'src', 'main', 'placement.js'));
const { DEFAULTS, PET_ASPECT } = require(path.join(__dirname, '..', 'app', 'src', 'main', 'settings.js'));

const workArea = { x: 0, y: 0, width: 1440, height: 900 };
/** The margin comes from the settings defaults, so the test follows the app. */
const MARGIN = DEFAULTS.margin;
let failures = 0;
const expect = (label, actual, wanted) => {
  const ok = JSON.stringify(actual) === JSON.stringify(wanted);
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(52)} ${JSON.stringify(actual)}${ok ? '' : ` (wanted ${JSON.stringify(wanted)})`}`);
};

for (const petSize of [180, 280, 420]) {
  const settings = { ...DEFAULTS, petSize, position: null };
  const size = widgetSize(petSize, PET_ASPECT);
  expect(`size ${String(petSize)}: anchored bottom-right`, snapBounds(settings, workArea, PET_ASPECT), {
    x: workArea.width - size.width - MARGIN,
    y: workArea.height - size.height - MARGIN,
    width: size.width,
    height: size.height,
  });
  // The new action: the same anchor on the other side.
  const left = resolveSnap(settings, workArea, PET_ASPECT, 'left');
  expect(`size ${String(petSize)}: bottom-left bounds`, left.bounds, {
    x: MARGIN,
    y: workArea.height - size.height - MARGIN,
    width: size.width,
    height: size.height,
  });
  expect(`size ${String(petSize)}: bottom-left is mirrored`, left.mirrored, true);
}

// A stored drag position is honoured normally...
const dragged = { ...DEFAULTS, petSize: 280, position: { x: 200, y: 150 } };
expect('a drag position is honoured', currentBounds(dragged, workArea, PET_ASPECT), {
  x: 200,
  y: 150,
  width: widgetSize(280, PET_ASPECT).width,
  height: widgetSize(280, PET_ASPECT).height,
});

// ...but "snap back" ignores it, which is the bug that was reported.
expect('snap ignores the drag position', snapBounds(dragged, workArea, PET_ASPECT), {
  x: workArea.width - widgetSize(280, PET_ASPECT).width - MARGIN,
  y: workArea.height - widgetSize(280, PET_ASPECT).height - MARGIN,
  width: widgetSize(280, PET_ASPECT).width,
  height: widgetSize(280, PET_ASPECT).height,
});

// The settings patch the handler applies must actually drop the position.
const reset = resetPlacement(dragged);
expect('snap clears the stored position', reset.position, null);
expect('snap keeps the size', reset.petSize, 280);

// Snapping must also work from a dragged position, not only from a corner.
expect('bottom-left snap ignores the drag position', resolveSnap(dragged, workArea, PET_ASPECT, 'left').bounds, {
  x: MARGIN,
  y: workArea.height - widgetSize(280, PET_ASPECT).height - MARGIN,
  width: widgetSize(280, PET_ASPECT).width,
  height: widgetSize(280, PET_ASPECT).height,
});

// Orientation belongs to the action: right is the default pose, left the mirror.
expect('bottom-right snap -> default facing', resolveSnap(dragged, workArea, PET_ASPECT, 'right').mirrored, false);
expect('bottom-left snap -> mirrored facing', resolveSnap(dragged, workArea, PET_ASPECT, 'left').mirrored, true);
expect('an unknown side falls back to right', snapSide('sideways'), 'right');
expect('an omitted side falls back to right', snapSide(undefined), 'right');
expect('no side can mirror by accident', SNAP_SIDES.filter((side) => snapSide(side) === 'left'), ['left']);

// The promised orientation has to hold even where the position rule would
// disagree: a work area narrower than the widget leaves its centre on the right.
const narrow = { x: 0, y: 0, width: 320, height: 900 };
const narrowLeft = resolveSnap({ ...DEFAULTS, petSize: 420 }, narrow, PET_ASPECT, 'left');
expect('narrow area: bottom-left still promises mirrored', narrowLeft.mirrored, true);
expect(
  'narrow area: the position rule alone would say upright',
  shouldMirror(narrowLeft.bounds, narrow),
  false,
);

// A position that would sit off-screen is clamped back into the work area.
const offscreen = { ...DEFAULTS, petSize: 420, position: { x: 9999, y: 9999 } };
const clamped = currentBounds(offscreen, workArea, PET_ASPECT);
expect('an off-screen position is clamped', { x: clamped.x <= workArea.width, y: clamped.y <= workArea.height }, { x: true, y: true });

// A second display to the left of the primary one: the right-hand anchor is the
// one against that display's right edge, and the left-hand anchor its left edge.
const leftDisplay = { x: -1920, y: 0, width: 1920, height: 1080 };
const size = widgetSize(280, PET_ASPECT);
expect('left display: bottom-right anchor', resolveSnap({ ...DEFAULTS, petSize: 280 }, leftDisplay, PET_ASPECT, 'right').bounds.x, -size.width - MARGIN);
expect('left display: bottom-left anchor', resolveSnap({ ...DEFAULTS, petSize: 280 }, leftDisplay, PET_ASPECT, 'left').bounds.x, leftDisplay.x + MARGIN);

// Mirroring: the pet flips once it stands on the left half of the desktop.
const width = widgetSize(280, PET_ASPECT).width;
expect('left edge -> mirrored', shouldMirror({ x: 0, width }, workArea), true);
expect('just left of centre -> mirrored', shouldMirror({ x: workArea.width / 2 - width, width }, workArea), true);
expect('just right of centre -> upright', shouldMirror({ x: workArea.width / 2 + 1, width }, workArea), false);
expect('bottom-right anchor -> upright', shouldMirror(snapBounds({ ...DEFAULTS, petSize: 280 }, workArea, PET_ASPECT), workArea), false);
expect(
  'bottom-left anchor -> mirrored',
  shouldMirror(resolveSnap({ ...DEFAULTS, petSize: 280 }, workArea, PET_ASPECT, 'left').bounds, workArea),
  true,
);

// A second display to the left of the primary one must not invert the rule.
expect('on a left-hand display -> mirrored', shouldMirror({ x: -1920 + 100, width }, leftDisplay), true);
expect('right edge of that display -> upright', shouldMirror({ x: -width - 100, width }, leftDisplay), false);

console.log(failures === 0 ? '\nplacement OK' : `\n${String(failures)} placement check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
