'use strict';

/**
 * Replays a real session journal through the StatusReader so the states the pet
 * will show can be reviewed without waiting for a live agent.
 *
 * Each source event is re-encoded as one standalone zstd frame and appended to a
 * scratch journal that the reader follows, exactly as it follows the real one.
 *
 * Usage: node tools/state-labels.js <session.jsonl.zstd> [--limit N] [--grep REGEX]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const { StatusReader, inflateFrame } = require(path.join(__dirname, '..', 'app', 'src', 'main', 'status-reader.js'));

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const file = process.argv[2];
if (file === undefined) {
  console.error('usage: node tools/state-labels.js <session.jsonl.zstd> [--limit N] [--grep REGEX]');
  process.exit(2);
}
const limitArg = process.argv.indexOf('--limit');
const limit = limitArg === -1 ? 400 : Number(process.argv[limitArg + 1]);
const grepArg = process.argv.indexOf('--grep');
const grep = grepArg === -1 ? null : new RegExp(process.argv[grepArg + 1]);

/** @returns every durable event in one journal, in append order. */
function readJournal(target) {
  const buf = fs.readFileSync(target);
  const starts = [];
  let at = buf.indexOf(MAGIC, 0);
  while (at !== -1) {
    starts.push(at);
    at = buf.indexOf(MAGIC, at + 4);
  }
  const events = [];
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1] : buf.length;
    let text;
    try {
      text = inflateFrame(buf.subarray(starts[i], end)).toString('utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      try {
        events.push(JSON.parse(trimmed));
      } catch {
        /* skip a malformed line */
      }
    }
  }
  return events;
}

const events = readJournal(file);
console.log(`${events.length} events read from ${path.basename(file)}`);
console.log(' idx  event                        -> state     detail');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-replay-'));
const tmpFile = path.join(tmpDir, 'session-replay.jsonl.zstd');
fs.writeFileSync(tmpFile, Buffer.alloc(0));

// A huge interval keeps the reader from polling on its own; the replay drives it.
const reader = new StatusReader({ dshHome: tmpDir, intervalMs: 1_000_000_000 });
let previous = null;
let printed = 0;

for (let i = 0; i < events.length && printed < limit; i++) {
  const event = events[i];
  if (grep !== null && !grep.test(JSON.stringify(event))) continue;
  fs.appendFileSync(tmpFile, zlib.zstdCompressSync(Buffer.from(`${JSON.stringify(event)}\n`, 'utf8')));
  const now = Date.now();
  fs.utimesSync(tmpFile, now / 1000, now / 1000);
  reader.tick();
  const snapshot = reader.snapshot();
  if (snapshot.state !== previous) {
    previous = snapshot.state;
    printed += 1;
    const reason = event.data && event.data.reason ? JSON.stringify(event.data.reason).slice(0, 70) : '';
    const error = snapshot.lastError ? `err=${String(snapshot.lastError).slice(0, 50)}` : '';
    console.log(`${String(i).padStart(4)}  ${String(event.type).padEnd(28)} -> ${snapshot.state.padEnd(9)} ${error} ${reason}`);
  }
}

fs.rmSync(tmpDir, { recursive: true, force: true });
