'use strict';

/**
 * Renderer: paints the pet, the cloud bubble, the press interaction, and the
 * drag gesture, driven by the state the main process pushes over the bridge.
 */

(() => {
  const stage = document.getElementById('stage');
  const bubble = document.getElementById('bubble');
  const line1 = document.getElementById('bubble-line-1');
  const pet = document.getElementById('pet');
  const petImage = document.getElementById('pet-image');

  /** Latest settings/status received from the main process. */
  let settings = {
    language: 'zh',
    bubbleVisible: true,
    petVisible: true,
    soundEnabled: true,
    petSize: 420,
  };
  let status = { state: 'idle', lastError: null };
  /** True when the widget sits on the left half of the desktop (pet mirrored). */
  let mirrored = false;
  let lastState = null;

  /** Artwork width / height, measured from the asset on first decode. */
  let petAspect = 1.0;

  /**
   * The artwork already carries an alpha channel and is trimmed to the subject
   * at build time, so the renderer only maps the `petSize` setting onto the
   * image's own aspect ratio.
   */
  function layoutPet() {
    const naturalWidth = petImage.naturalWidth;
    const naturalHeight = petImage.naturalHeight;
    if (naturalWidth > 0 && naturalHeight > 0) petAspect = naturalWidth / naturalHeight;
    const size = Number(settings.petSize) || 420;
    const width = petAspect >= 1 ? size : Math.round(size * petAspect);
    const height = petAspect >= 1 ? Math.round(size / petAspect) : size;
    petImage.style.width = `${width}px`;
    petImage.style.height = `${height}px`;
  }

  /** Widget box for one pet size (mirrors the main process). */
  function stageSize(petSize) {
    const petEdge = petSize * Math.max(1, petAspect);
    return {
      width: Math.round((petEdge * 1.35) / 2) * 2,
      height: Math.round(petEdge / 2) * 2,
    };
  }

  function text(state) {
    const table = window.PET_STRINGS[settings.language] || window.PET_STRINGS.zh;
    return table[state] || table.idle;
  }

  function render() {
    const size = Number(settings.petSize) || 420;
    const box = stageSize(size);
    document.documentElement.style.setProperty('--pet-size', `${size}px`);
    document.documentElement.style.setProperty('--stage-width', `${box.width}px`);
    document.documentElement.style.setProperty('--stage-height', `${box.height}px`);
    document.documentElement.lang = settings.language === 'en' ? 'en' : 'zh';
    stage.dataset.state = status.state;
    // The pet and the bubble are one pose: both turn outward-facing together.
    // The flag drives the CSS (which corner each of them sits in, and the flip)
    // as well as the shared `--flip` every keyframe reads, so nothing is left
    // behind facing the wrong way.
    const flip = mirrored === true ? -1 : 1;
    document.documentElement.style.setProperty('--flip', String(flip));
    stage.classList.toggle('is-left', flip === -1);
    stage.classList.toggle('is-right', flip === 1);
    layoutPet();

    const copy = text(status.state);
    line1.textContent = copy.line1;

    bubble.hidden = settings.bubbleVisible !== true;
    pet.classList.toggle('is-hidden', settings.petVisible !== true);
    window.PetSound.setEnabled(settings.soundEnabled !== false);
  }

  /** Play the state's accent sound on transitions, never on the first paint. */
  function accentSound(state) {
    if (lastState === null) return;
    if (state === 'ok') window.PetSound.chime();
  }

  /** Squash the pet and squeeze out its rubber-duck squeak. */
  function press() {
    window.PetSound.prime();
    window.PetSound.squeak(1);
    pet.classList.remove('is-pressed');
    // Force a reflow so the animation can restart immediately.
    void pet.offsetWidth;
    pet.classList.add('is-pressed');
    pet.addEventListener(
      'animationend',
      () => {
        pet.classList.remove('is-pressed');
      },
      { once: true },
    );
  }

  // ------------------------------------------------------------- interaction --

  pet.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    pet.setPointerCapture(event.pointerId);
    press();

    let lastX = event.screenX;
    let lastY = event.screenY;
    let moved = 0;
    const onMove = (moveEvent) => {
      const dx = moveEvent.screenX - lastX;
      const dy = moveEvent.screenY - lastY;
      lastX = moveEvent.screenX;
      lastY = moveEvent.screenY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 6) window.pet.drag(dx, dy);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (moved > 6) window.pet.dragEnd();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  pet.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      press();
    }
  });

  bubble.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    window.PetSound.prime();
    window.PetSound.squeak(1.18);
    window.pet.patch({ bubbleVisible: false });
  });

  window.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    window.pet.openMenu();
  });

  // ------------------------------------------------------------------ bridge --

  window.pet.onState((payload) => {
    if (payload && payload.settings) settings = { ...settings, ...payload.settings };
    if (payload && payload.status) {
      accentSound(payload.status.state);
      status = payload.status;
    }
    if (payload && typeof payload.mirrored === 'boolean') mirrored = payload.mirrored;
    render();
  });

  window.pet
    .hello()
    .then((initial) => {
      if (initial && initial.settings) settings = { ...initial.settings, ...settings };
      if (initial && initial.status) status = initial.status;
      if (initial && typeof initial.mirrored === 'boolean') mirrored = initial.mirrored;
      layoutPet();
      render();
      lastState = status.state;
      return undefined;
    })
    .catch((error) => {
      console.error('[dsh-status-pet] initial state failed:', error);
      render();
    });

  // The trim happens at build time, so the artwork is already as tight as it
  // gets; only its aspect ratio needs measuring once it decodes.
  layoutPet();
  petImage.addEventListener('load', layoutPet, { once: true });
})();


