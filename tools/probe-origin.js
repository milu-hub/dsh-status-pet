'use strict';

/**
 * One-off: does a percentage `transform-origin` resolve against the element's own
 * box or against its containing block? Prints the resolved origin and the visual
 * box before and after a scaleX(-1).
 *
 * Usage: electron tools/probe-origin.js
 */

const path = require('path');
const { app, BrowserWindow } = require('electron');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 600, height: 300, show: false, useContentSize: true });
  await win.loadURL('data:text/html,<html><body style="margin:0"></body></html>');
  const out = await win.webContents.executeJavaScript(`
    (() => {
      const parent = document.createElement('div');
      parent.style.cssText = 'position:relative;width:378px;height:280px';
      const el = document.createElement('div');
      el.id = 'subject';
      el.style.cssText = 'position:absolute;left:30.8px;width:336px;height:140px;top:16.8px;background:#ccc;transform-origin:22% 92%';
      parent.appendChild(el);
      document.body.appendChild(parent);
      const before = el.getBoundingClientRect();
      const originBefore = getComputedStyle(el).transformOrigin;
      el.style.transform = 'scaleX(-1)';
      const after = el.getBoundingClientRect();
      const originAfter = getComputedStyle(el).transformOrigin;
      return {
        offsetWidth: el.offsetWidth,
        offsetLeft: el.offsetLeft,
        before: [before.left, before.right],
        originBefore,
        after: [after.left, after.right],
        originAfter,
      };
    })()
  `);
  console.log(JSON.stringify(out, null, 2));
  console.log('pre-transform box: 30.8 .. 366.8 (width 336)');
  console.log('origin if 22% of own width, from own left edge :', 30.8 + 0.22 * 336);
  console.log('origin if 22% of containing block width        :', 0.22 * 378);
  app.quit();
});
