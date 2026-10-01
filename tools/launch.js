'use strict';

/**
 * Launch the pet without a console window, reusing the pnpm-managed Electron.
 *
 * Falls back to a bare `electron` on PATH when the project-local install is
 * missing, so the script keeps working after a plain global install.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const appDir = path.join(__dirname, '..', 'app');
const localCli = path.join(appDir, 'node_modules', 'electron', 'cli.js');

/** @returns {string[]} argv for the Electron launcher. */
function launcher() {
  if (fs.existsSync(localCli)) return [process.execPath, [localCli, appDir]];
  return [process.platform === 'win32' ? 'electron.cmd' : 'electron', [appDir]];
}

const [command, args] = launcher();
// A harness-spawned shell can inherit ELECTRON_RUN_AS_NODE / ELECTRON_NO_ATTACH_CONSOLE,
// which would turn the Electron binary into a plain Node interpreter.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_NO_ATTACH_CONSOLE;
delete env.ELECTRON_FORCE_IS_PACKAGED;
const child = spawn(command, args, {
  cwd: appDir,
  env,
  detached: true,
  stdio: 'ignore',
  windowsHide: false,
});
child.unref();
console.log(`DSH Status Pet started (pid ${String(child.pid)}).`);
