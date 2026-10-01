'use strict';

/**
 * Bilingual copy for the pet speech bubble.
 *
 * One headline per state, matched by the state name the main process sends. The
 * bubble shows nothing else: a failure's text stays in the log.
 */
window.PET_STRINGS = {
  zh: {
    idle: { line1: '吐泡泡...' },
    thinking: { line1: '深度思考...' },
    working: { line1: '干活...' },
    waiting: { line1: '等待...' },
    error: { line1: '出错了...' },
    ok: { line1: 'ok!' },
  },
  en: {
    idle: { line1: 'Bubbling…' },
    thinking: { line1: 'Reasoning…' },
    working: { line1: 'Working…' },
    waiting: { line1: 'Waiting…' },
    error: { line1: 'Error…' },
    ok: { line1: 'ok!' },
  },
};
