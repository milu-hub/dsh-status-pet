'use strict';

/**
 * The widget's geometry in one place, so the checks cannot drift apart from each
 * other or from the CSS they describe.
 *
 * These numbers are hand-mirrored from the two sources that actually control the
 * layout, and every one of them is asserted against a live measurement by
 * `tools/capture.js`:
 *
 *   app/src/renderer/style.css   .bubble, .stage.is-right/.is-left .bubble, .pet
 *   app/src/renderer/index.html  the speech bubble's 200x120 viewBox and its tail
 *   app/src/main/placement.js    widgetSize() — the window ratio
 *
 * @module widget-geometry
 */

/** Window width multiple of the pet, mirroring `widgetSize` in placement.js. */
const WIDGET_RATIO = 1.35;

/** The speech bubble's box, as a multiple of --pet-size. */
const BUBBLE_BOX = { width: 0.66, height: 0.27 };
/** Distance from the widget's inner edge to the bubble, as a multiple of --pet-size. */
const BUBBLE_INSET = 0.04;
/** Distance from the widget's top to the bubble, as a multiple of --pet-size. */
const BUBBLE_TOP = 0.06;

/** The bubble's `transform-origin`, as fractions of its own box: the centre. */
const TRANSFORM_ORIGIN = { x: 0.5, y: 0.5 };

/** The bubble SVG's user space, from the viewBox in index.html. */
const VIEW_BOX = { width: 200, height: 120 };
/**
 * The tail's three points, copied from the `<path>` in index.html. The tail is a
 * spike hanging off the oval; its base (the first two points) sits on the
 * ellipse and its tip is the third.
 */
const TAIL_PATH = [
  [150, 58],
  [138, 82],
  [186, 95],
];

/** The two poses, named for the corner the pet stands in. */
const POSES = ['right', 'left'];

/**
 * The widget box for one pet size, in the widget's own pixels.
 * @param {number} petSize - the size setting.
 * @returns {{width: number, height: number}} the overlay window size.
 */
function stageSize(petSize) {
  const petEdge = Math.round(petSize / 2) * 2;
  return { width: Math.round((petEdge * WIDGET_RATIO) / 2) * 2, height: petEdge };
}

/**
 * The pet artwork's box: a square of --pet-size, anchored to the pose's corner.
 * @param {number} petSize - the size setting.
 * @param {'right'|'left'} pose - which corner the pet stands in.
 * @param {{width: number, height: number}} [stage] - the widget box.
 * @returns {{left: number, top: number, right: number, bottom: number}} rectangle.
 */
function petRect(petSize, pose, stage = stageSize(petSize)) {
  return pose === 'left'
    ? { left: 0, top: 0, right: petSize, bottom: stage.height }
    : { left: stage.width - petSize, top: 0, right: stage.width, bottom: stage.height };
}

/**
 * The bubble's box before its transform. The pose only changes which edge it
 * hangs from; its size and its inset never change, which is what makes the left
 * pose an exact reflection of the right one.
 * @param {number} petSize - the size setting.
 * @param {'right'|'left'} pose - which corner the pet stands in.
 * @param {{width: number, height: number}} [stage] - the widget box.
 * @returns {{left: number, top: number, right: number, bottom: number}} rectangle.
 */
function bubbleRect(petSize, pose, stage = stageSize(petSize)) {
  const width = petSize * BUBBLE_BOX.width;
  const height = petSize * BUBBLE_BOX.height;
  const top = petSize * BUBBLE_TOP;
  const left = pose === 'left' ? stage.width - petSize * BUBBLE_INSET - width : petSize * BUBBLE_INSET;
  return { left, top, right: left + width, bottom: top + height };
}

/**
 * The tail's bounding box in bubble-local units, x from the bubble's left edge
 * and y from its top, both 0..1 of the bubble's own size.
 *
 * The viewBox is stretched onto the bubble box (preserveAspectRatio is left at
 * its default `meet` only inside a matching box; the element fills the bubble,
 * so the box's own mapping is what the check needs). Because the bubble's
 * aspect ratio is not the viewBox's, the mapping is per-axis.
 * @returns {{left: number, top: number, right: number, bottom: number}} ratios.
 */
function tailRatios() {
  const xs = TAIL_PATH.map(([x]) => x / VIEW_BOX.width);
  const ys = TAIL_PATH.map(([, y]) => y / VIEW_BOX.height);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

/**
 * The tail's bounding box in widget pixels, in the same space as {@link bubbleRect}.
 *
 * The tail lives inside the bubble, so in the left pose it is carried along by
 * the bubble's `scaleX(-1)` about the bubble's own centre. It therefore does not
 * land where a reflection of the stage would put it: it swaps to the other side
 * of the box, which is exactly what makes it point at the pet.
 *
 * @param {number} petSize - the size setting.
 * @param {'right'|'left'} pose - which corner the pet stands in.
 * @param {{width: number, height: number}} [stage] - the widget box.
 * @returns {{left: number, top: number, right: number, bottom: number}} rectangle.
 */
function tailRect(petSize, pose, stage = stageSize(petSize)) {
  const bubble = bubbleRect(petSize, pose, stage);
  const ratios = tailRatios();
  const width = bubble.right - bubble.left;
  const height = bubble.bottom - bubble.top;
  return {
    left: bubble.left + width * (pose === 'left' ? 1 - ratios.right : ratios.left),
    top: bubble.top + height * ratios.top,
    right: bubble.left + width * (pose === 'left' ? 1 - ratios.left : ratios.right),
    bottom: bubble.top + height * ratios.bottom,
  };
}

/**
 * Every rectangle the layout checks care about, for one pet size and pose.
 * @param {number} petSize - the size setting.
 * @param {'right'|'left'} pose - which corner the pet stands in.
 * @returns {{stage: object, pet: object, bubble: object, tail: object, pose: string}} rectangles.
 */
function layout(petSize, pose = 'right') {
  const stage = stageSize(petSize);
  return {
    pose,
    stage,
    pet: petRect(petSize, pose, stage),
    bubble: bubbleRect(petSize, pose, stage),
    tail: tailRect(petSize, pose, stage),
  };
}

/**
 * Reflect a widget-space rectangle through the widget's vertical centre line.
 * The left pose is the exact mirror of the right one, so this is the identity
 * the checks assert.
 * @param {{left: number, top: number, right: number, bottom: number}} rect - rectangle.
 * @param {number} width - the widget width.
 * @returns {{left: number, top: number, right: number, bottom: number}} reflected rectangle.
 */
function reflect(rect, width) {
  return { left: width - rect.right, top: rect.top, right: width - rect.left, bottom: rect.bottom };
}

module.exports = {
  WIDGET_RATIO,
  BUBBLE_BOX,
  BUBBLE_INSET,
  BUBBLE_TOP,
  TRANSFORM_ORIGIN,
  VIEW_BOX,
  TAIL_PATH,
  POSES,
  stageSize,
  petRect,
  bubbleRect,
  tailRatios,
  tailRect,
  layout,
  reflect,
};
