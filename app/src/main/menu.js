'use strict';

/**
 * Shared menu template for the tray icon and the pet's right-click menu.
 * Labels follow the current language setting.
 *
 * @module menu
 */

const { PET_SIZE_MAX, PET_SIZE_MIN } = require('./settings');

/** Bilingual labels for every menu entry. */
const TEXT = {
  title: { zh: 'DSH 工作状态桌宠', en: 'DSH Status Pet' },
  bubble: { zh: '显示对话框', en: 'Show speech bubble' },
  pet: { zh: '显示桌宠', en: 'Show pet' },
  sound: { zh: '音效', en: 'Sound effects' },
  size: { zh: '桌宠大小', en: 'Pet size' },
  sizeSmall: { zh: '小', en: 'Small' },
  sizeMedium: { zh: '中', en: 'Medium' },
  sizeLarge: { zh: '大', en: 'Large' },
  language: { zh: '语言 / Language', en: 'Language / 语言' },
  resetRight: { zh: '回到右下角', en: 'Snap to bottom-right (default facing)' },
  resetLeft: { zh: '回到左下角', en: 'Snap to bottom-left (mirrored facing)' },
  resetAll: { zh: '恢复默认设置', en: 'Reset all settings' },
  quit: { zh: '退出', en: 'Quit' },
};

/** The only three sizes the menu offers. */
const SIZES = [180, 280, 420];
/** Settings-layer clamp, surfaced here so the submenu can show the same range. */
const SIZE_RANGE = `${PET_SIZE_MIN}–${PET_SIZE_MAX}px`;

function t(key, language) {
  const entry = TEXT[key];
  if (entry === undefined) return key;
  return language === 'en' ? entry.en : entry.zh;
}

/**
 * Build the shared menu template.
 * @param {object} settings - current settings.
 * @param {{patch: Function, quit: Function, resetRight: Function, resetLeft: Function, reset: Function}} handlers - actions.
 * @returns {Array<object>} Electron menu template.
 */
function buildMenu(settings, handlers, options = {}) {
  const language = settings.language === 'en' ? 'en' : 'zh';
  const template = [
    { label: t('title', language), enabled: false },
    { type: 'separator' },
    {
      label: t('pet', language),
      type: 'checkbox',
      checked: settings.petVisible !== false,
      click: (item) => handlers.patch({ petVisible: item.checked }),
    },
    {
      label: t('bubble', language),
      type: 'checkbox',
      checked: settings.bubbleVisible !== false,
      click: (item) => handlers.patch({ bubbleVisible: item.checked }),
    },
    {
      label: t('sound', language),
      type: 'checkbox',
      checked: settings.soundEnabled !== false,
      click: (item) => handlers.patch({ soundEnabled: item.checked }),
    },
    { type: 'separator' },
    {
      label: t('size', language),
      submenu: [
        { id: 'size-small', label: `${t('sizeSmall', language)} · ${SIZES[0]}px`, type: 'radio', checked: settings.petSize === SIZES[0], click: () => handlers.patch({ petSize: SIZES[0] }) },
        { id: 'size-medium', label: `${t('sizeMedium', language)} · ${SIZES[1]}px`, type: 'radio', checked: settings.petSize === SIZES[1], click: () => handlers.patch({ petSize: SIZES[1] }) },
        { id: 'size-large', label: `${t('sizeLarge', language)} · ${SIZES[2]}px`, type: 'radio', checked: settings.petSize === SIZES[2], click: () => handlers.patch({ petSize: SIZES[2] }) },
        { type: 'separator' },
        { label: SIZE_RANGE, enabled: false },
      ],
    },
    {
      label: t('language', language),
      submenu: [
        { label: '中文', type: 'radio', checked: language === 'zh', click: () => handlers.patch({ language: 'zh' }) },
        { label: 'English', type: 'radio', checked: language === 'en', click: () => handlers.patch({ language: 'en' }) },
      ],
    },
    { type: 'separator' },
    { id: 'snap-right', label: t('resetRight', language), click: () => handlers.resetRight() },
    { id: 'snap-left', label: t('resetLeft', language), click: () => handlers.resetLeft() },
    { label: t('resetAll', language), click: () => handlers.reset() },
    { type: 'separator' },
    { label: t('quit', language), click: () => handlers.quit() },
  ];
  if (options.standalone === true) {
    // A popup menu inherits no tray role, so the header row stays informative.
    template[0].enabled = false;
  }
  return template;
}

module.exports = { buildMenu, SIZES, TEXT };
