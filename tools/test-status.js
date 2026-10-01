'use strict';

/**
 * End-to-end check of the status machine: drives a scratch journal through the
 * real StatusReader and asserts the states the pet will show.
 *
 * Usage: node tools/test-status.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const { StatusReader } = require(path.join(__dirname, '..', 'app', 'src', 'main', 'status-reader.js'));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-test-'));
const journal = path.join(dir, 'session-test.jsonl.zstd');
fs.writeFileSync(journal, Buffer.alloc(0));

const reader = new StatusReader({ dshHome: dir, intervalMs: 1_000_000_000 });
const seen = [];
reader.on('status', (status) => seen.push(status.state));
const append = (event) => fs.appendFileSync(journal, zlib.zstdCompressSync(Buffer.from(`${JSON.stringify(event)}\n`, 'utf8')));
const step = (event) => {
  append(event);
  reader.tick();
  return reader.snapshot().state;
};

let failures = 0;
const expect = (label, actual, wanted) => {
  const ok = actual === wanted;
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(34)} ${actual}${ok ? '' : ` (wanted ${wanted})`}`);
};

expect('session header', step({ type: 'session', version: 4, id: 'test' }), 'idle');
expect('turn/start', step({ type: 'turn/start', seq: 2, data: { turn: 1 } }), 'working');
expect('step/start', step({ type: 'step/start', seq: 3, data: { turn: 1, step: 1 } }), 'thinking');
expect('tool/call', step({ type: 'tool/call', seq: 4, data: {} }), 'working');
expect('tool/result keeps 干活', step({ type: 'tool/result', seq: 5, data: {} }), 'working');
expect('next edit is still 干活', step({ type: 'tool/call', seq: 6, data: {} }), 'working');
expect('edit result is still 干活', step({ type: 'tool/result', seq: 7, data: {} }), 'working');
expect('final answer streams as 深度思考', step({ type: 'assistant/message', seq: 8, data: {} }), 'thinking');
expect('turn/end completed', step({ type: 'turn/end', seq: 9, data: { turn: 1, reason: { kind: 'completed' } } }), 'ok');
expect('turn/start after ok', step({ type: 'turn/start', seq: 10, data: { turn: 2 } }), 'working');
expect('approval/asked', step({ type: 'approval/asked', seq: 11, data: { id: 'a', toolName: 'pwsh' } }), 'waiting');
expect('approval/decided', step({ type: 'approval/decided', seq: 12, data: { id: 'a' } }), 'thinking');
expect(
  'turn/end error',
  step({ type: 'turn/end', seq: 13, data: { turn: 2, reason: { kind: 'error', error: { message: 'boom 500' } } } }),
  'error',
);
expect('error detail recorded', reader.snapshot().lastError, 'boom 500');
expect('turn/start clears error', step({ type: 'turn/start', seq: 14, data: { turn: 3 } }), 'working');
expect('turn/end interrupted', step({ type: 'turn/end', seq: 15, data: { turn: 3, reason: { kind: 'interrupted' } } }), 'idle');

// The journal flushes in batches: an open turn must survive long quiet gaps.
append({ type: 'turn/start', seq: 16, data: { turn: 4 } });
reader.tick();
const cursor = reader.cursors.get(reader.active);
cursor.lastEventAt = Date.now() - 60_000;
reader.tick();
expect('60s gap inside a turn stays busy', reader.snapshot().state, 'working');
cursor.lastEventAt = Date.now() - 5_000;
append({ type: 'tool/call', seq: 17, data: { turn: 4, step: 1 } });
reader.tick();
expect('turn continues after the gap', reader.snapshot().state, 'working');

// Beyond the grace window the pet stops claiming to be busy, and picks the turn
// back up if the journal continues.
cursor.lastEventAt = Date.now() - 130_000;
reader.tick();
expect('130s gap gives up and shows idle', reader.snapshot().state, 'idle');
cursor.lastEventAt = Date.now() - 1_000;
append({ type: 'tool/result', seq: 18, data: { turn: 4, step: 1 } });
reader.tick();
expect('turn resumes after the gap', reader.snapshot().state, 'working');
append({ type: 'tool/call', seq: 19, data: { turn: 4, step: 2 } });
reader.tick();

// A long think after the last tool result is genuinely thinking.
cursor.lastEventAt = Date.now() - 20_000;
cursor.toolAt = Date.now() - 20_000;
append({ type: 'step/start', seq: 20, data: { turn: 4, step: 3 } });
reader.tick();
expect('long think after a tool is 深度思考', reader.snapshot().state, 'thinking');

// ok! has a hold window, then relaxes.
append({ type: 'turn/end', seq: 21, data: { turn: 4, reason: { kind: 'completed' } } });
reader.tick();
expect('ok! after success', reader.snapshot().state, 'ok');
cursor.holdUntil = Date.now() - 1;
reader.tick();
expect('ok! decays to idle', reader.snapshot().state, 'idle');

// A completed turn stays idle no matter how quiet the journal is.
cursor.lastEventAt = Date.now() - 60_000;
reader.tick();
expect('idle after a completed turn', reader.snapshot().state, 'idle');
append({ type: 'session/title', seq: 22, data: { title: 'x' } });
reader.tick();
expect('stray event after completion stays idle', reader.snapshot().state, 'idle');

fs.rmSync(dir, { recursive: true, force: true });
console.log(failures === 0 ? '\nall checks passed' : `\n${String(failures)} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
