'use strict';

/**
 * Reads the live Harness session journal and reduces it to one coarse agent
 * status for the desktop pet.
 *
 * The journal is an append-only file of concatenated, independently framed zstd
 * streams, one durable session event per frame, so a reader can follow it by
 * byte offset and only decompress the frames it has not seen yet. That keeps
 * watching a multi-megabyte log cheap.
 *
 * @module status-reader
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const zlib = require('zlib');

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/**
 * Frame decoder. `node:zlib` only gained zstd in Node 22, and this app runs on
 * the Electron runtime's older Node, so the pure-JS decoder is the reliable
 * path; the built-in one is preferred when present because it is faster.
 */
let pureJsZstd = null;
try {
  // Optional at load time: a broken install must not take the pet down.
  pureJsZstd = require('fzstd').decompress;
} catch {
  pureJsZstd = null;
}
const nativeZstd = typeof zlib.zstdDecompressSync === 'function' ? (buffer) => zlib.zstdDecompressSync(buffer) : null;

/**
 * Decompress exactly one zstd frame.
 * @param {Buffer} buffer - one complete frame.
 * @returns {Buffer} the decoded bytes.
 * @throws when the frame is incomplete or damaged.
 */
function inflateFrame(buffer) {
  if (nativeZstd !== null) return nativeZstd(buffer);
  if (pureJsZstd !== null) return Buffer.from(pureJsZstd(buffer));
  throw new Error('no zstd decoder available');
}

/** Agent states exposed to the UI. */
const STATES = Object.freeze({
  idle: 'idle',
  thinking: 'thinking',
  working: 'working',
  waiting: 'waiting',
  error: 'error',
  ok: 'ok',
});

/** Event types that mean the agent is blocked on a human answer. */
const WAITING_EVENTS = new Set(['approval/asked', 'ask/asked', 'user-question/asked', 'plan/mode']);
/** Event types that clear a waiting state without a new turn. */
const WAITING_CLEAR_EVENTS = new Set(['approval/decided', 'ask/answered', 'ask/cancelled']);
/**
 * How long after a tool result the pet keeps reporting `干活...` instead of
 * `深度思考...`. A step that ran a tool almost always continues with another
 * tool (editing files, running commands), and the journal only shows the next
 * step once it starts, so a short carry-over keeps the label honest.
 */
const TOOL_CARRY_MS = 15 * 1000;

/**
 * Quiet time before a busy state may relax. The journal is flushed in batches,
 * so the gap between two durable events regularly reaches tens of seconds while
 * the agent is still working: the pet must not call that idle. A turn that is
 * still open therefore keeps its busy state until this much silence has passed.
 */
const SILENCE_GRACE_MS = 120 * 1000;
/** How long `ok!` stays on screen after a successful turn. */
const OK_HOLD_MS = 4200;
/** Safety valve: an unanswered request is not "waiting" forever. */
const WAITING_HOLD_MS = 10 * 60 * 1000;
/** A journal written to this recently means a harness session is live. */
const SESSION_FRESH_MS = 45 * 1000;
/** A journal older than this is not worth following. */
const RELEVANT_FILE_MS = 45 * 60 * 1000;

/** Candidate DSH homes, most specific first. */
function candidateHomes() {
  const homes = [];
  if (process.env.DSH_HOME) homes.push(process.env.DSH_HOME);
  homes.push(path.join(os.homedir(), '.dsh'));
  if (process.env.APPDATA) homes.push(path.join(process.env.APPDATA, 'dsh'));
  return homes.filter((home) => home.length > 0);
}

/**
 * @param {string} root - a DSH home.
 * @returns {Array<{file: string, size: number, mtimeMs: number}>} every session journal, newest write first.
 */
function listJournals(root) {
  const out = [];
  const walk = (dir, depth) => {
    if (depth > 3) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      // The writer names every version of a session body `session*.jsonl.zstd`.
      if (!/^session[^\\/]*\.jsonl\.zstd$/.test(entry.name)) continue;
      try {
        const stat = fs.statSync(full);
        out.push({ file: full, size: stat.size, mtimeMs: stat.mtimeMs });
      } catch {
        /* a session being rotated away */
      }
    }
  };
  walk(root, 0);
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}

/** Turn one `turn/end` failure reason into a short human-readable string. */
function describeError(reason) {
  const failure = reason && (reason.error || reason.failure);
  if (!failure) return 'unknown';
  if (typeof failure === 'string') return failure;
  if (typeof failure.message === 'string') return failure.message;
  if (typeof failure.code === 'string') return failure.code;
  return 'unknown';
}

/** Follows one session journal by byte offset and folds its events into a status. */
class SessionCursor {
  /** @param {string} file - journal path. */
  constructor(file) {
    this.file = file;
    this.offset = 0;
    this.pending = Buffer.alloc(0);
    this.state = STATES.idle;
    this.lastEventAt = 0;
    this.lastEventType = null;
    this.holdUntil = 0;
    this.waiting = false;
    this.waitingSince = 0;
    this.lastError = null;
    /** A turn is open between `turn/start` and its matching `turn/end`. */
    this.turnOpen = false;
    /** Set when a busy state gave up waiting for the journal to continue. */
    this.decayedAt = 0;
    /** Whether the last work event was a tool, so the label can carry over. */
    this.toolPending = false;
    this.toolAt = 0;
  }

  /**
   * Read whatever has been appended since the previous call and fold its events
   * in. A trailing frame that is still being written is carried over to the next
   * call rather than dropped.
   * @param {number} now - current epoch milliseconds.
   * @returns {boolean} whether the folded status changed.
   */
  poll(now) {
    let size;
    try {
      size = fs.statSync(this.file).size;
    } catch {
      return false;
    }
    if (size < this.offset) {
      // Truncated or rewritten: start over.
      this.offset = 0;
      this.pending = Buffer.alloc(0);
    }

    let chunk = null;
    if (size > this.offset) {
      try {
        chunk = Buffer.alloc(size - this.offset);
        const fd = fs.openSync(this.file, 'r');
        try {
          let filled = 0;
          while (filled < chunk.length) {
            const read = fs.readSync(fd, chunk, filled, chunk.length - filled, this.offset + filled);
            if (read <= 0) break;
            filled += read;
          }
        } finally {
          fs.closeSync(fd);
        }
      } catch {
        return false;
      }
      this.offset = size;
    }

    // With no new bytes the held bytes are still re-examined: a frame that was
    // incomplete when it was first read may be complete now.
    if (this.pending.length === 0 && chunk === null) return false;
    const data = this.pending.length === 0 ? chunk : chunk === null ? this.pending : Buffer.concat([this.pending, chunk]);

    // Frame boundary scan. The final frame has no successor to bound it, so it
    // is decoded with the rest of the buffer as its extent; a truncated tail
    // throws and is carried over to the next poll.
    const starts = [];
    let at = data.indexOf(ZSTD_MAGIC, 0);
    while (at !== -1) {
      starts.push(at);
      at = data.indexOf(ZSTD_MAGIC, at + 4);
    }

    let consumed = 0;
    let changed = false;
    for (let i = 0; i < starts.length; i++) {
      const start = starts[i];
      const end = i + 1 < starts.length ? starts[i + 1] : data.length;
      let text;
      try {
        text = inflateFrame(data.subarray(start, end)).toString('utf8');
      } catch {
        if (i === starts.length - 1) break; // incomplete tail frame
        consumed = end; // damaged interior frame: skip rather than stall
        continue;
      }
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        let event;
        try {
          event = JSON.parse(trimmed);
        } catch {
          continue;
        }
        if (this.absorb(event, now)) changed = true;
      }
      consumed = end;
    }

    this.pending = data.subarray(consumed);
    return changed;
  }

  /**
   * Fold one durable session event into the coarse status.
   * @param {object} event - a session event.
   * @param {number} now - current epoch milliseconds.
   * @returns {boolean} whether the status changed.
   */
  absorb(event, now) {
    const type = event && typeof event.type === 'string' ? event.type : null;
    if (type === null) return false;
    this.lastEventAt = now;
    this.lastEventType = type;
    // A turn is open from its `turn/start` until its `turn/end`; while it is
    // open the agent is busy even when the journal goes quiet for a while.
    const resumed = this.decayedAt !== 0;

    switch (type) {
      case 'turn/start':
        this.turnOpen = true;
        this.waiting = false;
        this.decayedAt = 0;
        this.toolPending = false;
        return this.set(STATES.working, now);
      case 'step/start':
        this.turnOpen = true;
        this.decayedAt = 0;
        this.toolPending = false;
        if (this.waiting) return false;
        return this.set(STATES.thinking, now);
      case 'assistant/attempt':
      case 'assistant/message':
        this.turnOpen = true;
        this.decayedAt = 0;
        // A model message is a fresh step of work, not a lingering tool.
        this.toolPending = false;
        if (this.waiting) return false;
        return this.set(STATES.thinking, now);
      case 'tool/call':
      case 'tool/ptc-dispatch':
      case 'tool/ptc-dispatch-start':
      case 'command/run':
      case 'compaction/start':
        this.decayedAt = 0;
        this.toolPending = true;
        this.toolAt = now;
        if (this.waiting) return false;
        return this.set(STATES.working, now);
      case 'tool/result':
      case 'command/done':
      case 'compaction/end':
        this.decayedAt = 0;
        this.toolPending = true;
        this.toolAt = now;
        if (this.waiting) return false;
        // Stay on `干活...` right after a tool ran: the turn is usually still
        // mid-work (the next edit or command), and flipping to `深度思考...`
        // between two edits reads as the wrong state.
        return this.set(STATES.working, now);
      case 'approval/asked':
      case 'ask/asked':
        this.waiting = true;
        this.waitingSince = now;
        this.decayedAt = 0;
        this.toolPending = false;
        return this.set(STATES.waiting, now);
      case 'turn/end': {
        this.turnOpen = false;
        this.decayedAt = 0;
        this.toolPending = false;
        const reason = event.data && event.data.reason ? event.data.reason : undefined;
        const kind = reason && typeof reason.kind === 'string' ? reason.kind : 'completed';
        this.waiting = false;
        if (kind === 'error' || kind === 'failed') {
          this.lastError = describeError(reason);
          return this.set(STATES.error, now);
        }
        if (kind === 'interrupted' || kind === 'canceled' || kind === 'aborted') {
          return this.set(STATES.idle, now);
        }
        this.lastError = null;
        this.holdUntil = now + OK_HOLD_MS;
        return this.set(STATES.ok, now);
      }
      default:
        break;
    }

    if (WAITING_CLEAR_EVENTS.has(type) && this.waiting) {
      this.waiting = false;
      this.decayedAt = 0;
      return this.set(STATES.thinking, now);
    }
    // Any other durable event still counts as progress: an open turn that comes
    // back to life rejoins the busy state after a long quiet stretch.
    if (resumed && this.turnOpen && !this.waiting) {
      this.decayedAt = 0;
      return this.set(STATES.working, now);
    }
    return false;
  }

  /**
   * Record a state change.
   * @param {string} state - the new state.
   * @param {number} now - current epoch milliseconds.
   * @returns {boolean} whether the state actually changed.
   */
  set(state, now) {
    if (this.state === state) return false;
    this.state = state;
    this.changedAt = now;
    return true;
  }

  /**
   * Time-based relaxation: `ok!` falls back to idle, and a busy state that has
   * seen no durable event for a long time gives up and reports idle.
   * @param {number} now - current epoch milliseconds.
   * @param {Function} notify - called when the state changed.
   */
  decay(now, notify) {
    if (this.state === STATES.ok && now >= this.holdUntil) {
      this.set(STATES.idle, now);
      notify();
      return;
    }
    if (this.state === STATES.waiting) {
      if (this.waiting && now - this.waitingSince > WAITING_HOLD_MS) {
        this.waiting = false;
        this.set(STATES.idle, now);
        notify();
      }
      return;
    }
    const busy = this.state === STATES.thinking || this.state === STATES.working;
    // A tool ran a moment ago and the turn is still open: the agent is working
    // (editing, building, testing), so keep `干活...` rather than flipping to
    // `深度思考...` between two tool calls.
    if (this.state === STATES.thinking && this.turnOpen && this.toolPending && now - this.toolAt < TOOL_CARRY_MS) {
      this.set(STATES.working, now);
      notify();
      return;
    }
    if (busy && now - (this.lastEventAt || now) > SILENCE_GRACE_MS) {
      this.decayedAt = now;
      this.toolPending = false;
      this.set(STATES.idle, now);
      notify();
    }
  }
}

/** Watches the newest session journal and publishes the pet's status. */
class StatusReader extends EventEmitter {
  /**
   * @param {{dshHome?: string, intervalMs?: number}} [options] - roots and cadence.
   */
  constructor(options = {}) {
    super();
    this.roots = options.dshHome ? [options.dshHome] : candidateHomes();
    this.intervalMs = options.intervalMs ?? 450;
    this.cursors = new Map();
    this.active = null;
    this.state = STATES.idle;
    this.detail = { sessionId: null, file: null, lastEventType: null, lastError: null, since: Date.now() };
    this.timer = null;
    this.tick();
  }

  /** Begin polling. */
  start() {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  /** Stop polling. */
  stop() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /** One poll: pick the session to follow, drain its new events, relax states. */
  tick() {
    const now = Date.now();
    const journals = [];
    for (const root of this.roots) journals.push(...listJournals(root));
    journals.sort((a, b) => b.mtimeMs - a.mtimeMs);

    const fresh = journals.find((journal) => now - journal.mtimeMs < SESSION_FRESH_MS);
    const candidate = fresh ?? journals.find((journal) => now - journal.mtimeMs < RELEVANT_FILE_MS) ?? journals[0];
    if (candidate === undefined) {
      if (this.state !== STATES.idle) this.publish(STATES.idle);
      return;
    }

    let cursor = this.cursors.get(candidate.file);
    if (cursor === undefined) {
      // A fresh cursor starts at the current end of the journal: the pet reports
      // what the agent does from now on instead of replaying whole histories.
      cursor = new SessionCursor(candidate.file);
      cursor.offset = candidate.size;
      cursor.lastEventAt = now;
      this.cursors.set(candidate.file, cursor);
    }

    if (this.active !== candidate.file) {
      const previous = this.active === null ? undefined : this.cursors.get(this.active);
      const switchable = previous === undefined || now - candidate.mtimeMs < SESSION_FRESH_MS || now - previous.lastEventAt > SESSION_FRESH_MS;
      if (switchable) this.active = candidate.file;
    }

    for (const [file, entry] of this.cursors) {
      if (file !== this.active && now - entry.lastEventAt > RELEVANT_FILE_MS) this.cursors.delete(file);
    }

    const active = this.cursors.get(this.active);
    if (active === undefined) return;

    let changed = active.poll(now);
    active.decay(now, () => {
      changed = true;
    });

    if (active.state !== this.state || active.lastEventType !== this.detail.lastEventType || active.lastError !== this.detail.lastError) {
      changed = true;
    }
    if (changed) {
      this.state = active.state;
      this.detail.sessionId = path.basename(path.dirname(active.file));
      this.detail.file = active.file;
      this.detail.lastEventType = active.lastEventType;
      this.detail.lastError = active.lastError;
      this.detail.since = now;
      this.emit('status', this.snapshot());
    }
  }

  /**
   * Publish a forced state, used when no journal is available at all.
   * @param {string} state - the state to report.
   */
  publish(state) {
    this.state = state;
    this.detail.sessionId = null;
    this.detail.lastEventType = null;
    this.detail.lastError = null;
    this.detail.since = Date.now();
    this.emit('status', this.snapshot());
  }

  /** @returns {{state: string, sessionId: string|null, lastEventType: string|null, lastError: string|null, since: number}} the current status. */
  snapshot() {
    return { state: this.state, ...this.detail };
  }
}

module.exports = { StatusReader, STATES, candidateHomes, listJournals, inflateFrame };
