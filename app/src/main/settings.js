'use strict';

/**
 * Persisted display settings for the pet, with defensive normalisation so a
 * hand-edited or partially written file can never break the window layout.
 *
 * @module settings
 */

const fs = require('fs');
const path = require('path');

/** Pet edge length in device-independent pixels. */
const PET_SIZE_MIN = 180;
const PET_SIZE_MAX = 420;
const PET_SIZE_DEFAULT = 280;
/**
 * Width / height of the overlay asset (`assets/pet.png`). `make_pet_asset.py`
 * puts the subject on a square canvas with free space at its top-left, so the
 * widget box is square and the bubble lives in that free corner.
 */
const PET_ASPECT = 1.0;

const DEFAULTS = Object.freeze({
  language: 'zh',
  bubbleVisible: true,
  petVisible: true,
  soundEnabled: true,
  petSize: PET_SIZE_DEFAULT,
  clickThrough: false,
  position: null,
  margin: 0,
});

const LANGUAGES = new Set(['zh', 'en']);

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Coerce arbitrary input into a complete, valid settings object.
 * @param {object} [input] - partial settings.
 * @returns {object} settings with every key present and in range.
 */
function normalizeSettings(input) {
  const raw = input !== null && typeof input === 'object' ? input : {};
  const base = { ...DEFAULTS, ...raw };
  const position =
    base.position !== null && typeof base.position === 'object' && Number.isFinite(Number(base.position.x)) && Number.isFinite(Number(base.position.y))
      ? { x: Math.round(Number(base.position.x)), y: Math.round(Number(base.position.y)) }
      : null;
  return {
    language: LANGUAGES.has(base.language) ? base.language : DEFAULTS.language,
    bubbleVisible: base.bubbleVisible !== false,
    petVisible: base.petVisible !== false,
    soundEnabled: base.soundEnabled !== false,
    petSize: clampNumber(base.petSize, PET_SIZE_MIN, PET_SIZE_MAX, DEFAULTS.petSize),
    clickThrough: base.clickThrough === true,
    position,
    margin: clampNumber(base.margin, 0, 200, DEFAULTS.margin),
  };
}

/**
 * Read settings from disk, falling back to defaults.
 * @param {string} file - JSON settings path.
 * @returns {object} normalised settings.
 */
function loadSettings(file) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    return normalizeSettings(JSON.parse(text));
  } catch {
    return normalizeSettings(DEFAULTS);
  }
}

/**
 * Write settings atomically.
 * @param {string} file - JSON settings path.
 * @param {object} settings - settings to persist.
 * @returns {boolean} whether the write succeeded.
 */
function saveSettings(file, settings) {
  const payload = JSON.stringify(normalizeSettings(settings), null, 2);
  const temp = `${file}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(temp, payload, 'utf8');
    fs.renameSync(temp, file);
    return true;
  } catch (error) {
    console.warn('[dsh-status-pet] could not persist settings:', error.message);
    try {
      fs.unlinkSync(temp);
    } catch {
      /* nothing to clean up */
    }
    return false;
  }
}

module.exports = { DEFAULTS, PET_SIZE_MIN, PET_SIZE_MAX, PET_ASPECT, normalizeSettings, loadSettings, saveSettings };
