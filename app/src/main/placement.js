'use strict';

/**
 * Window placement maths for the pet widget, kept free of Electron so it can be
 * unit tested: anchoring to a bottom corner, honouring a dragged position, and
 * snapping back when the user asks for it.
 *
 * @module placement
 */

/** The two corners the widget can live in, named for their place on screen. */
const SNAP_SIDES = ['right', 'left'];

/**
 * Normalise a requested corner. Anything unrecognised falls back to the
 * default bottom-right anchor, which is where the widget starts life.
 * @param {string} side - 'right' or 'left'.
 * @returns {'right'|'left'} a valid side.
 */
function snapSide(side) {
  return side === 'left' ? 'left' : 'right';
}

/**
 * Widget box in device-independent pixels for one pet size.
 * @param {number} petSize - the size setting.
 * @param {number} aspect - artwork width / height.
 * @returns {{width: number, height: number}} widget size.
 */
function widgetSize(petSize, aspect) {
  const petEdge = petSize * Math.max(1, aspect);
  return {
    width: Math.round((petEdge * 1.35) / 2) * 2,
    height: Math.round(petEdge / 2) * 2,
  };
}

/** Keep the whole widget reachable inside the work area. */
function clampToArea(bounds, area) {
  return {
    x: Math.min(Math.max(bounds.x, area.x), Math.max(area.x, area.x + area.width - bounds.width)),
    y: Math.min(Math.max(bounds.y, area.y), Math.max(area.y, area.y + area.height - bounds.height)),
    width: bounds.width,
    height: bounds.height,
  };
}

/**
 * Bounds for the current settings: the stored drag position when there is one,
 * otherwise the requested bottom corner of the work area.
 * @param {object} settings - current settings.
 * @param {{x: number, y: number, width: number, height: number}} area - work area.
 * @param {number} aspect - artwork width / height.
 * @param {{keepPosition?: boolean, side?: string}} [options] - set
 * `keepPosition: false` to ignore any dragged position; `side` picks the corner
 * to fall back to.
 * @returns {{x: number, y: number, width: number, height: number}} window bounds.
 */
function currentBounds(settings, area, aspect, options = {}) {
  const { width, height } = widgetSize(settings.petSize, aspect);
  const margin = Number.isFinite(settings.margin) ? settings.margin : 12;
  const stored = options.keepPosition === false ? null : settings.position;
  const side = snapSide(options.side);
  const anchored = {
    x: side === 'left' ? area.x + margin : area.x + area.width - width - margin,
    y: area.y + area.height - height - margin,
    width,
    height,
  };
  const wanted =
    stored !== null && stored !== undefined && Number.isFinite(stored.x) && Number.isFinite(stored.y)
      ? { x: stored.x, y: stored.y, width, height }
      : anchored;
  const clamped = clampToArea(wanted, area);
  return { x: Math.round(clamped.x), y: Math.round(clamped.y), width, height };
}

/**
 * The bottom-right anchor, ignoring any stored drag position.
 * @param {object} settings - current settings.
 * @param {{x: number, y: number, width: number, height: number}} area - work area.
 * @param {number} aspect - artwork width / height.
 * @returns {{x: number, y: number, width: number, height: number}} window bounds.
 */
function snapBounds(settings, area, aspect) {
  return currentBounds(settings, area, aspect, { keepPosition: false, side: 'right' });
}

/**
 * Decide where one "snap to a corner" menu action puts the widget.
 *
 * The orientation is part of the action, not a side effect of the maths: the
 * bottom-right corner means the default pose, with the pet in its own artwork
 * direction facing left and the bubble up in the top-left; the bottom-left
 * corner means the mirrored pose, with both of them flipped to face right into
 * the screen. `mirrored` is returned explicitly rather than derived from the
 * resulting bounds so a left snap still lands mirrored on a work area so narrow
 * that the widget's centre falls right of the middle.
 *
 * @param {object} settings - current settings.
 * @param {{x: number, y: number, width: number, height: number}} area - work area.
 * @param {number} aspect - artwork width / height.
 * @param {string} side - 'right' for the default pose, 'left' for the mirror.
 * @returns {{bounds: object, mirrored: boolean}} where to put the widget, and
 * which way it should face once it is there.
 */
function resolveSnap(settings, area, aspect, side) {
  const target = snapSide(side);
  return {
    bounds: currentBounds(settings, area, aspect, { keepPosition: false, side: target }),
    mirrored: target === 'left',
  };
}

/**
 * Settings as they look right after a snap: the drag position is dropped.
 * @param {object} settings - current settings.
 * @returns {object} settings with no stored position.
 */
function resetPlacement(settings) {
  return { ...settings, position: null };
}

/**
 * Whether the pet should be mirrored to face the middle of the screen.
 *
 * The artwork looks to the left, so on the left half of the desktop it would
 * face the edge; flipping it there makes it look inward. The bubble is flipped
 * with it — as a block, in the renderer — so the two of them turn together and
 * the text still reads left to right.
 *
 * @param {{x: number, width: number}} bounds - window bounds.
 * @param {{x: number, width: number}} area - work area of the display.
 * @returns {boolean} true when the pet sits in the left half.
 */
function shouldMirror(bounds, area) {
  const petCenter = bounds.x + bounds.width / 2;
  const areaCenter = area.x + area.width / 2;
  return petCenter < areaCenter;
}

module.exports = {
  SNAP_SIDES,
  snapSide,
  widgetSize,
  clampToArea,
  currentBounds,
  snapBounds,
  resolveSnap,
  resetPlacement,
  shouldMirror,
};
