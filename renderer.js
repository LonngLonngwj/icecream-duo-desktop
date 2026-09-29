const canvas = document.getElementById('pet');
const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
const atlas = new Image();
atlas.src = 'assets/spritesheet.webp';

const states = {
  idle: { row: 0, frames: 6, interval: 210, loop: true },
  'running-right': { row: 1, frames: 8, interval: 115, loop: true },
  'running-left': { row: 2, frames: 8, interval: 115, loop: true },
  waving: { row: 3, frames: 4, interval: 180, loop: false },
  jumping: { row: 4, frames: 5, interval: 145, loop: false },
  failed: { row: 5, frames: 8, interval: 165, loop: false },
  waiting: { row: 6, frames: 6, interval: 230, loop: true },
  running: { row: 7, frames: 6, interval: 135, loop: true },
  review: { row: 8, frames: 6, interval: 165, loop: false }
};

let state = 'idle';
let frame = 0;
let timer = null;
let pausedByUser = false;
let dragging = false;
let dragOrigin = null;
let lastOpaque = null;
let imageReady = false;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function draw() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!imageReady) return;
  const animation = states[state];
  context.drawImage(
    atlas,
    frame * 192,
    animation.row * 208,
    192,
    208,
    0,
    0,
    192,
    208
  );
}

function stopTimer() {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

function schedule() {
  stopTimer();
  draw();
  if (pausedByUser || reducedMotion.matches) return;
  const animation = states[state];
  timer = setTimeout(() => {
    frame += 1;
    if (frame >= animation.frames) {
      if (animation.loop) frame = 0;
      else {
        state = 'idle';
        frame = 0;
      }
    }
    schedule();
  }, animation.interval);
}

function play(nextState) {
  if (!states[nextState]) return;
  state = nextState;
  frame = 0;
  schedule();
}

function opaqueAt(clientX, clientY) {
  if (!imageReady) return false;
  const bounds = canvas.getBoundingClientRect();
  const x = Math.floor(((clientX - bounds.left) / bounds.width) * canvas.width);
  const y = Math.floor(((clientY - bounds.top) / bounds.height) * canvas.height);
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return false;
  return context.getImageData(x, y, 1, 1).data[3] > 20;
}

function updatePointer(event) {
  if (dragging) return;
  const opaque = opaqueAt(event.clientX, event.clientY);
  if (opaque !== lastOpaque) {
    lastOpaque = opaque;
    window.desktopPet.pointerIsOpaque(opaque);
  }
}

canvas.addEventListener('pointermove', (event) => {
  if (dragging) {
    window.desktopPet.dragMove();
    return;
  }
  updatePointer(event);
});

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !opaqueAt(event.clientX, event.clientY)) return;
  dragging = true;
  dragOrigin = { x: event.screenX, y: event.screenY };
  canvas.setPointerCapture(event.pointerId);
  window.desktopPet.dragStart();
});

function endDrag(event) {
  if (!dragging) return;
  dragging = false;
  window.desktopPet.dragEnd();
  if (dragOrigin && Math.hypot(event.screenX - dragOrigin.x, event.screenY - dragOrigin.y) < 6) {
    window.desktopPet.greet();
  }
  dragOrigin = null;
  updatePointer(event);
}

canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  window.desktopPet.showMenu();
});
canvas.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    window.desktopPet.greet();
  } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
    event.preventDefault();
    window.desktopPet.showMenu();
  }
});

window.desktopPet.onAction(play);
window.desktopPet.onPreferences((preferences) => {
  pausedByUser = Boolean(preferences.paused);
  schedule();
});
window.desktopPet.getPreferences().then((preferences) => {
  pausedByUser = Boolean(preferences.paused);
  schedule();
});
reducedMotion.addEventListener('change', schedule);
atlas.onload = () => {
  imageReady = true;
  schedule();
};
