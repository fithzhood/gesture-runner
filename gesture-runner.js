'use strict';

/* =====================================================================
   Gesture Runner
   Vanilla JS, Canvas 2D, Pointer Events. No frameworks, no build step.

   Layout of this file:
     1. constants
     2. state
     3. view / canvas
     4. gesture recognizer   (emits semantic actions, knows no game logic)
     5. world + entities
     6. game logic
     7. renderers            (rectangles always; sprites only if manifest)
     8. debug HUD
     9. main loop
   ===================================================================== */


/* ============================== 1. constants ========================= */

const REF_H = 360;            // the world is always 360 units tall
const GROUND_Y = 288;         // feet line, world units
const PLAYER_X_FRAC = 0.26;   // where the player sits on screen

const DT = 1 / 60;            // fixed logic timestep
const MAX_FRAME = 0.25;       // never integrate more than this in one frame

// gesture thresholds — CSS pixels and milliseconds
const TAP_MS = 200;
const TAP_PX = 12;
const FLICK_PX = 24;
const FLICK_MS = 250;
const DRAG_MS = 120;
const MASH_MS = 400;
const MASH_TAPS = 3;
const ANTICIPATION_MS = 70;
const MIN_TOUCH_PX = 44;      // a fingertip is bigger than any sprite

// movement — the same orb is worth more the faster you are going, so speed is greed
const SPEED = { still: 0, walking: 150, running: 330 };
const ORB_VALUE = { still: 1, walking: 3, running: 6 };
const SPEED_ORDER = ['still', 'walking', 'running'];
const ACCEL_RATE = 450;   // one speed step takes ~0.4 s, so it is felt
const DECEL_RATE = 900;   // flick left is the panic brake: it bites twice as hard
const GRAVITY = 1250;
const JUMP_V = 470;   // 0.75 s of airtime: 113 units of travel walking, 248 running
const MELEE_RANGE = 84;

// Orbs are carried, not tapped: you grab one and drag it to the character.
const ORB_DELIVER_RADIUS = 42;  // how close a carried orb has to get to count
const ORB_FOLLOW = 20;          // how fast a carried orb chases the finger
const ORB_SPACING = 28;         // gap between orbs in a carried chain
const ORB_LIFT = 24;            // the leader rides above the fingertip, which
                                // on a phone is under the thumb otherwise
const BULLET_SPEED = 520;
const DEATH_PAUSE = 1.1;
// Mega Man 3's slide: a committed dash, not a crouch you hold. Fixed
// distance, low profile the whole way, a burst of speed even from a walk,
// and only a jump gets you out of it early.
const SLIDE_DIST = 150;   // measured in ground covered, not seconds, so it
                          // clears a beam at any speed without over-committing
const SLIDE_SPEED = 285;  // the dash floor: sliding never slows you down
const AIRTIME = 2 * JUMP_V / GRAVITY;
const WALK_JUMP_REACH = SPEED.walking * AIRTIME;   // what a walking jump can span

// the unlock ladder — thresholds back-solved from a flat time-per-unlock curve
const UNLOCKS = [
  { id: 'walk',       xp: 3,    demo: 'flickRight' },
  { id: 'jump',       xp: 40,   demo: 'flickUp' },
  { id: 'slide',      xp: 95,   demo: 'flickDown' },
  { id: 'gun',        xp: 180,  demo: 'tap',    spawn: 'target' },
  { id: 'enemies',    xp: 300,  demo: 'tap',    spawn: 'enemyGun' },
  { id: 'sword',      xp: 480,  demo: 'swipe',  spawn: 'enemySword' },
  { id: 'run',        xp: 720,  demo: 'flickRight' },
  { id: 'doubleJump', xp: 1400, demo: 'flickUpAir' }
];

const SAVE_KEY = 'gesture-runner:meta';
const SAFE_SECONDS = 2;        // no unlock fires within this much travel of a hazard
const CELEBRATION_SEC = 2.4;
const CELEBRATION_SLOW = 0.25;
const NUDGE_AFTER = 10;        // seconds of stillness before the opening offers a fourth orb
const HAZARD_TYPES = ['obstacle', 'gate', 'enemyGun', 'enemySword', 'gap'];
const BREATHER_SEC = 30;       // after the run unlock, density drops for a while

// A full day takes four minutes and never resets on death, so the light is
// always drifting somewhere new. Kept low in saturation on purpose: the orbs
// are the only thing in this game allowed to be a strong colour.
const DAY_SECONDS = 240;
const SKY_KEYS = [
  //  t     sky top      horizon        ground        hills far    hills near   stars
  { t: 0.00, top: '#111730', hor: '#1e2b4c', gnd: '#171c28', far: '#141d33', near: '#0d1220', stars: 1.00 },
  { t: 0.14, top: '#161c38', hor: '#372c50', gnd: '#1b1f2b', far: '#231f3c', near: '#12162a', stars: 0.55 },
  { t: 0.24, top: '#1b2036', hor: '#5a3f48', gnd: '#1f2029', far: '#33293c', near: '#181a26', stars: 0.10 },
  { t: 0.38, top: '#243046', hor: '#4a5a70', gnd: '#242833', far: '#33415a', near: '#1d222e', stars: 0.00 },
  { t: 0.52, top: '#2b3a54', hor: '#61758c', gnd: '#282d38', far: '#3b4b66', near: '#212734', stars: 0.00 },
  { t: 0.68, top: '#243046', hor: '#7a5548', gnd: '#242833', far: '#43354a', near: '#1d222e', stars: 0.00 },
  { t: 0.79, top: '#1d2440', hor: '#7a464a', gnd: '#20242f', far: '#332943', near: '#161a26', stars: 0.25 },
  { t: 0.88, top: '#141a33', hor: '#372e51', gnd: '#1a1e29', far: '#1e2439', near: '#101524', stars: 0.75 },
  { t: 1.00, top: '#111730', hor: '#1e2b4c', gnd: '#171c28', far: '#141d33', near: '#0d1220', stars: 1.00 }
];

// palette
const COL = {
  bg: '#0e1015',
  ground: '#1b1f28',
  groundLine: '#2c3240',
  player: '#e8eaf0',
  playerDim: '#9aa2b1',
  orbStill: '#3ddc84',
  orbWalking: '#ffd23f',
  orbRunning: '#ff4d4d',
  block: '#4a5262',
  spike: '#7a4a52',
  beam: '#3b4557',
  gate: '#5a4a72',
  target: '#3f6b8a',
  enemyGun: '#8a5a3f',
  enemySword: '#8a3f5a',
  enemySwordHot: '#e05a86',
  bullet: '#ffe8a3',
  dead: '#6a2b34',
  label: '#0e1015'
};


/* ================================ 2. state =========================== */

const state = {
  meta: { totalXP: 0, unlocked: ['drag'], taught: [] },
  run: { distance: 0, xpThisRun: 0, alive: true, time: 0 },
  player: {
    x: 0, y: GROUND_Y, vy: 0,
    speedState: 'still', speed: 0,
    action: 'idle', actionTimer: 0,
    airJumpsLeft: 0, grounded: true, crouch: false, crouchUntilX: 0,
    anticipate: 0, whiff: 0, bumped: 0, deathTimer: 0, cause: ''
  },
  entities: [],
  pointers: new Map(),   // pointerId -> gesture in progress
  carry: new Map(),      // pointerId -> where that finger is, in world units
  actionQueue: [],       // semantic actions awaiting consumption
  camera: { x: 0 },
  particles: [],         // collection sparks; never touched by hit-testing
  shake: 0,
  sky: { t: 0.30, stars: [], hills: null },   // day/night clock; survives death
  opening: null,         // the wordless first 25 seconds
  celebration: null,     // slow-motion unlock demonstration
  breatherUntil: 0,
  view: { w: 0, h: 0, dpr: 1, scale: 1, worldW: 640, portrait: false },
  debug: {
    on: false, log: [], unknown: 0,
    emitSum: 0, emitN: 0, respSum: 0, respN: 0, worstEmit: 0
  }
};

let nextEntityId = 1;
let grabCounter = 0;


/* --------------------------- persistence ---------------------------- */

function loadMeta() {
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (err) { raw = null; }
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.totalXP !== 'number' || !Array.isArray(parsed.unlocked)) return;
    state.meta.totalXP = Math.max(0, parsed.totalXP);
    state.meta.taught = Array.isArray(parsed.taught) ? parsed.taught.slice() : [];
    state.meta.unlocked = ['drag'];
    for (let i = 0; i < UNLOCKS.length; i++) {
      if (parsed.unlocked.indexOf(UNLOCKS[i].id) >= 0) state.meta.unlocked.push(UNLOCKS[i].id);
    }
  } catch (err) {
    // corrupt save: start over, silently
    state.meta.totalXP = 0;
    state.meta.unlocked = ['drag'];
    state.meta.taught = [];
  }
}

function saveMeta() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      totalXP: state.meta.totalXP,
      unlocked: state.meta.unlocked,
      taught: state.meta.taught
    }));
  } catch (err) { /* private mode, quota: play on regardless */ }
}

function isUnlocked(id) {
  return state.meta.unlocked.indexOf(id) >= 0;
}

function nextUnlock() {
  for (let i = 0; i < UNLOCKS.length; i++) {
    if (!isUnlocked(UNLOCKS[i].id)) return UNLOCKS[i];
  }
  return null;
}

function freshProfile() {
  return state.meta.totalXP === 0 && state.meta.unlocked.length === 1;
}


/* ============================== 3. view ============================== */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const rotateEl = document.getElementById('rotate');

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const v = state.view;

  v.w = w; v.h = h; v.dpr = dpr;
  v.scale = h / REF_H;
  v.worldW = w / v.scale;
  v.portrait = h > w;

  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);

  ctx.imageSmoothingEnabled = false;
  rotateEl.hidden = !v.portrait;
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });

function playerScreenX() { return state.view.worldW * PLAYER_X_FRAC; }

function toWorldX(clientX) {
  const r = canvas.getBoundingClientRect();
  return (clientX - r.left) / state.view.scale + state.camera.x;
}

function toWorldY(clientY) {
  const r = canvas.getBoundingClientRect();
  return (clientY - r.top) / state.view.scale;
}


/* ========================= 4. gesture recognizer =====================
   The only place raw pointer data is read. It emits semantic actions
   into state.actionQueue and never touches game logic.
   ===================================================================== */

const GESTURE_TARGETS = ['orb', 'target', 'enemyGun', 'enemySword', 'gate'];

function playerBox() {
  const p = state.player;
  const h = p.crouch ? 26 : 46;
  return { x: p.x - 13, y: p.y - h, w: 26, h: h };
}

function entityBox(e) {
  return { x: e.x, y: e.y, w: e.w, h: e.h };
}

// Every touch box grows to at least MIN_TOUCH_PX square (in CSS px).
function padBox(box) {
  const min = MIN_TOUCH_PX / state.view.scale;
  const w = Math.max(box.w, min);
  const h = Math.max(box.h, min);
  return {
    x: box.x + box.w / 2 - w / 2,
    y: box.y + box.h / 2 - h / 2,
    w: w,
    h: h
  };
}

function boxHit(box, x, y) {
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
}

function boxCenter(box) { return { x: box.x + box.w / 2, y: box.y + box.h / 2 }; }

function hitTest(wx, wy) {
  let best = null;
  let bestD = Infinity;

  const pb = padBox(playerBox());
  if (boxHit(pb, wx, wy)) {
    const c = boxCenter(pb);
    best = { kind: 'player', ent: null };
    bestD = Math.hypot(c.x - wx, c.y - wy);
  }

  for (let i = 0; i < state.entities.length; i++) {
    const e = state.entities[i];
    if (e.dead || GESTURE_TARGETS.indexOf(e.type) < 0) continue;
    const b = padBox(entityBox(e));
    if (!boxHit(b, wx, wy)) continue;
    const c = boxCenter(b);
    const d = Math.hypot(c.x - wx, c.y - wy);
    // the player wins near-ties: it is the thumb home base
    if (d < bestD - 0.001) { best = { kind: e.type, ent: e }; bestD = d; }
  }
  return best;
}

function emit(rec, action, gesture, note) {
  const now = performance.now();
  const lat = now - rec.t0;
  const entry = logGesture(rec, gesture, action, lat, note);
  state.actionQueue.push({
    type: action,
    target: rec.target ? rec.target.ent : null,
    pointerId: rec.id,
    t: now,
    log: entry            // so the HUD can show that game logic refused it
  });
}

function logGesture(rec, gesture, action, lat, note) {
  const d = state.debug;
  const kind = rec.target ? rec.target.kind : 'world';
  if (action === 'unknown') d.unknown++;
  if (typeof lat === 'number') {
    d.emitSum += lat;
    d.emitN++;
    if (lat > d.worstEmit) d.worstEmit = lat;
  }
  const entry = {
    kind: kind,
    gesture: gesture,
    action: action + (note ? ' ' + note : ''),
    lat: Math.round(lat || 0),
    resp: rec.resp == null ? null : Math.round(rec.resp),
    unknown: action === 'unknown'
  };
  d.log.unshift(entry);
  if (d.log.length > 8) d.log.length = 8;
  return entry;
}

function startAnticipation() {
  state.player.anticipate = ANTICIPATION_MS / 1000;
}

function onPointerDown(e) {
  e.preventDefault();
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }

  const wx = toWorldX(e.clientX);
  const wy = toWorldY(e.clientY);
  const target = hitTest(wx, wy);

  const rec = {
    id: e.pointerId,
    t0: performance.now(),
    target: target,
    // client-space geometry drives classification (thresholds are in CSS px)
    csx: e.clientX, csy: e.clientY, cx: e.clientX, cy: e.clientY,
    maxDist: 0,
    // world-space path drives orb harvesting
    wx: wx, wy: wy, pwx: wx, pwy: wy,
    done: false, resp: null, carrying: 0
  };
  state.pointers.set(e.pointerId, rec);

  const kind = target ? target.kind : 'world';

  // Shared anticipation frame: the wind-up is identical for jump and slide,
  // so the character reacts on the same frame as the touch.
  if (kind === 'player') startAnticipation();

  if (kind === 'orb') { grabOrb(target.ent, rec); emitCarry(rec); }
  if (kind === 'gate') registerMashTap(rec, target.ent);
}

function onPointerMove(e) {
  const rec = state.pointers.get(e.pointerId);
  if (!rec) return;
  e.preventDefault();

  rec.cx = e.clientX; rec.cy = e.clientY;
  rec.pwx = rec.wx; rec.pwy = rec.wy;
  rec.wx = toWorldX(e.clientX);
  rec.wy = toWorldY(e.clientY);

  const dx = rec.cx - rec.csx;
  const dy = rec.cy - rec.csy;
  const dist = Math.hypot(dx, dy);
  if (dist > rec.maxDist) rec.maxDist = dist;

  const age = performance.now() - rec.t0;
  const kind = rec.target ? rec.target.kind : 'world';

  if (!rec.done && dist >= FLICK_PX && age <= FLICK_MS) {
    if (kind === 'player') { emitFlick(rec, dx, dy); rec.done = true; }
    else if (isEnemyKind(kind)) { emitSwipe(rec); rec.done = true; }
  }

  // Drag harvesting: any path that is not a player flick or an enemy swipe
  // picks up the orbs it crosses and drags them along.
  if (kind === 'orb' || kind === 'world') {
    dragPickup(rec);
    if (rec.carrying) emitCarry(rec);
  }
}

function onPointerUp(e) {
  const rec = state.pointers.get(e.pointerId);
  if (!rec) return;
  e.preventDefault();

  const age = performance.now() - rec.t0;
  const dx = rec.cx - rec.csx;
  const dy = rec.cy - rec.csy;
  const dist = Math.hypot(dx, dy);
  const kind = rec.target ? rec.target.kind : 'world';

  if (!rec.done) {
    if (age <= TAP_MS && dist < TAP_PX) {
      handleTap(rec, kind);
    } else if (kind === 'orb' || kind === 'world') {
      // orbs and empty space have no flick action: an unclassified stroke
      // that got this far is a drag by definition
      endDrag(rec, 'drag');
    } else if (dist >= FLICK_PX && age <= FLICK_MS) {
      if (kind === 'player') emitFlick(rec, dx, dy);
      else emitSwipe(rec);
    } else {
      endDrag(rec, age >= DRAG_MS ? 'drag' : 'slow');
    }
  }

  releaseCarry(rec);
  releasePointer(e.pointerId);
}

function onPointerCancel(e) {
  // Losing capture mid-gesture cancels it without emitting anything.
  const rec = state.pointers.get(e.pointerId);
  if (!rec) return;
  if (rec.carrying > 0) {
    logGesture(rec, 'drag', 'dropped', performance.now() - rec.t0, 'x' + rec.carrying);
  }
  releaseCarry(rec);
  releasePointer(e.pointerId);
}

function releasePointer(id) {
  state.pointers.delete(id);
  try { canvas.releasePointerCapture(id); } catch (err) { /* already gone */ }
}

function isEnemyKind(k) {
  return k === 'enemyGun' || k === 'enemySword' || k === 'target';
}

function emitFlick(rec, dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx > 0) emit(rec, 'speedUp', 'flick right');
    else emit(rec, 'speedDown', 'flick left');
  } else if (dy < 0) {
    emit(rec, 'jump', 'flick up');
  } else {
    emit(rec, 'slide', 'flick down');
  }
}

function emitSwipe(rec) {
  emit(rec, 'slash', 'swipe');
}

function handleTap(rec, kind) {
  const age = performance.now() - rec.t0;
  if (kind === 'player') { emit(rec, 'jump', 'tap'); return; }
  if (isEnemyKind(kind)) { emit(rec, 'shoot', 'tap'); return; }
  if (kind === 'gate') return;            // already counted on pointerdown
  if (kind === 'orb') { logGesture(rec, 'tap', 'grabbed then let go', age); return; }
  // a tap on empty background is a no-op, not a misfire
  logGesture(rec, 'tap', 'none', age);
}

function endDrag(rec, gesture) {
  const kind = rec.target ? rec.target.kind : 'world';
  const age = performance.now() - rec.t0;
  if (kind === 'orb' || kind === 'world') {
    logGesture(rec, gesture, rec.carrying ? 'carry' : 'none', age, rec.carrying ? 'x' + rec.carrying : '');
  } else {
    logGesture(rec, gesture, 'unknown', age);
  }
}

function registerMashTap(rec, gate) {
  const now = performance.now();
  if (!gate.taps) gate.taps = [];
  gate.taps.push(now);
  while (gate.taps.length && now - gate.taps[0] > MASH_MS) gate.taps.shift();
  if (gate.taps.length >= MASH_TAPS) {
    gate.taps.length = 0;
    emit(rec, 'mash', 'mash x' + MASH_TAPS);
  } else {
    // a single tap does not open it, but it has to visibly answer, or
    // there is nothing to tell the player that tapping is the idea
    state.actionQueue.push({ type: 'gateTap', target: gate, pointerId: rec.id, t: now });
  }
}

// distance from point c to segment a-b
function segPointDist(ax, ay, bx, by, cx, cy) {
  const vx = bx - ax, vy = by - ay;
  const len2 = vx * vx + vy * vy;
  if (len2 < 0.0001) return Math.hypot(cx - ax, cy - ay);
  let t = ((cx - ax) * vx + (cy - ay) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(cx - (ax + vx * t), cy - (ay + vy * t));
}

function dragPickup(rec) {
  const pad = (MIN_TOUCH_PX / 2) / state.view.scale;
  for (let i = 0; i < state.entities.length; i++) {
    const e = state.entities[i];
    if (e.type !== 'orb' || e.dead || e.held != null) continue;
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    const d = segPointDist(rec.pwx, rec.pwy, rec.wx, rec.wy, cx, cy);
    if (d <= e.w / 2 + pad) grabOrb(e, rec);
  }
}

// Picking an orb up is not the same as banking it. It sticks to the finger
// and only counts once it reaches the character.
function grabOrb(orb, rec) {
  if (orb.dead || orb.held != null) return;
  orb.held = rec.id;
  orb.grabSeq = ++grabCounter;
  rec.carrying++;
  state.actionQueue.push({ type: 'grab', target: orb, pointerId: rec.id, t: performance.now() });
}

// The recognizer publishes where the finger is as a semantic action; no
// game system ever reaches into state.pointers for it.
function emitCarry(rec) {
  state.actionQueue.push({ type: 'carry', pointerId: rec.id, x: rec.wx, y: rec.wy, t: performance.now() });
}

function releaseCarry(rec) {
  if (!rec.carrying) return;
  state.actionQueue.push({ type: 'release', pointerId: rec.id, t: performance.now() });
}

canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
canvas.addEventListener('pointermove', onPointerMove, { passive: false });
canvas.addEventListener('pointerup', onPointerUp, { passive: false });
canvas.addEventListener('pointercancel', onPointerCancel, { passive: false });
canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
canvas.addEventListener('dblclick', function (e) { e.preventDefault(); });


/* ========================= 5. world + entities ======================= */

function addEntity(props) {
  const e = {
    id: nextEntityId++,
    type: 'orb', x: 0, y: 0, w: 18, h: 18,
    dead: false, flash: 0, shake: 0, value: 1
  };
  for (const k in props) e[k] = props[k];
  state.entities.push(e);
  return e;
}

function addOrb(x, y) {
  return addEntity({ type: 'orb', x: x - 9, y: y - 9, w: 18, h: 18 });
}

const world = {
  nextX: 0,
  lastChunk: '',
  restNext: false,
  lastLeftX: -9999,     // last event that wants the left thumb
  lastRightX: -9999     // last event that wants the right thumb
};

function pruneEntities() {
  const left = state.camera.x - 160;
  for (let i = state.entities.length - 1; i >= 0; i--) {
    const e = state.entities[i];
    if (e.held != null && !e.dead) continue;
    if (e.dead || e.x + e.w < left) state.entities.splice(i, 1);
  }
}

/* -------------------------- the silent opening ----------------------
   No UI, no text, no prompt: a stationary character and three green
   orbs. Collecting them is the only thing there is to do, and the walk
   unlock that follows is a hard gate — nothing respawns.
   -------------------------------------------------------------------- */

function startOpening() {
  const px = state.player.x;
  state.opening = { idle: 0, nudged: false };
  addOrb(px + 120, 168);
  addOrb(px + 186, 138);
  addOrb(px + 252, 176);
}

function updateOpening(dt) {
  const o = state.opening;
  if (!o) return;

  if (state.player.speedState !== 'still' || state.player.speed > 0) {
    state.opening = null;                  // the flick was found: the run begins
    world.nextX = state.camera.x + state.view.worldW + 60;
    return;
  }

  o.idle += dt;
  if (state.actionQueue.length) o.idle = 0;

  if (!o.nudged && o.idle > NUDGE_AFTER) {
    o.nudged = true;
    // A fourth orb drifts half-visible at the right edge, pulling the eye in
    // the direction of travel. Still no words. The spec also had the body
    // tip to the right, but a skew on a sprite reads as a rendering fault
    // rather than a lean, so the orb carries the hint alone.
    addOrb(state.camera.x + state.view.worldW - 4, 150);
  }
}

/* ---------------------------- the spawner ---------------------------
   Goalpost 3 places orbs plus whatever the player has unlocked, so XP
   can climb the ladder. Goalpost 4 replaces this with authored chunks.
   -------------------------------------------------------------------- */

/* Runs are assembled from hand-authored chunks, not from noise. Each is
   tagged with a difficulty tier and the abilities it takes to survive. */
const CHUNKS = [
  { id: 'rest', tier: 0, needs: [], rest: true, len: 430, items: [
    { t: 'orbLine', x: 70, n: 5, y: 182, dx: 40 }
  ]},
  { id: 'arc', tier: 0, needs: [], len: 500, items: [
    { t: 'orbArc', x: 90, n: 6, y: 204, dx: 38, rise: 60 }
  ]},
  { id: 'gate', tier: 0, needs: [], minXP: 18, len: 540, items: [
    { t: 'gate', x: 210 },
    { t: 'orbArc', x: 260, n: 4, y: 192, dx: 36, rise: 46 }
  ]},
  { id: 'hop', tier: 1, needs: ['jump'], len: 570, items: [
    { t: 'block', x: 230 },
    { t: 'orbArc', x: 180, n: 5, y: 212, dx: 36, rise: 72 }
  ]},
  { id: 'pit', tier: 1, needs: ['jump'], len: 610, items: [
    { t: 'gapNarrow', x: 240 },
    { t: 'orbLine', x: 250, n: 4, y: 204, dx: 30 }
  ]},
  { id: 'duck', tier: 1, needs: ['slide'], len: 570, items: [
    { t: 'beam', x: 240 },
    { t: 'orbLine', x: 340, n: 4, y: 152, dx: 34 }
  ]},
  { id: 'range', tier: 1, needs: ['gun'], len: 630, items: [
    { t: 'target', x: 180, y: 172 },
    { t: 'target', x: 330, y: 142 },
    { t: 'target', x: 480, y: 184 }
  ]},
  { id: 'spikes', tier: 2, needs: ['jump'], len: 650, items: [
    { t: 'spike', x: 210 },
    { t: 'spike', x: 440 },
    { t: 'orbArc', x: 260, n: 4, y: 192, dx: 36, rise: 52 }
  ]},
  { id: 'patrol', tier: 2, needs: ['enemies'], len: 670, items: [
    { t: 'enemyGun', x: 230 },
    { t: 'enemyGun', x: 460 },
    { t: 'orbLine', x: 320, n: 3, y: 158, dx: 34 }
  ]},
  { id: 'brute', tier: 2, needs: ['sword'], len: 650, items: [
    { t: 'enemySword', x: 270 },
    { t: 'orbLine', x: 400, n: 4, y: 172, dx: 34 }
  ]},
  { id: 'chasm', tier: 3, needs: ['run'], len: 740, items: [
    { t: 'gapWide', x: 270 },
    { t: 'orbArc', x: 280, n: 6, y: 194, dx: 32, rise: 62 }
  ]},
  { id: 'gauntlet', tier: 3, needs: ['jump', 'slide'], len: 780, items: [
    { t: 'beam', x: 180 },
    { t: 'block', x: 420 },
    { t: 'spike', x: 630 },
    { t: 'orbLine', x: 270, n: 5, y: 152, dx: 34 }
  ]}
];

// Fairness rule: two events needing the same thumb never land closer than
// 300 ms apart. 300 ms at top speed is 99 units; 150 also clears a slide.
const MIN_EVENT_GAP = 150;

const LEFT_THUMB = ['block', 'spike', 'beam', 'gapNarrow', 'gapWide'];
const RIGHT_THUMB = ['gate', 'target', 'enemyGun', 'enemySword'];

function thumbOf(t) {
  if (LEFT_THUMB.indexOf(t) >= 0) return 'left';
  if (RIGHT_THUMB.indexOf(t) >= 0) return 'right';
  return null;                                 // orbs are harvest, not events
}

function buildItem(item, x) {
  switch (item.t) {
    case 'block': return addEntity({ type: 'obstacle', shape: 'block', x: x, y: GROUND_Y - 26, w: 34, h: 26 });
    case 'spike': return addEntity({ type: 'obstacle', shape: 'spike', x: x, y: GROUND_Y - 30, w: 30, h: 30 });
    case 'beam':  return addEntity({ type: 'obstacle', shape: 'beam', x: x, y: 60, w: 60, h: GROUND_Y - 90 });
    case 'gapNarrow': return addEntity({ type: 'gap', x: x, y: GROUND_Y, w: 76, h: REF_H - GROUND_Y });
    case 'gapWide':   return addEntity({ type: 'gap', x: x, y: GROUND_Y, w: 168, h: REF_H - GROUND_Y });
    case 'gate':  return addEntity({ type: 'gate', x: x, y: GROUND_Y - 60, w: 20, h: 60 });
    case 'target': return addEntity({ type: 'target', x: x, y: item.y, w: 26, h: 26 });
    case 'enemyGun': return addEntity({ type: 'enemyGun', x: x, y: GROUND_Y - 40, w: 24, h: 40 });
    case 'enemySword': return addEntity({ type: 'enemySword', x: x, y: GROUND_Y - 42, w: 26, h: 42 });
    case 'orbLine':
      for (let i = 0; i < item.n; i++) addOrb(x + i * item.dx, item.y);
      return null;
    case 'orbArc':
      for (let i = 0; i < item.n; i++) {
        addOrb(x + i * item.dx, item.y - Math.sin((i / (item.n - 1)) * Math.PI) * item.rise);
      }
      return null;
  }
  return null;
}

function placeChunk(chunk, baseX) {
  // sort by position, then push anything that would crowd the same thumb
  const items = chunk.items.slice().sort(function (a, b) { return a.x - b.x; });
  let end = baseX + chunk.len;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let x = baseX + item.x;
    const thumb = thumbOf(item.t);
    if (thumb) {
      const lastX = thumb === 'left' ? world.lastLeftX : world.lastRightX;
      if (x - lastX < MIN_EVENT_GAP) x = lastX + MIN_EVENT_GAP;
      if (thumb === 'left') world.lastLeftX = x; else world.lastRightX = x;
    }
    buildItem(item, x);
    if (x + 90 > end) end = x + 90;
  }
  return end;
}

function currentTier() {
  if (!isUnlocked('jump')) return 0;
  if (!isUnlocked('gun')) return 1;
  if (!isUnlocked('run')) return 2;
  return 3;
}

function chunkPool(tier) {
  const pool = [];
  for (let i = 0; i < CHUNKS.length; i++) {
    const c = CHUNKS[i];
    if (c.tier > tier) continue;
    if (c.minXP && state.meta.totalXP < c.minXP) continue;
    let ok = true;
    for (let j = 0; j < c.needs.length; j++) if (!isUnlocked(c.needs[j])) ok = false;
    if (ok) pool.push(c);
  }
  return pool;
}

function pickChunk() {
  const tier = currentTier();

  // after a peak, and during the post-run breather, the world backs off
  if (state.run.time < state.breatherUntil || world.restNext) {
    world.restNext = false;
    world.lastChunk = CHUNKS[0].id;
    return CHUNKS[0];
  }

  const pool = chunkPool(tier);
  let choice = pool[Math.floor(Math.random() * pool.length)];
  if (pool.length > 1 && choice.id === world.lastChunk) {
    choice = pool[(pool.indexOf(choice) + 1) % pool.length];
  }
  world.lastChunk = choice.id;
  if (choice.tier >= tier && tier > 0) world.restNext = true;
  return choice;
}

function updateSpawner() {
  if (state.opening || state.celebration || !state.run.alive) { pruneEntities(); return; }

  const ahead = state.camera.x + state.view.worldW + 220;
  let guard = 0;
  while (world.nextX < ahead && guard++ < 12) {
    world.nextX = placeChunk(pickChunk(), world.nextX) + 40;
  }
  pruneEntities();
}

/* ------------------------ unlocks and celebration ------------------- */

function hazardWithin(seconds) {
  const p = state.player;
  const reach = p.x + Math.max(p.speed, SPEED.walking) * seconds;
  for (let i = 0; i < state.entities.length; i++) {
    const e = state.entities[i];
    if (e.dead || HAZARD_TYPES.indexOf(e.type) < 0) continue;
    if (e.x + e.w >= p.x - 20 && e.x <= reach) return true;
  }
  return false;
}

// The strength gate is available from the very first second, but nothing in
// the game ever showed that it breaks under repeated taps — so the first
// wall a new player meets looks like a wall they lack the ability for.
// It gets the same demonstration an unlock gets, once per profile.
function teachMash() {
  if (state.celebration) return;
  if (state.meta.taught.indexOf('mash') >= 0) return;
  // the speed never drops at a gate — the clamp on position is what says
  // "you are stuck", so that is what this waits for
  const gate = state.haltedBy;
  if (!gate || gate.type !== 'gate' || gate.dead) return;

  state.meta.taught.push('mash');
  saveMeta();
  state.celebration = { id: 'mash', demo: 'mash', ent: gate, t: 0, dur: CELEBRATION_SEC };
}

function checkUnlocks() {
  if (state.celebration) return;
  const next = nextUnlock();
  if (!next) return;
  if (state.meta.totalXP < next.xp) return;
  // an unlock that fires mid-hazard turns the best moment in the game
  // into the cause of a death
  if (hazardWithin(SAFE_SECONDS)) return;
  grantUnlock(next);
}

function grantUnlock(unlock) {
  state.meta.unlocked.push(unlock.id);
  saveMeta();

  let demoEnt = null;
  if (unlock.spawn) demoEnt = spawnDemoEntity(unlock.spawn);
  if (unlock.id === 'run') state.breatherUntil = state.run.time + CELEBRATION_SEC + BREATHER_SEC;

  state.celebration = {
    id: unlock.id,
    demo: unlock.demo,
    ent: demoEnt,
    t: 0,
    dur: CELEBRATION_SEC
  };
}

function spawnDemoEntity(type) {
  const x = state.player.x + Math.min(210, state.view.worldW * 0.42);
  if (type === 'target') return addEntity({ type: 'target', x: x, y: 168, w: 26, h: 26 });
  if (type === 'enemyGun') return addEntity({ type: 'enemyGun', x: x, y: GROUND_Y - 40, w: 24, h: 40 });
  return addEntity({ type: 'enemySword', x: state.player.x + 70, y: GROUND_Y - 42, w: 26, h: 42 });
}

function updateCelebration(dt) {
  const c = state.celebration;
  if (!c) return;
  c.t += dt;
  if (c.t >= c.dur) state.celebration = null;
}


/* ============================ 6. game logic ========================== */

function consumeActions() {
  const q = state.actionQueue;
  for (let i = 0; i < q.length; i++) applyAction(q[i]);
  q.length = 0;
}

// Which unlock each semantic action waits on. The recognizer emits
// regardless; game logic is what refuses.
function actionGate(a) {
  const p = state.player;
  switch (a.type) {
    case 'jump': return p.grounded ? 'jump' : 'doubleJump';
    case 'slide': return 'slide';
    case 'speedUp': return p.speedState === 'still' ? 'walk' : 'run';
    case 'speedDown': return 'walk';
    case 'shoot': return 'gun';
    case 'slash': return 'sword';
    default: return null;
  }
}

function applyAction(a) {
  const p = state.player;

  const gate = actionGate(a);
  if (gate && !isUnlocked(gate)) {
    if (a.log) a.log.action += ' (locked)';
    return;
  }

  switch (a.type) {
    case 'jump':
      if (p.grounded) {
        p.vy = -JUMP_V;
        p.grounded = false;
        p.crouchUntilX = 0;              // a jump cancels a slide
        p.action = 'jump';
        p.airJumpsLeft = isUnlocked('doubleJump') ? 1 : 0;
      } else if (p.airJumpsLeft > 0) {
        p.airJumpsLeft--;
        p.vy = -JUMP_V * 0.9;
        p.action = 'jump';
      }
      break;

    case 'slide':
      if (p.grounded) {
        if (!p.crouch) burst(p.x - 10, GROUND_Y - 3, '#8a8f9c', 5, 55);   // kicked-up dust
        p.crouchUntilX = p.x + SLIDE_DIST;
        p.crouch = true;
        p.action = 'slide';
        p.actionTimer = 0;
      } else {
        p.vy = Math.max(p.vy, 260);   // fast-fall out of a jump
      }
      break;

    case 'speedUp':
      setSpeedState(SPEED_ORDER[Math.min(SPEED_ORDER.indexOf(p.speedState) + 1, 2)]);
      break;

    case 'speedDown':
      setSpeedState(SPEED_ORDER[Math.max(SPEED_ORDER.indexOf(p.speedState) - 1, 0)]);
      break;

    case 'shoot':
      p.action = 'shoot';
      p.actionTimer = 0.28;   // long enough for the bow draw-and-release to play
      fireBullet(a.target);
      break;

    case 'slash':
      p.action = 'slash';
      p.actionTimer = 0.28;
      swingSword(a.target);
      break;

    case 'mash':
      if (a.target && a.target.type === 'gate') {
        a.target.dead = true;              // pushed through
        dropOrbs(a.target, 2);
      }
      break;

    case 'grab':
      if (a.target) a.target.flash = 0.12;      // it answers the touch at once
      break;

    case 'gateTap':
      if (a.target) {
        a.target.flash = 0.1;
        a.target.shake = 0.16;
        state.shake = Math.max(state.shake, 1.6);
      }
      break;

    case 'carry':
      state.carry.set(a.pointerId, { x: a.x, y: a.y });
      break;

    case 'release':
      state.carry.delete(a.pointerId);
      for (let i = 0; i < state.entities.length; i++) {
        const e = state.entities[i];
        if (e.type === 'orb' && e.held === a.pointerId) e.held = null;
      }
      break;

    case 'collect': {
      // value is decided at the instant it reaches the character, by speed
      const gain = a.target && a.target.value ? a.target.value : orbValue();
      state.meta.totalXP += gain;
      state.run.xpThisRun += gain;
      if (a.target) burst(a.target.x + a.target.w / 2, a.target.y + a.target.h / 2, orbColour(), 6, 90);
      break;
    }
  }
}

function setSpeedState(next) {
  state.player.speedState = next;
}

function inMeleeRange(ent) {
  const p = state.player;
  const cx = ent.x + ent.w / 2;
  return Math.abs(cx - p.x) <= MELEE_RANGE;
}


/* ---------------------------- combat -------------------------------- */

function fireBullet(target) {
  const p = state.player;
  const box = playerBox();
  const from = { x: box.x + box.w, y: box.y + box.h * 0.45 };
  let vx = BULLET_SPEED, vy = 0;
  if (target && !target.dead) {
    const dx = target.x + target.w / 2 - from.x;
    const dy = target.y + target.h / 2 - from.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    vx = dx / len * BULLET_SPEED;
    vy = dy / len * BULLET_SPEED;
  }
  addEntity({ type: 'bullet', x: from.x, y: from.y - 2, w: 8, h: 4, vx: vx, vy: vy, life: 1.4 });
}

function swingSword(target) {
  const p = state.player;
  // a swipe on something out of reach whiffs, so the range is learned
  // rather than suspected as a dropped input
  if (!target || target.dead) return;
  if (!inMeleeRange(target)) { target.flash = 0.12; p.whiff = 0.28; return; }
  killEntity(target, 2);
}

function killEntity(e, orbCount) {
  if (e.dead) return;
  e.dead = true;
  burst(e.x + e.w / 2, e.y + e.h / 2, '#c9d1e0', 10, 130);
  shakeScreen(2.5);
  dropOrbs(e, orbCount);
}

function dropOrbs(e, n) {
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  for (let i = 0; i < n; i++) {
    addOrb(cx + (i - (n - 1) / 2) * 26, cy - 18);
  }
}

function updateBullets(dt) {
  const left = state.camera.x - 60;
  const right = state.camera.x + state.view.worldW + 60;
  for (let i = 0; i < state.entities.length; i++) {
    const b = state.entities[i];
    if (b.type !== 'bullet' || b.dead) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.x < left || b.x > right) { b.dead = true; continue; }

    for (let j = 0; j < state.entities.length; j++) {
      const e = state.entities[j];
      if (e.dead) continue;
      if (e.type !== 'target' && e.type !== 'enemyGun' && e.type !== 'enemySword') continue;
      if (!overlaps(b, e)) continue;
      if (e.type === 'enemySword') { e.flash = 0.16; b.dead = true; break; }  // immune to bullets
      killEntity(e, e.type === 'target' ? 2 : 3);
      b.dead = true;
      break;
    }
  }
}


/* ------------------------- the hazard matrix ------------------------
   Lethality depends on speed, which is what makes escalating a decision.
   -------------------------------------------------------------------- */

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function gapAt(x) {
  for (let i = 0; i < state.entities.length; i++) {
    const e = state.entities[i];
    if (e.type === 'gap' && !e.dead && x > e.x + 2 && x < e.x + e.w - 2) return e;
  }
  return null;
}

// The x the player is not allowed to walk past, or null if the road is clear.
function stopLine() {
  const p = state.player;
  if (!p.grounded) return null;
  let line = null;
  state.blockedBy = null;

  for (let i = 0; i < state.entities.length; i++) {
    const e = state.entities[i];
    if (e.dead) continue;

    if (e.type === 'gate') {
      const edge = e.x - 14;
      if (p.x <= edge + 3 && (line === null || edge < line)) { line = edge; state.blockedBy = e; }
    } else if (e.type === 'obstacle' && e.shape === 'block' && p.speedState !== 'running') {
      // blunt block: bumps and halts while walking, no damage
      const edge = e.x - 14;
      if (p.x <= edge + 3 && (line === null || edge < line)) line = edge;
    } else if (e.type === 'gap' && e.w > WALK_JUMP_REACH) {
      // A gap no walking jump can span: the character refuses to step off.
      // Pinned at the lip it still revs up, so escalating to running and
      // then jumping is the way across — and the only way across.
      const edge = e.x - 4;
      if (p.x <= edge + 3 && (line === null || edge < line)) line = edge;
    }
  }
  return line;
}

function beamOverhead() {
  const x0 = state.player.x - 13;
  const x1 = state.player.x + 13;
  for (let i = 0; i < state.entities.length; i++) {
    const e = state.entities[i];
    if (e.dead || e.type !== 'obstacle' || e.shape !== 'beam') continue;
    if (x0 < e.x + e.w && x1 > e.x) return true;
  }
  return false;
}

function killPlayer(cause) {
  if (!state.run.alive) return;
  state.run.alive = false;
  state.player.action = 'death';
  state.player.speedState = 'still';
  state.player.deathTimer = DEATH_PAUSE;
  burst(state.player.x, state.player.y - 20, COL.orbRunning, 16, 170);
  shakeScreen(9);
  state.player.cause = cause;
  saveMeta();
}

function resolveHazards() {
  const p = state.player;
  if (!state.run.alive) return;
  const box = playerBox();

  for (let i = 0; i < state.entities.length; i++) {
    const e = state.entities[i];
    if (e.dead) continue;

    if (e.type === 'obstacle') {
      if (!overlaps(box, e)) continue;
      if (e.shape === 'spike') { killPlayer('spike'); return; }
      if (e.shape === 'beam') { killPlayer('beam'); return; }        // must slide
      if (e.shape === 'block' && p.speedState === 'running') { killPlayer('block'); return; }
    } else if (e.type === 'enemyGun' || e.type === 'enemySword') {
      if (overlaps(box, e)) { killPlayer('enemy'); return; }
    }
  }

  if (p.y > REF_H + 60) killPlayer('fell');
}

function updatePlayer(dt) {
  const p = state.player;

  if (p.anticipate > 0) p.anticipate = Math.max(0, p.anticipate - dt);
  if (p.whiff > 0) p.whiff = Math.max(0, p.whiff - dt);
  if (p.actionTimer > 0) {
    p.actionTimer -= dt;
    if (p.actionTimer <= 0) p.actionTimer = 0;
  }
  // A slide covers SLIDE_DIST of ground, and is held for as long as there
  // is still a beam overhead — commit to it and it carries you through.
  if (p.grounded && p.crouchUntilX > 0) {
    p.crouch = p.x < p.crouchUntilX || beamOverhead();
    if (!p.crouch) p.crouchUntilX = 0;
  } else {
    p.crouch = false;
  }

  if (!state.run.alive) {
    p.deathTimer -= dt;
    p.speed = 0;
    if (p.deathTimer <= 0) startRun();
    return;
  }

  // speed ramp: transitions are felt, not teleported
  const wanted = SPEED[p.speedState];
  if (p.speed < wanted) p.speed = Math.min(wanted, p.speed + ACCEL_RATE * dt);
  else if (p.speed > wanted) p.speed = Math.max(wanted, p.speed - DECEL_RATE * dt);

  const step = (p.crouch ? Math.max(p.speed, SLIDE_SPEED) : p.speed) * dt;
  const line = stopLine();
  p.x += step;
  if (line !== null && p.x > line) {
    if (!p.bumped) shakeScreen(2);
    p.x = line;
    p.bumped = 0.15;
    state.haltedBy = state.blockedBy;
  } else if (p.bumped > 0) {
    state.haltedBy = null;
    p.bumped = Math.max(0, p.bumped - dt);
  } else {
    state.haltedBy = null;
  }
  state.run.distance += step;

  if (!p.grounded) {
    p.vy += GRAVITY * dt;
    p.y += p.vy * dt;
    if (p.y >= GROUND_Y && !gapAt(p.x)) {
      p.y = GROUND_Y;
      p.vy = 0;
      p.grounded = true;
      p.airJumpsLeft = 0;
    }
  } else if (gapAt(p.x)) {
    p.grounded = false;                      // walked off an edge
    p.vy = 0;
  }

  if (p.crouch) {
    p.action = 'slide';
  } else if (p.actionTimer <= 0) {
    if (!p.grounded) p.action = p.vy < 0 ? 'jump' : 'fall';
    else if (p.speedState === 'running') p.action = 'run';
    else if (p.speedState === 'walking') p.action = 'walk';
    else p.action = 'idle';
  }

  state.camera.x = p.x - playerScreenX();
}

function burst(x, y, colour, n, spread) {
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp = (0.4 + Math.random() * 0.6) * (spread || 90);
    state.particles.push({
      x: x, y: y,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 30,
      life: 0.28 + Math.random() * 0.24, max: 0.52, colour: colour
    });
  }
  if (state.particles.length > 160) state.particles.splice(0, state.particles.length - 160);
}

function shakeScreen(mag) {
  if (mag > state.shake) state.shake = mag;
}

function updateParticles(dt) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const q = state.particles[i];
    q.life -= dt;
    if (q.life <= 0) { state.particles.splice(i, 1); continue; }
    q.vy += 340 * dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
  }
  state.shake = Math.max(0, state.shake - dt * 26);
}

function updateEntities(dt) {
  for (let i = 0; i < state.entities.length; i++) {
    const e = state.entities[i];
    if (e.flash > 0) e.flash = Math.max(0, e.flash - dt);
    if (e.shake > 0) e.shake = Math.max(0, e.shake - dt);
  }
  updateCarriedOrbs(dt);
  if (state.run.alive) sweepOrbsByContact();
}

// Each finger tows a chain: the first orb chases the fingertip, the rest
// chase the one in front. They bank one after another as the chain reaches
// the character, which is what makes delivering a run of them feel like
// something rather than a single event.
function updateCarriedOrbs(dt) {
  if (!state.carry.size) return;

  const k = 1 - Math.exp(-dt * ORB_FOLLOW);
  const pb = playerBox();
  const px = pb.x + pb.w / 2;
  const py = pb.y + pb.h / 2;

  state.carry.forEach(function (pos, id) {
    const chain = [];
    for (let i = 0; i < state.entities.length; i++) {
      const e = state.entities[i];
      if (e.type === 'orb' && !e.dead && e.held === id) chain.push(e);
    }
    if (!chain.length) return;
    chain.sort(function (a, b) { return a.grabSeq - b.grabSeq; });

    let tx = pos.x;
    let ty = pos.y - ORB_LIFT;

    for (let i = 0; i < chain.length; i++) {
      const orb = chain[i];
      const cx = orb.x + orb.w / 2;
      const cy = orb.y + orb.h / 2;

      let gx = tx, gy = ty;
      if (i > 0) {
        // Hold station exactly ORB_SPACING behind the one in front — pushing
        // apart when too close, not only pulling in when too far. Without
        // the push, a fast sweep leaves them in a heap and you cannot see
        // how many you are carrying.
        let ox = cx - tx, oy = cy - ty;
        let len = Math.hypot(ox, oy);
        if (len < 0.001) {
          const ang = i * 1.1;                  // deterministic fan when stacked
          ox = Math.cos(ang); oy = Math.sin(ang); len = 1;
        }
        gx = tx + (ox / len) * ORB_SPACING;
        gy = ty + (oy / len) * ORB_SPACING;
      }

      orb.x += (gx - cx) * k;
      orb.y += (gy - cy) * k;

      tx = orb.x + orb.w / 2;
      ty = orb.y + orb.h / 2;

      if (Math.hypot(tx - px, ty - py) <= ORB_DELIVER_RADIUS) deliverOrb(orb);
    }
  });
}

// Orbs also come in by running into them. The drag is how you reach the ones
// placed off the run line; anything the character actually touches should
// not need a second thumb to claim it.
function sweepOrbsByContact() {
  const box = playerBox();
  for (let i = 0; i < state.entities.length; i++) {
    const e = state.entities[i];
    if (e.type !== 'orb' || e.dead || e.held != null) continue;
    if (overlaps(box, e)) deliverOrb(e);
  }
}

function deliverOrb(orb) {
  if (orb.dead) return;
  orb.dead = true;
  orb.held = null;
  orb.value = orbValue();
  state.actionQueue.push({ type: 'collect', target: orb, pointerId: -1, t: performance.now() });
}

function orbColour() {
  const s = state.player.speedState;
  if (s === 'running') return COL.orbRunning;
  if (s === 'walking') return COL.orbWalking;
  return COL.orbStill;
}

function orbValue() {
  return ORB_VALUE[state.player.speedState];
}

function update(dt) {
  state.run.time += dt;

  updateSky(dt);

  // the unlock celebration slows the world without slowing the celebration
  updateCelebration(dt);
  const play = state.celebration ? dt * CELEBRATION_SLOW : dt;

  updateOpening(play);
  consumeActions();
  updatePlayer(play);
  updateBullets(play);
  updateEntities(play);
  updateParticles(play);
  updateSpriteAnim(play);
  resolveHazards();
  updateSpawner();
  teachMash();
  checkUnlocks();
}


/* ---------------------------- the sky -------------------------------
   A slow day, drifting across every run. It never resets on death: coming
   back to a sky that has moved on is most of what makes it feel gentle.
   -------------------------------------------------------------------- */

function hexToRgb(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function mixHex(a, b, k) {
  const x = hexToRgb(a), y = hexToRgb(b);
  return 'rgb(' + Math.round(x[0] + (y[0] - x[0]) * k) + ',' +
                  Math.round(x[1] + (y[1] - x[1]) * k) + ',' +
                  Math.round(x[2] + (y[2] - x[2]) * k) + ')';
}

function skyNow() {
  const t = state.sky.t;
  let i = 0;
  while (i < SKY_KEYS.length - 2 && SKY_KEYS[i + 1].t <= t) i++;
  const a = SKY_KEYS[i], b = SKY_KEYS[i + 1];
  let k = (t - a.t) / (b.t - a.t);
  k = k * k * (3 - 2 * k);                  // smoothstep, so nothing snaps
  return {
    top: mixHex(a.top, b.top, k),
    hor: mixHex(a.hor, b.hor, k),
    gnd: mixHex(a.gnd, b.gnd, k),
    far: mixHex(a.far, b.far, k),
    near: mixHex(a.near, b.near, k),
    stars: a.stars + (b.stars - a.stars) * k
  };
}

function buildSkyDecor() {
  const stars = [];
  for (let i = 0; i < 90; i++) {
    stars.push({
      x: Math.random() * 2000,
      y: Math.random() * (GROUND_Y - 90),
      r: 0.6 + Math.random() * 1.1,
      phase: Math.random() * Math.PI * 2,
      speed: 0.6 + Math.random() * 1.4
    });
  }
  state.sky.stars = stars;
}

function updateSky(dt) {
  state.sky.t = (state.sky.t + dt / DAY_SECONDS) % 1;
}

// a deterministic ridge, so the hills are stable however far you run
function ridge(x, seed, amp, wave) {
  return Math.sin(x / wave + seed) * amp
       + Math.sin(x / (wave * 0.37) + seed * 2.3) * amp * 0.42
       + Math.sin(x / (wave * 0.13) + seed * 4.1) * amp * 0.16;
}

function drawHillLayer(colour, parallax, baseY, amp, wave, seed) {
  const v = state.view;
  const off = state.camera.x * parallax;
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(state.camera.x, REF_H);
  const step = 14;
  for (let sx = -step; sx <= v.worldW + step; sx += step) {
    const wx = sx + off;
    ctx.lineTo(state.camera.x + sx, baseY + ridge(wx, seed, amp, wave));
  }
  ctx.lineTo(state.camera.x + v.worldW + step, REF_H);
  ctx.closePath();
  ctx.fill();
}

function drawSky(sky) {
  const v = state.view;
  const left = state.camera.x;

  const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  g.addColorStop(0, sky.top);
  g.addColorStop(1, sky.hor);
  ctx.fillStyle = g;
  ctx.fillRect(left, 0, v.worldW, GROUND_Y);

  if (sky.stars > 0.01) {
    const stars = state.sky.stars;
    const off = state.camera.x * 0.06;
    for (let i = 0; i < stars.length; i++) {
      const st = stars[i];
      let x = (st.x - off) % 2000;
      if (x < 0) x += 2000;
      if (x > v.worldW + 4) continue;
      const tw = 0.55 + 0.45 * Math.sin(state.run.time * st.speed + st.phase);
      ctx.globalAlpha = sky.stars * tw;
      ctx.fillStyle = '#e8eaf0';
      ctx.fillRect(left + x, st.y, st.r, st.r);
    }
    ctx.globalAlpha = 1;
  }

  drawCelestialBody(sky);
  drawHillLayer(sky.far, 0.18, GROUND_Y - 54, 22, 210, 1.7);
  drawHillLayer(sky.near, 0.42, GROUND_Y - 20, 15, 130, 4.2);
}

// sun by day, moon by night, on the same slow arc
function drawCelestialBody(sky) {
  const v = state.view;
  const t = state.sky.t;
  const day = t > 0.20 && t < 0.82;
  const phase = day ? (t - 0.20) / 0.62 : ((t + 0.18) % 1) / 0.38;
  const x = state.camera.x + v.worldW * (0.12 + phase * 0.78);
  const y = GROUND_Y - 40 - Math.sin(phase * Math.PI) * (GROUND_Y - 120);
  const r = day ? 17 : 13;
  const core = day ? '#ffd9a3' : '#dfe6f5';

  // a real falloff: a flat disc at low alpha reads as a grey ring, not a glow
  const halo = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 3.2);
  halo.addColorStop(0, core);
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(x, y, r * 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  if (!day) {
    // bite a crescent out of the moon with the sky behind it
    ctx.fillStyle = sky.top;
    ctx.beginPath(); ctx.arc(x + r * 0.42, y - r * 0.3, r * 0.92, 0, Math.PI * 2); ctx.fill();
  }
}


/* ============================= 7. renderers ========================== */

/* Two renderers behind one interface. Rectangles are permanent and always
   work with zero downloads; sprites switch on only when assets/manifest.json
   both loads and names a sheet. The manifest ships present but empty, so the
   default state costs the console nothing; delete the whole assets folder and
   the game is still unchanged underneath, at the price of one 404 log for the
   probe. */
// how dark the sky is right now, 0 by day and 1 at the bottom of the night
let currentSky = null;
function nightAmount() {
  return currentSky ? currentSky.stars : 0;
}

const sprites = { ready: false, manifest: null, image: null, anim: '', frame: 0, clock: 0, entities: {}, ground: {} };

const ACTION_TO_ANIM = {
  idle: 'idle', walk: 'walk', run: 'run', jump: 'jump', fall: 'fall',
  slide: 'slide', slash: 'slash', shoot: 'shoot', death: 'death'
};

// when a pack lacks an animation, fall back rather than draw nothing
const ANIM_FALLBACK = {
  run: 'walk', walk: 'run', fall: 'jump', jump: 'fall',
  slide: 'crouch', shoot: 'slash', slash: 'attack', death: 'hurt'
};

function loadImage(src, onload) {
  const img = new Image();
  img.onload = function () { onload(img); };
  img.onerror = function () { /* missing file: that thing stays a rectangle */ };
  img.src = src;
}

function loadSprites() {
  if (!window.fetch) return;
  fetch('assets/manifest.json', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('no manifest'); return r.json(); })
    .then(function (m) {
      if (!m) throw new Error('bad manifest');

      if (m.player && m.player.sheet && m.player.animations) {
        loadImage(m.player.sheet, function (img) {
          sprites.manifest = m.player;
          sprites.image = img;
          sprites.anim = '';
          sprites.ready = true;
        });
      }

      if (m.ground) {
        ['strip', 'ledge'].forEach(function (key) {
          const spec = m.ground[key];
          if (!spec || !spec.sheet) return;
          loadImage(spec.sheet, function (img) {
            spec.image = img;
            sprites.ground[key] = spec;
          });
        });
      }

      // Entities load one at a time and switch over as they arrive, so a
      // single missing file costs that one thing its sprite and nothing else.
      if (m.entities) {
        Object.keys(m.entities).forEach(function (key) {
          const spec = m.entities[key];
          if (!spec || !spec.sheet) return;
          loadImage(spec.sheet, function (img) {
            spec.image = img;
            if (spec.tint) spec.tinted = {};
            sprites.entities[key] = spec;
          });
        });
      }
    })
    .catch(function () { /* no assets folder, or opened from file://: rectangles */ });
}

// A white sprite multiplied into a colour, cached per colour. The orb has to
// keep changing with the speed state, and that is a tint, not nine files.
function tintedSprite(spec, colour) {
  if (!spec.tinted) spec.tinted = {};
  if (spec.tinted[colour]) return spec.tinted[colour];
  const c = document.createElement('canvas');
  c.width = spec.image.width;
  c.height = spec.image.height;
  const g = c.getContext('2d');
  g.drawImage(spec.image, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = colour;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(spec.image, 0, 0);
  spec.tinted[colour] = c;
  return c;
}

// A flat one-colour stamp of a sprite, cached. Drawing it at small offsets
// under the real sprite gives an outline — which is what stops a dark object
// from disappearing into a dark sky.
function silhouette(spec, colour) {
  if (!spec.sil) spec.sil = {};
  if (spec.sil[colour]) return spec.sil[colour];
  const c = document.createElement('canvas');
  c.width = spec.image.width;
  c.height = spec.image.height;
  const g = c.getContext('2d');
  g.drawImage(spec.image, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = colour;
  g.fillRect(0, 0, c.width, c.height);
  spec.sil[colour] = c;
  return c;
}

const RIM_OFFSETS = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];

// Which sprite an entity uses. Obstacles are keyed by shape, and enemyGun
// alternates between two creatures so a patrol is not two clones.
function spriteKeyFor(e) {
  if (e.type === 'obstacle') return e.shape;
  if (e.type === 'enemyGun') return (e.id % 2) ? 'enemyGun2' : 'enemyGun';
  return e.type;
}

function drawEntitySprite(e, spec) {
  const frame = spec.frames > 1
    ? Math.floor((state.run.time + (e.id % 7) * 0.31) * spec.fps) % spec.frames
    : 0;
  const sx = frame * spec.frameWidth;
  const img = (spec.tint ? tintedSprite(spec, orbColour()) : spec.image);

  let dx, dy, dw, dh;
  if (spec.anchor === 'box') {
    dx = e.x; dy = e.y; dw = e.w; dh = e.h;
  } else {
    dh = spec.height || spec.frameHeight;
    dw = spec.frameWidth * (dh / spec.frameHeight);
    dx = e.x + e.w / 2 - dw / 2;
    dy = spec.anchor === 'bottom' ? e.y + e.h - dh : e.y + e.h / 2 - dh / 2;
  }

  // The rim comes up as the light goes down. Orbs are exempt: they carry
  // their own glow and a rim would only muddy the colour that matters.
  const night = spec.tint ? 0 : nightAmount();
  if (night > 0.03) {
    const sil = silhouette(spec, '#c3d0e6');
    const o = 1.2;
    ctx.globalAlpha = 0.02 + night * 0.055;
    for (let i = 0; i < RIM_OFFSETS.length; i++) {
      ctx.drawImage(sil, sx, 0, spec.frameWidth, spec.frameHeight,
                    dx + RIM_OFFSETS[i][0] * o, dy + RIM_OFFSETS[i][1] * o, dw, dh);
    }
    ctx.globalAlpha = 1;
  }

  ctx.drawImage(img, sx, 0, spec.frameWidth, spec.frameHeight, dx, dy, dw, dh);
}

function spriteAnimName() {
  const anims = sprites.manifest.animations;
  const want = ACTION_TO_ANIM[state.player.action] || 'idle';
  if (anims[want]) return want;
  const alt = ANIM_FALLBACK[want];
  if (alt && anims[alt]) return alt;
  if (anims.idle) return 'idle';
  return Object.keys(anims)[0];
}

function updateSpriteAnim(dt) {
  if (!sprites.ready) return;
  const name = spriteAnimName();
  if (name !== sprites.anim) { sprites.anim = name; sprites.frame = 0; sprites.clock = 0; }

  const a = sprites.manifest.animations[name];
  sprites.clock += dt;
  const step = 1 / (a.fps || 10);
  while (sprites.clock >= step) {
    sprites.clock -= step;
    if (a.loop === false) sprites.frame = Math.min(sprites.frame + 1, a.frames - 1);
    else sprites.frame = (sprites.frame + 1) % a.frames;
  }
}

function render(now) {
  const v = state.view;
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, v.w, v.h);

  // world units -> device pixels
  ctx.setTransform(v.dpr * v.scale, 0, 0, v.dpr * v.scale, 0, 0);
  if (state.shake > 0.1) {
    ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
  }
  ctx.translate(-state.camera.x, 0);

  const sky = skyNow();
  currentSky = sky;
  drawSky(sky);
  drawGround(sky);
  drawCarryThreads();
  drawEntities();
  drawParticles();
  drawPointerTrails();
  if (sprites.ready) drawPlayerSprite(); else drawPlayerRect();
  drawCelebration();
}

function drawParticles() {
  for (let i = 0; i < state.particles.length; i++) {
    const q = state.particles[i];
    ctx.globalAlpha = Math.max(0, q.life / q.max);
    ctx.fillStyle = q.colour;
    ctx.fillRect(q.x - 1.5, q.y - 1.5, 3, 3);
  }
  ctx.globalAlpha = 1;
}

function drawGround(sky) {
  const v = state.view;
  const left = state.camera.x;
  const right = left + v.worldW;
  groundTint = sky ? sky.gnd : COL.ground;

  const gaps = [];
  for (let i = 0; i < state.entities.length; i++) {
    const e = state.entities[i];
    if (e.type === 'gap' && !e.dead && e.x < right && e.x + e.w > left) gaps.push(e);
  }
  gaps.sort(function (a, b) { return a.x - b.x; });

  // The pit first: a hole has to be darker than everything around it, or it
  // just merges with the background and stops reading as a hole at all.
  for (let i = 0; i < gaps.length; i++) drawPit(gaps[i]);

  let x = left;
  for (let i = 0; i < gaps.length; i++) {
    if (gaps[i].x > x) drawGroundSpan(x, gaps[i].x);
    x = Math.max(x, gaps[i].x + gaps[i].w);
  }
  if (x < right) drawGroundSpan(x, right);
}

function drawPit(gap) {
  const top = GROUND_Y;
  const depth = REF_H - GROUND_Y;

  // a void that fades to black, so the eye reads depth rather than a panel
  const g = ctx.createLinearGradient(0, top, 0, REF_H);
  g.addColorStop(0, '#0a0c11');
  g.addColorStop(1, '#000000');
  ctx.fillStyle = g;
  ctx.fillRect(gap.x, top, gap.w, depth);

  // both lips catch the light: this is the edge you are aiming to clear
  ctx.fillStyle = '#6b7689';
  ctx.fillRect(gap.x - 3, top - 2, 3, 4);
  ctx.fillRect(gap.x + gap.w, top - 2, 3, 4);

  // and the inner faces fall away into the dark
  const face = ctx.createLinearGradient(0, top, 0, top + 26);
  face.addColorStop(0, 'rgba(107,118,137,0.55)');
  face.addColorStop(1, 'rgba(107,118,137,0)');
  ctx.fillStyle = face;
  ctx.fillRect(gap.x, top, 4, 26);
  ctx.fillRect(gap.x + gap.w - 4, top, 4, 26);
}

let groundTint = COL.ground;

function drawGroundSpan(x0, x1) {
  ctx.fillStyle = groundTint;
  ctx.fillRect(x0, GROUND_Y, x1 - x0, REF_H - GROUND_Y);

  const strip = sprites.ground.strip;
  if (strip) {
    // tiled from a fixed world origin, so the texture stays put in the world
    // rather than sliding under the player
    const w = strip.w;
    const start = Math.floor(x0 / w) * w;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, GROUND_Y, x1 - x0, strip.h);
    ctx.clip();
    for (let x = start; x < x1; x += w) {
      ctx.drawImage(strip.image, x, GROUND_Y, w, strip.h);
    }
    ctx.restore();

    const ledge = sprites.ground.ledge;
    if (ledge) {
      ctx.drawImage(ledge.image, x0, GROUND_Y, ledge.w, ledge.h);
      ctx.save();
      ctx.translate(x1, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(ledge.image, 0, GROUND_Y, ledge.w, ledge.h);
      ctx.restore();
    }
    return;
  }

  /* ---- rectangle fallback ---- */
  ctx.fillStyle = COL.groundLine;
  ctx.fillRect(x0, GROUND_Y, x1 - x0, 1.5);

  // a brighter lip on each edge, so a pit reads as a pit
  ctx.fillStyle = '#3c4557';
  ctx.fillRect(x0, GROUND_Y, 3, 9);
  ctx.fillRect(x1 - 3, GROUND_Y, 3, 9);

  // sparse tick marks so motion is readable at any speed
  ctx.fillStyle = '#232936';
  const step = 48;
  const first = Math.ceil(x0 / step) * step;
  for (let x = first; x < x1 - 14; x += step) ctx.fillRect(x, GROUND_Y + 10, 14, 2);
}

function labelledRect(x, y, w, h, colour, label) {
  ctx.fillStyle = colour;
  ctx.fillRect(x, y, w, h);
  if (!label) return;
  ctx.fillStyle = COL.label;
  ctx.font = '600 9px ' + FONT_STACK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);
}

const FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

// Shapes carry the meaning when there is no room for a word: a spike is a
// row of teeth, a beam hangs from above, a gate is a set of bars.
function drawObstacleShape(e, colour, label) {
  if (e.type === 'obstacle' && e.shape === 'spike') {
    ctx.fillStyle = colour;
    const teeth = 3;
    const w = e.w / teeth;
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
      ctx.moveTo(e.x + i * w, e.y + e.h);
      ctx.lineTo(e.x + i * w + w / 2, e.y);
      ctx.lineTo(e.x + (i + 1) * w, e.y + e.h);
    }
    ctx.closePath();
    ctx.fill();
    if (label) drawLabel(label, e.x + e.w / 2, e.y + e.h * 0.7);
    return;
  }

  if (e.type === 'gate') {
    ctx.fillStyle = colour;
    ctx.fillRect(e.x, e.y, e.w, e.h);
    ctx.fillStyle = 'rgba(232,234,240,0.22)';
    for (let y = e.y + 6; y < e.y + e.h - 4; y += 12) ctx.fillRect(e.x - 3, y, e.w + 6, 3);
    return;
  }

  ctx.fillStyle = colour;
  ctx.fillRect(e.x, e.y, e.w, e.h);

  if (e.type === 'obstacle' && e.shape === 'beam') {
    // a lip along the bottom edge, so the slot underneath is unmistakable
    ctx.fillStyle = 'rgba(232,234,240,0.16)';
    ctx.fillRect(e.x, e.y + e.h - 4, e.w, 4);
  } else if (e.type === 'obstacle' && e.shape === 'block') {
    ctx.fillStyle = 'rgba(232,234,240,0.12)';
    ctx.fillRect(e.x, e.y, e.w, 3);
  }
  if (label) drawLabel(label, e.x + e.w / 2, e.y + e.h / 2);
}

function drawLabel(text, cx, cy) {
  ctx.fillStyle = COL.label;
  ctx.font = '600 9px ' + FONT_STACK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy);
}

// A thread from the fingertip through the chain to the character: it says
// where these orbs are going without a word of instruction.
function drawCarryThreads() {
  if (!state.carry.size) return;
  const oc = orbColour();
  const pb = playerBox();
  const px = pb.x + pb.w / 2;
  const py = pb.y + pb.h / 2;

  state.carry.forEach(function (pos, id) {
    const chain = [];
    for (let i = 0; i < state.entities.length; i++) {
      const e = state.entities[i];
      if (e.type === 'orb' && !e.dead && e.held === id) chain.push(e);
    }
    if (!chain.length) return;
    chain.sort(function (a, b) { return a.grabSeq - b.grabSeq; });

    ctx.strokeStyle = oc;
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.30;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y - ORB_LIFT);
    for (let i = 0; i < chain.length; i++) {
      ctx.lineTo(chain[i].x + chain[i].w / 2, chain[i].y + chain[i].h / 2);
    }
    ctx.stroke();

    // and a fainter one from the last orb to the character, the destination
    const last = chain[chain.length - 1];
    ctx.globalAlpha = 0.14;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(last.x + last.w / 2, last.y + last.h / 2);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  });
}

function drawEntities() {
  const oc = orbColour();
  for (let i = 0; i < state.entities.length; i++) {
    const e = state.entities[i];
    if (e.dead) continue;
    if (e.type === 'gap') continue;             // a gap is an absence of ground

    // The orb's halo is drawn either way: the colour of that glow is the
    // player's main feedback about how much their greed is paying. A carried
    // one burns brighter, so the hand reads as full.
    if (e.type === 'orb') {
      const gx = e.x + e.w / 2, gy = e.y + e.h / 2;
      const carried = e.held != null;
      ctx.globalAlpha = carried ? 0.42 : 0.20;
      ctx.fillStyle = oc;
      ctx.beginPath(); ctx.arc(gx, gy, e.w / 2 + (carried ? 7 : 6), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    const shaking = e.shake > 0;
    if (shaking) {
      ctx.save();
      ctx.translate((Math.random() - 0.5) * e.shake * 26, 0);
    }

    const spec = sprites.entities[spriteKeyFor(e)];
    if (spec) {
      // a sword enemy out of reach is dimmed rather than tinted, so the
      // moment it becomes killable reads as it lighting up
      if (e.type === 'enemySword' && !inMeleeRange(e)) ctx.globalAlpha = 0.68;
      drawEntitySprite(e, spec);
      ctx.globalAlpha = 1;
      drawEntityFlash(e);
      if (shaking) ctx.restore();
      continue;
    }

    /* ---- rectangle fallback, still a real renderer ---- */

    if (e.type === 'orb') {
      ctx.fillStyle = oc;
      ctx.beginPath(); ctx.arc(e.x + e.w / 2, e.y + e.h / 2, e.w / 2, 0, Math.PI * 2); ctx.fill();
      if (shaking) ctx.restore();
      continue;
    }

    if (e.type === 'bullet') {
      ctx.fillStyle = COL.bullet;
      ctx.fillRect(e.x, e.y, e.w, e.h);
      if (shaking) ctx.restore();
      continue;
    }

    let colour = COL.block;
    let label = '';
    if (e.type === 'target') { colour = COL.target; label = 'mark'; }
    else if (e.type === 'enemyGun') { colour = COL.enemyGun; label = 'bot'; }
    else if (e.type === 'enemySword') {
      colour = inMeleeRange(e) ? COL.enemySwordHot : COL.enemySword;
      label = 'brute';
    }
    else if (e.type === 'gate') { colour = COL.gate; label = ''; }
    else if (e.type === 'obstacle') {
      colour = e.shape === 'spike' ? COL.spike : (e.shape === 'beam' ? COL.beam : COL.block);
      label = e.shape === 'spike' ? 'spike' : (e.shape === 'beam' ? 'beam' : 'block');
    }

    drawObstacleShape(e, colour, label);
    drawEntityFlash(e);
    if (shaking) ctx.restore();
  }
}

function drawEntityFlash(e) {
  if (e.flash <= 0) return;
  ctx.globalAlpha = Math.min(1, e.flash * 3);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(e.x - 2, e.y - 2, e.w + 4, e.h + 4);
  ctx.globalAlpha = 1;
}

function drawPlayerRect() {
  const p = state.player;
  const box = playerBox();

  // the anticipation squash: identical for jump and slide, shown instantly
  let y = box.y, h = box.h;
  if (p.anticipate > 0) {
    const k = p.anticipate / (ANTICIPATION_MS / 1000);
    h = box.h * (1 - 0.16 * k);
    y = box.y + (box.h - h);
  }

  ctx.save();

  if (!state.run.alive) {
    // dead: the body drops flat, no words, no menu
    ctx.fillStyle = COL.dead;
    ctx.fillRect(box.x - 10, GROUND_Y - 14, box.w + 20, 14);
    ctx.restore();
    return;
  }

  ctx.fillStyle = p.action === 'slash' || p.action === 'shoot' ? COL.playerDim : COL.player;
  ctx.fillRect(box.x, y, box.w, h);

  // a stub arm marks the attack frames so combat reads on rectangles.
  // The player carries no label: the opening has to be wordless, and the
  // current action is legible from posture (and from the debug HUD).
  if (p.action === 'slash') ctx.fillRect(box.x + box.w, y + 8, p.whiff > 0 ? 10 : 22, 5);
  if (p.action === 'shoot') ctx.fillRect(box.x + box.w, y + 12, 14, 4);
  ctx.restore();
}

/* The only explicit instruction in the game: on unlock, time slows and a
   ghost finger performs the new gesture on the thing it applies to. */
function drawCelebration() {
  const c = state.celebration;
  if (!c) return;

  const fade = c.t > c.dur - 0.4 ? (c.dur - c.t) / 0.4 : 1;
  const strokes = c.demo === 'mash' ? 3 : (c.demo === 'flickUpAir' ? 2 : 1);

  for (let s = 0; s < strokes; s++) {
    const loop = c.demo === 'mash' ? 0.66 : 0.9;
    const t = c.t - s * (c.demo === 'mash' ? 0.13 : 0.28);
    if (t < 0) continue;
    const k = (t % loop) / loop;
    const travel = Math.min(1, k / 0.7);
    const alpha = (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3) * fade;
    if (alpha <= 0) continue;
    drawGhostStroke(c, travel, alpha);
  }
}

function ghostOrigin(c) {
  if (c.ent && !c.ent.dead) return { x: c.ent.x + c.ent.w / 2, y: c.ent.y + c.ent.h / 2 };
  const box = playerBox();
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

function ghostVector(demo) {
  if (demo === 'flickRight') return { x: 46, y: 0 };
  if (demo === 'flickUp' || demo === 'flickUpAir') return { x: 0, y: -46 };
  if (demo === 'flickDown') return { x: 0, y: 46 };
  if (demo === 'swipe') return { x: 52, y: -22 };
  return { x: 0, y: 0 };                       // tap
}

function drawGhostStroke(c, travel, alpha) {
  const o = ghostOrigin(c);
  const v = ghostVector(c.demo);
  const px = o.x + v.x * travel;
  const py = o.y + v.y * travel;

  ctx.globalAlpha = alpha;

  if (v.x === 0 && v.y === 0) {
    // a tap reads as an expanding ring
    ctx.strokeStyle = COL.player;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(o.x, o.y, 8 + travel * 22, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.strokeStyle = 'rgba(232,234,240,0.55)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(o.x, o.y);
    ctx.lineTo(px, py);
    ctx.stroke();
  }

  ctx.fillStyle = COL.player;
  ctx.beginPath();
  ctx.arc(px, py, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawPlayerSprite() {
  const m = sprites.manifest;
  const a = m.animations[sprites.anim];
  if (!a) { drawPlayerRect(); return; }

  const box = playerBox();
  const p = state.player;
  const h = (m.height || 58) * (a.scale || 1);
  const k = h / a.frameHeight;
  const w = a.frameWidth * k;
  const sx = ((a.col || 0) + sprites.frame) * a.frameWidth;
  const sy = (a.row || 0) * a.frameHeight;
  const dx = box.x + box.w / 2 - w / 2 + (a.offsetX || 0);
  const dy = p.y - h + (a.offsetY || 0);

  ctx.save();
  const night = nightAmount();
  if (night > 0.03) {
    if (!sprites.sil) {
      const c = document.createElement('canvas');
      c.width = sprites.image.width; c.height = sprites.image.height;
      const g = c.getContext('2d');
      g.drawImage(sprites.image, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = '#dce6f7';
      g.fillRect(0, 0, c.width, c.height);
      sprites.sil = c;
    }
    const o = 1.2;
    ctx.globalAlpha = 0.02 + night * 0.05;
    for (let i = 0; i < RIM_OFFSETS.length; i++) {
      ctx.drawImage(sprites.sil, sx, sy, a.frameWidth, a.frameHeight,
                    dx + RIM_OFFSETS[i][0] * o, dy + RIM_OFFSETS[i][1] * o, w, h);
    }
    ctx.globalAlpha = 1;
  }

  ctx.drawImage(sprites.image, sx, sy, a.frameWidth, a.frameHeight, dx, dy, w, h);
  ctx.restore();
}

function drawPointerTrails() {
  if (!state.pointers.size) return;
  ctx.strokeStyle = 'rgba(232,234,240,0.35)';
  ctx.lineWidth = 2;
  state.pointers.forEach(function (rec) {
    ctx.beginPath();
    ctx.arc(rec.wx, rec.wy, 14, 0, Math.PI * 2);
    ctx.stroke();
  });
}


/* ============================= 8. debug HUD ========================== */

const dbgBtn = document.getElementById('dbgBtn');
const dbgPanel = document.getElementById('dbg');
const dbgStats = document.getElementById('dbgStats');
const dbgLog = document.getElementById('dbgLog');

let dbgPressTimer = null;

dbgBtn.addEventListener('pointerdown', function (e) {
  e.preventDefault();
  dbgPressTimer = setTimeout(function () {
    dbgPressTimer = null;
    clearProfile();
  }, 700);
});

dbgBtn.addEventListener('pointerup', function (e) {
  e.preventDefault();
  if (dbgPressTimer === null) return;   // long press already fired
  clearTimeout(dbgPressTimer);
  dbgPressTimer = null;
  state.debug.on = !state.debug.on;
  dbgPanel.hidden = !state.debug.on;
  dbgBtn.classList.toggle('on', state.debug.on);
});

dbgBtn.addEventListener('pointercancel', function () {
  clearTimeout(dbgPressTimer);
  dbgPressTimer = null;
});

function clearProfile() {
  try { localStorage.removeItem('gesture-runner:meta'); } catch (err) { /* private mode */ }
  dbgBtn.animate(
    [{ background: '#3ddc84' }, { background: 'rgba(20,24,32,0.5)' }],
    { duration: 500 }
  );
  location.reload();
}

let hudAccum = 0;

function updateHUD(dt) {
  hudAccum += dt;
  if (!state.debug.on || hudAccum < 0.1) return;
  hudAccum = 0;

  const d = state.debug;
  const p = state.player;
  const avgEmit = d.emitN ? Math.round(d.emitSum / d.emitN) : 0;
  const avgResp = d.respN ? Math.round(d.respSum / d.respN) : 0;

  dbgStats.innerHTML =
    'xp <b>' + state.meta.totalXP + '</b>   next <b>' + nextThresholdLabel() + '</b>\n' +
    'state <b>' + p.speedState + '</b>  action <b>' + p.action + '</b>  orb <b>' + orbValue() + '</b>\n' +
    'pointers <b>' + state.pointers.size + '</b>   fps <b>' + fpsDisplay + '</b>\n' +
    'resp <b>' + avgResp + 'ms</b>  emit <b>' + avgEmit + 'ms</b> (max ' + Math.round(d.worstEmit) + ')\n' +
    'unknown <span class="' + (d.unknown ? 'warn' : '') + '">' + d.unknown + '</span>';

  let html = '';
  for (let i = 0; i < d.log.length; i++) {
    const g = d.log[i];
    html += '<li>' + g.kind + ' &times; ' + g.gesture +
      ' <span class="' + (g.unknown ? 'unk' : 'act') + '">&rarr; ' + g.action + '</span>' +
      ' <span class="lat">' + g.lat + 'ms' + (g.resp == null ? '' : '/' + g.resp) + '</span></li>';
  }
  dbgLog.innerHTML = html;
}

function nextThresholdLabel() {
  const n = nextUnlock();
  return n ? n.id + ' @' + n.xp : 'all';
}


/* ============================== 9. main loop ========================= */

let acc = 0;
let lastTime = 0;
let running = true;
let fpsDisplay = 0;
let fpsFrames = 0;
let fpsClock = 0;

function frame(now) {
  requestAnimationFrame(frame);
  if (!running) { lastTime = now; return; }

  if (!lastTime) lastTime = now;
  let elapsed = (now - lastTime) / 1000;
  lastTime = now;
  if (elapsed > MAX_FRAME) elapsed = MAX_FRAME;

  // measure the anticipation frame: how long from touchdown to first paint
  state.pointers.forEach(function (rec) {
    if (rec.resp == null) {
      // the rAF timestamp is the frame start, which can precede the event
      rec.resp = Math.max(0, now - rec.t0);
      state.debug.respSum += rec.resp;
      state.debug.respN++;
    }
  });

  acc += elapsed;
  let steps = 0;
  while (acc >= DT && steps < 8) { update(DT); acc -= DT; steps++; }
  if (steps === 8) acc = 0;

  render(now);
  updateHUD(elapsed);

  fpsFrames++;
  fpsClock += elapsed;
  if (fpsClock >= 0.5) {
    fpsDisplay = Math.round(fpsFrames / fpsClock);
    fpsFrames = 0;
    fpsClock = 0;
  }
}

document.addEventListener('visibilitychange', function () {
  running = !document.hidden;
  if (running) { lastTime = 0; acc = 0; }
});

function startRun() {
  state.entities.length = 0;
  state.actionQueue.length = 0;
  state.particles.length = 0;
  state.celebration = null;
  state.carry.clear();
  state.opening = null;
  state.breatherUntil = 0;
  state.run = { distance: 0, xpThisRun: 0, alive: true, time: 0 };

  const p = state.player;
  p.x = 120; p.y = GROUND_Y; p.vy = 0;
  p.speedState = 'still'; p.speed = 0;
  p.action = 'idle'; p.actionTimer = 0;
  p.grounded = true; p.crouch = false; p.anticipate = 0; p.airJumpsLeft = 0;
  p.whiff = 0; p.bumped = 0; p.deathTimer = 0; p.cause = ''; p.crouchUntilX = 0;

  state.camera.x = p.x - playerScreenX();
  world.nextX = state.camera.x + state.view.worldW + 60;
  world.lastChunk = '';
  world.restNext = false;
  world.lastLeftX = -9999;
  world.lastRightX = -9999;

  if (freshProfile()) startOpening();
  else updateSpawner();
}

// Running inside the Capacitor shell rather than a browser tab. The game
// itself does not change; the class is there for the few CSS differences
// that only matter in the app.
function isCapacitorNative() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

function init() {
  if (isCapacitorNative()) document.body.classList.add('capacitor');
  resize();
  buildSkyDecor();
  loadMeta();
  loadSprites();
  startRun();
  requestAnimationFrame(frame);
}

init();
