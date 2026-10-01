'use strict';

/**
 * Pet sound effects.
 *
 * The press sound is the synthesized rubber-duck squeak shipped as
 * `assets/squeak.wav`; it is fetched through the private asset scheme, decoded
 * once, and replayed through an AudioBufferSourceNode so every press is
 * immediate. The success chime stays synthesized so the app carries only the one
 * audio asset.
 */
window.PetSound = (() => {
  let context = null;
  let enabled = true;
  let squeakBuffer = null;
  let squeakLoading = null;

  /** @returns {AudioContext|null} the shared context, resumed if suspended. */
  function audioContext() {
    if (context === null) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (Ctor === undefined) return null;
      context = new Ctor();
    }
    if (context.state === 'suspended') void context.resume();
    return context;
  }

  /** Fetch and decode the squeak once. */
  function loadSqueak() {
    if (squeakLoading !== null) return squeakLoading;
    squeakLoading = (async () => {
      const ctx = audioContext();
      if (ctx === null) return null;
      try {
        const response = await fetch('pet-asset://local/squeak.wav');
        if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
        const bytes = await response.arrayBuffer();
        squeakBuffer = await ctx.decodeAudioData(bytes);
        return squeakBuffer;
      } catch (error) {
        console.warn('[dsh-status-pet] squeak unavailable:', error);
        return null;
      }
    })();
    return squeakLoading;
  }

  /**
   * Play the rubber-duck squeak.
   * @param {number} [pitch] - playback rate, for a slightly different squeeze.
   */
  function squeak(pitch = 1) {
    if (!enabled) return;
    const ctx = audioContext();
    if (ctx === null) return;
    if (squeakBuffer === null) {
      void loadSqueak();
      return;
    }
    const source = ctx.createBufferSource();
    source.buffer = squeakBuffer;
    source.playbackRate.value = pitch;
    const gain = ctx.createGain();
    gain.gain.value = 0.75;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  }

  /** A soft two-note chime for a fresh success. */
  function chime() {
    if (!enabled) return;
    const ctx = audioContext();
    if (ctx === null) return;
    const now = ctx.currentTime;
    [880, 1320].forEach((frequency, index) => {
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      const start = now + index * 0.07;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(index === 0 ? 0.11 : 0.08, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(frequency, start);
      osc.connect(gain);
      osc.start(start);
      osc.stop(start + 0.26);
    });
  }

  return {
    /** @param {boolean} value - whether effects may play. */
    setEnabled(value) {
      enabled = value !== false;
    },
    squeak,
    chime,
    /** Unlock the audio context and warm the squeak from a user gesture. */
    prime() {
      audioContext();
      void loadSqueak();
    },
  };
})();
