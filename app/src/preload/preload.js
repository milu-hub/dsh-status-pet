'use strict';

/**
 * Preload bridge: exposes a tiny, explicit API to the renderer and nothing else.
 *
 * @module preload
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  /** @returns {Promise<{settings: object, status: object, version: string}>} initial state. */
  hello: () => ipcRenderer.invoke('pet:hello'),
  /** Apply a partial settings patch. */
  patch: (patch) => ipcRenderer.send('pet:patch', patch),
  /** Open the native context menu at the cursor. */
  openMenu: () => ipcRenderer.send('pet:menu'),
  /**
   * Snap the widget to a bottom corner, dropping any drag position: 'right'
   * restores the default pose, 'left' the mirrored one.
   * @param {'right'|'left'} [side] - which corner, bottom-right by default.
   */
  snap: (side) => ipcRenderer.send('pet:snap', side === 'left' ? 'left' : 'right'),
  /** Move the window by a delta in screen pixels while dragging. */
  drag: (dx, dy) => ipcRenderer.send('pet:drag', { dx, dy }),
  /** Finish a drag and persist the resting position. */
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  /** @param {(payload: {settings: object, status: object}) => void} listener */
  onState: (listener) => {
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on('pet:state', wrapped);
    return () => ipcRenderer.removeListener('pet:state', wrapped);
  },
});
