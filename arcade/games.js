/* Doo Doo Town — mini-games.
   Every game: { id, name, tag, how[], ctl, init(s), update(s, dt, I), draw(s, I) }.
   update() sets s.end = { win, stars, line } when the game is over.
   Logic never touches the DOM, so the same file runs in the browser and in the Node bot tests. */

var g = null;                       // canvas 2D context (set by the engine)
var IMG = {};                       // loaded sprite sheets
var W = 480, H = 270;

// ---------- tiny drawing kit ----------
function R(x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
function C(x, y, r, c) { g.fillStyle = c; g.beginPath(); g.arc(x, y, Math.max(0.5, r), 0, 7); g.fill(); }
function T(s, x, y, c, sz, al) {
  g.font = Math.max(5, sz || 8) + 'px "Press Start 2P", monospace'; g.textAlign = al || 'left'; g.textBaseline = 'middle';
  g.fillStyle = '#000'; g.fillText(s, x + 1, y + 1); g.fillStyle = c || '#fff'; g.fillText(s, x, y); g.textAlign = 'left';
}
function BAR(x, y, w, h, f, c, label) {
  R(x - 1, y - 1, w + 2, h + 2, '#000'); R(x, y, w, h, '#2c3326'); R(x, y, w * Math.max(0, Math.min(1, f)), h, c);
  if (label) T(label, x, y - 6, '#fff', 6);
}
function SPR(who, frame, cx, feetY, flip, sc) {       // crew sheets: 24x40 frames. 0 front, 6 right, 7 back, 8 left. sc: scale to match a drawn room
  sc = sc || 1; const w = 24 * sc, h = 40 * sc;
  const im = IMG[who]; if (!im) { R(cx - 8 * sc, feetY - 36 * sc, 16 * sc, 36 * sc, who === 'rod' ? '#22325e' : '#2a3d78'); return; }
  let src = im, fi = frame; if (frame >= 9) { src = IMG[who + '_more'] || im; fi = src === im ? 0 : frame - 9; }   // 9-17: the extra poses (walk, buckets, kneel, gag, sludge, thumbs up)
  const fw = src.width / 9, fh = src.height; g.imageSmoothingEnabled = fw > 24;   // hi-res sheets get smoothed down, old 24x40 ones stay crisp
  if (flip) { g.save(); g.translate(Math.round(cx), 0); g.scale(-1, 1); g.drawImage(src, fi * fw, 0, fw, fh, Math.round(-w / 2), Math.round(feetY - h), w, h); g.restore(); }
  else g.drawImage(src, fi * fw, 0, fw, fh, Math.round(cx - w / 2), Math.round(feetY - h), w, h);
  g.imageSmoothingEnabled = false;
}
const MORE = (who, f, old) => IMG[who + '_more'] ? f : old;   // new pose if this crew member has the extra sheet, else the closest old frame
const WALK = (who, t, old) => MORE(who, 9 + Math.floor(t * 8) % 4, old);   // 4-step walk cycle, facing right (flip for left)
function HUD(s, title, timeLeft) {
  R(0, 0, W, 16, 'rgba(16,21,31,.92)');
  T(title, 6, 8, '#f7c418', 8);
  if (timeLeft != null) T('TIME ' + Math.max(0, timeLeft).toFixed(1), W - 6, 8, timeLeft < 5 ? '#e9665a' : '#fff', 8, 'right');
}
function PANTS(s, x, y) {                             // pants = lives
  for (let i = 0; i < s.pantsMax; i++) {
    const c = i < s.pants ? '#7f8590' : '#3a3c40';
    R(x + i * 14, y, 10, 5, c); R(x + i * 14, y + 5, 4, 7, c); R(x + i * 14 + 6, y + 5, 4, 7, c);
  }
}
// ---------- drawn art (assets/mg): use it when it's loaded, fall back to the old drawing when it isn't ----------
const MG = n => IMG['mg_' + n];
function SPI(n, cx, by, sc, flip, alpha) {   // sprite n, centered at cx, standing on by
  const im = MG(n); if (!im) return false; sc = sc || 1; const w = im.width * sc, h = im.height * sc;
  if (alpha != null) g.globalAlpha = alpha;
  if (flip) { g.save(); g.translate(Math.round(cx), 0); g.scale(-1, 1); g.drawImage(im, Math.round(-w / 2), Math.round(by - h), Math.round(w), Math.round(h)); g.restore(); }
  else g.drawImage(im, Math.round(cx - w / 2), Math.round(by - h), Math.round(w), Math.round(h));
  if (alpha != null) g.globalAlpha = 1; return true;
}
const SPC = (n, cx, cy, sc, flip, alpha) => { const im = MG(n); return im ? SPI(n, cx, cy + im.height * (sc || 1) / 2, sc, flip, alpha) : false; };   // centered on (cx, cy)
const BGI = n => { const im = MG(n); if (!im) return false; g.drawImage(im, 0, 0, W, H); return true; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
function mover(s, I, dt, speed, x0, x1, y0, y1) {     // 2D movement from keys or a held pointer
  let dx = (I.R ? 1 : 0) - (I.L ? 1 : 0), dy = (I.D ? 1 : 0) - (I.U ? 1 : 0);
  if (I.ptr.down) { const vx = I.ptr.x - s.px, vy = I.ptr.y - s.py, d = Math.hypot(vx, vy); if (d > 3) { dx = vx / d; dy = vy / d; } else { dx = dy = 0; } }
  const m = Math.hypot(dx, dy) || 1;
  s.px = clamp(s.px + dx / m * speed * dt, x0, x1);
  if (y0 != null) s.py = clamp(s.py + dy / m * speed * dt, y0, y1);
  return dx;
}
function mover1D(s, I, dt, speed, x0, x1) {          // left/right only; a held pointer steers toward the finger
  let dx = (I.R ? 1 : 0) - (I.L ? 1 : 0);
  if (I.ptr.down) { const v = I.ptr.x - s.px; dx = Math.abs(v) < 3 ? 0 : Math.sign(v); }
  s.px = clamp(s.px + dx * speed * dt, x0, x1); return dx;
}
function SFX(n, o) { if (typeof DDTSfx !== 'undefined') DDTSfx.play(n, o); }   // recorded sound effects (browser only)
function stars3(cond3, cond2) { return cond3 ? 3 : cond2 ? 2 : 1; }

// ---------- who you play: the lead you picked for the day ----------
// spd = how fast he moves · steady = timing windows and balance · grip = how much strain (tension, pressure, smell) he can take
const HEROES = {
  rod:  { name: 'ROD',  spd: 0.85, steady: 1.3, grip: 1.25, blurb: 'Slower on his feet, but steady hands and a strong stomach. Wider timing windows.' },
  matt: { name: 'MATT', spd: 1.25, steady: 0.8, grip: 0.85, blurb: 'Fast and nimble, but twitchy. Quicker on his feet, tighter timing.' },
};
const HERO = s => s.H || HEROES.matt;
// ---------- juice: particles + floating text, shared by every game ----------
function PUFF(s, x, y, col, n, sp, life) { s.fx = s.fx || []; for (let i = 0; i < (n || 8); i++) { const a = (s.rnd ? s.rnd() : Math.random()) * 6.283, v = (sp || 60) * (0.4 + Math.random() * 0.8); s.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, l: life || 0.6, L: life || 0.6, c: col || '#fff' }); } }
function POP(s, x, y, text, col) { s.fx = s.fx || []; s.fx.push({ x, y, vx: 0, vy: -30, l: 0.9, L: 0.9, text, c: col || '#f7c418' }); }
function FX(s, dt) { if (!s.fx) return; for (const p of s.fx) { p.x += p.vx * dt; p.y += p.vy * dt; if (!p.text) p.vy += 140 * dt; p.l -= dt; } s.fx = s.fx.filter(p => p.l > 0); }
function DRAWFX(s) { if (!s.fx) return; for (const p of s.fx) { g.globalAlpha = Math.max(0, p.l / p.L); if (p.text) T(p.text, p.x, p.y, p.c, 7, 'center'); else R(p.x - 1, p.y - 1, 3, 3, p.c); } g.globalAlpha = 1; }

const GAMES = [];

// =====================================================================
// 1. SPLASH DODGE — globs arc out of the cleanout; a shadow shows exactly where each one lands.
GAMES.push({
  id: 'dodge', name: 'SPLASH DODGE', tag: 'The pot throw · over the open septic tank',
  how: ['You are at the open septic tank. The customer is on the porch with a pot.', 'He is aiming for the tank. He is not good at it.', 'A shadow shows where each splash will land. Get out of it.', 'The big one is the whole pot. Survive 20 seconds.'],
  ctl: '◀ ▶ MOVE',
  act: null, dpad: 'lr',
  init(s) { s.DUR = 20; s.px = 240; s.globs = []; s.splats = []; s.next = 0.8; s.nextBig = 5; s.pantsMax = s.pants = [4, 3, 3][s.diff]; s.inv = 0; s.hits = 0; s.cx = 240; s.cv = 60; s.wind = 0; },
  update(s, dt, I) {
    s.t += dt;
    mover1D(s, I, dt, 190 * HERO(s).spd, 16, W - 16);
    const ramp = s.t / s.DUR;
    s.next -= dt; s.nextBig -= dt;
    const launch = (big) => {
      const fly = big ? 1.25 : lerp(1.05, 0.8, ramp) / Math.sqrt(s.k);
      const r = big ? 20 : 7 + s.rnd() * 5;
      let tx, tries = 0;
      do {
        tx = (big || s.rnd() < 0.55) ? s.px + (s.rnd() - 0.5) * 50 : 20 + s.rnd() * (W - 40);
        tx = clamp(tx, 18, W - 18); tries++;
        // fairness: two globs landing at nearly the same moment may not leave a gap narrower than the player
      } while (tries < 8 && s.globs.some(o => Math.abs((o.t0 + o.fly) - (s.t + fly)) < 0.4 && Math.abs(o.tx - tx) > (o.r + r) && Math.abs(o.tx - tx) < o.r + r + 40));
      s.globs.push({ t0: s.t, fly, tx, sx: s.cx, r, big }); s.wind = 0.3; if (big) SFX('splash');
    };
    if (s.next <= 0 && s.t < s.DUR - 1) {   // he flings the pot: a volley of 1-3 splashes, more as he warms up
      const n = Math.min(3, 1 + Math.floor(s.rnd() * (1.3 + ramp * 1.6 + s.diff * 0.4)));
      for (let i = 0; i < n; i++) launch(false);
      s.next = lerp(1.0, 0.6, ramp) / s.k * (0.75 + s.rnd() * 0.5) * (0.7 + 0.3 * n); }
    if (s.nextBig <= 0 && s.t < s.DUR - 1.5) { launch(true); s.nextBig = 6 + s.rnd() * 2; }
    s.inv = Math.max(0, s.inv - dt); s.wind = Math.max(0, s.wind - dt);
    s.cx += s.cv * dt;   // he paces the porch (and changes his mind now and then)
    if (s.cx < 120) { s.cx = 120; s.cv = Math.abs(s.cv); } else if (s.cx > 360) { s.cx = 360; s.cv = -Math.abs(s.cv); } else if (s.rnd() < dt * 0.4) s.cv = -s.cv;
    for (const o of s.globs) {
      if (!o.landed && s.t >= o.t0 + o.fly) {
        o.landed = true; s.splats.push({ x: o.tx, r: o.r, t: s.t });
        if (s.inv <= 0 && Math.abs(o.tx - s.px) < o.r + 7) { s.pants--; s.hits++; s.inv = 0.6; s.shake = 0.3; }
      }
    }
    s.globs = s.globs.filter(o => !o.landed);
    s.splats = s.splats.filter(p => s.t - p.t < 6);
    if (s.pants <= 0) s.end = { win: false, stars: 0, line: 'Out of clean pants.' };
    else if (s.t >= s.DUR) s.end = { win: true, stars: stars3(s.hits === 0, s.hits <= 1), line: s.hits ? `Splashed ${s.hits}x. Still standing.` : 'Not a drop on you!' };
  },
  draw(s) {
    const yard = BGI('bg_yard'), dy = yard ? 62 : 0;
    if (!yard) { R(0, 0, W, H, '#a9c4d9');
    R(0, 18, W, 52, '#d9cdb4'); for (let x = 0; x < W; x += 40) R(x, 18, 2, 52, '#c4b79c');   // the house
    R(100, 62, 280, 10, '#7a5a3a'); R(100, 72, 280, 3, '#5a3e26');                                  // porch
    R(226, 24, 28, 38, '#6b3a2a'); }                                                                 // door
    g.save(); g.translate(0, dy);
    // the customer, winding up with a cooking pot
    const cx = s.cx, arm = s.wind > 0 ? -10 : 2;
    R(cx - 5, 40, 10, 14, '#3a6ea5'); R(cx - 4, 54, 3, 8, '#333'); R(cx + 1, 54, 3, 8, '#333'); C(cx, 35, 5, '#e8b48a'); R(cx - 5, 29, 10, 3, '#5a3e26');
    R(cx + 5, 42 + arm, 8, 3, '#e8b48a'); R(cx + 11, 38 + arm, 9, 6, '#9aa0a6'); R(cx + 11, 37 + arm, 9, 2, '#6b4423');
    g.restore();
    if (!yard) R(0, 75, W, 195, '#f4f7fa'); if (!yard) for (let i = 0; i < 40; i++) R((i * 97) % W, 80 + (i * 53) % 140, 2, 2, '#e3eaf0');   // snowy yard
    R(206, 214, 68, 12, '#8a8f94'); R(212, 216, 56, 8, '#3a2a14'); R(212, 216, 56, 3, '#5a4420');   // open septic tank
    for (const p of s.splats) { const age = s.t - p.t, fr = age < 0.12 ? 1 : age < 0.25 ? 2 : 3; if (SPI('splat_' + fr, p.x, 229, p.r / (fr === 3 ? 12 : 10), false, Math.max(0, 1 - age / 6))) continue; g.globalAlpha = Math.max(0, 1 - age / 6); R(p.x - p.r * 1.6, 224, p.r * 3.2, 4, '#8a6a1e'); R(p.x - p.r, 223, p.r * 2, 2, '#6b4423'); g.globalAlpha = 1; }
    for (const o of s.globs) {
      const f = (s.t - o.t0) / o.fly;
      g.globalAlpha = 0.25 + 0.55 * f; R(o.tx - o.r - 4, 225, (o.r + 4) * 2, 4, '#1a0f05'); g.globalAlpha = 1;
      R(o.tx - 1, 229, 2, 2, '#e9665a');
      const x = lerp(o.sx + 14, o.tx, f), y = lerp(40 + dy, 222, f) - Math.sin(f * Math.PI) * 60;
      if (!SPC('glob_' + (Math.floor(f * 8) % 4), x, y, o.r / 14, o.tx < o.sx)) { C(x, y, o.r * 0.8, '#8a6a1e'); C(x - o.r * 0.25, y - o.r * 0.25, o.r * 0.3, '#c9a640'); }
    }
    { const hw = s.hero || 'matt', hit = s.inv > 0 && IMG[hw + '_more']; if (hit || !(s.inv > 0 && Math.floor(s.t * 12) % 2)) SPR(hw, hit ? 16 : 0, s.px, 224); }
    HUD(s, 'SPLASH DODGE', s.DUR - s.t); PANTS(s, 6, 22);
  },
});

// =====================================================================
// 2. CLEANOUT BLOWOUT — a jet sweeps the room like a sprinkler. It sputters off (and warns before reversing).
GAMES.push({
  id: 'sprinkler', name: 'CLEANOUT BLOWOUT', tag: 'Shoving the cap back in · the 360° gusher',
  how: ['You shoved the cap back in. Now it sprays in a circle.', 'Stay out of the jet. It sweeps around the room.', 'It sputters off for a moment now and then: that is your chance to cross it.', 'Halfway through, the cap cracks and it sprays BOTH ways.', 'It shudders right before it reverses. Corn included.', 'Survive 20 seconds.'],
  ctl: '◀ ▶ ▲ ▼ MOVE (OR DRAG)',
  act: null,
  init(s) { s.DUR = 20; s.jets = 1; s.px = 240; s.py = 230; s.a = -Math.PI / 2; s.dir = 1; s.on = true; s.phase = 1.8; s.warn = 0; s.rev = 4; s.pantsMax = s.pants = [4, 3, 3][s.diff]; s.inv = 0; s.hits = 0; s.corn = []; },
  update(s, dt, I) {
    s.t += dt;
    mover(s, I, dt, 125 * HERO(s).spd, 24, W - 24, 30, H - 14);
    const cx = 240, cy = 140, ramp = s.t / s.DUR;
    const w = (1.0 + 0.5 * ramp) * s.k;                        // angular speed (rad/s)
    s.phase -= dt;
    if (s.phase <= 0) { s.on = !s.on; s.phase = s.on ? 1.3 + s.rnd() * 1.0 : 0.65 / Math.sqrt(s.k); }
    s.rev -= dt;
    if (s.rev <= 0.6 && !s.warn) s.warn = 0.6;                 // shudder warning
    if (s.warn > 0) { s.warn -= dt; if (s.warn <= 0) { s.dir *= -1; s.rev = 3 + s.rnd() * 3; s.warn = 0; } }
    if (s.on && s.warn <= 0) s.a += w * s.dir * dt;
    if (s.jets === 1 && s.t > [12, 9, 7][s.diff]) { s.jets = 2; s.note = 1.5; }
    s.note = Math.max(0, (s.note || 0) - dt);
    // keep the player out of the splash zone right at the cleanout
    const dx = s.px - cx, dy = s.py - cy, d = Math.hypot(dx, dy);
    if (d < 26) { s.px = cx + dx / (d || 1) * 26; s.py = cy + dy / (d || 1) * 26; }
    s.inv = Math.max(0, s.inv - dt);
    if (s.on) {
      for (let j = 0; j < s.jets; j++) {
        const aa = s.a + j * Math.PI, ux = Math.cos(aa), uy = Math.sin(aa), along = dx * ux + dy * uy, perp = Math.abs(-dx * uy + dy * ux);
        if (s.inv <= 0 && along > 10 && perp < 9 + 6) { s.pants--; s.hits++; s.inv = 1.0; s.shake = 0.3; s.px += ux * 18; s.py += uy * 18; }
        if (s.rnd() < 0.5) s.corn.push({ x: cx, y: cy, vx: ux * 260 + (s.rnd() - .5) * 40, vy: uy * 260 + (s.rnd() - .5) * 40, l: 0.6 });
      }
    }
    for (const c of s.corn) { c.x += c.vx * dt; c.y += c.vy * dt; c.l -= dt; }
    s.corn = s.corn.filter(c => c.l > 0);
    s.px = clamp(s.px, 24, W - 24); s.py = clamp(s.py, 30, H - 14);
    if (s.pants <= 0) s.end = { win: false, stars: 0, line: 'Corn on your arm. Corn everywhere.' };
    else if (s.t >= s.DUR) s.end = { win: true, stars: stars3(s.hits === 0, s.hits <= 1), line: s.hits ? `Hit ${s.hits}x. You live to tell Rod.` : 'Untouched. Rod is impressed.' };
  },
  draw(s) {
    R(0, 0, W, H, '#8a8f94');
    for (let y = 16; y < H; y += 20) for (let x = 0; x < W; x += 20) R(x + 1, y + 1, 18, 18, '#949aa0');
    const cx = 240, cy = 140;
    C(cx, cy, 24, 'rgba(107,68,35,.35)');
    for (let j = 0; j < s.jets; j++) {
      const ux = Math.cos(s.a + j * Math.PI), uy = Math.sin(s.a + j * Math.PI);
      if (s.on) {
        g.strokeStyle = 'rgba(122,74,30,.9)'; g.lineWidth = 14; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + ux * 600, cy + uy * 600); g.stroke();
        g.strokeStyle = 'rgba(160,106,53,.9)'; g.lineWidth = 5; g.stroke();
      } else { g.strokeStyle = 'rgba(122,74,30,.25)'; g.lineWidth = 2; g.setLineDash([4, 6]); g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + ux * 600, cy + uy * 600); g.stroke(); g.setLineDash([]); }
    }
    if (s.note > 0) T('IT SPLIT! TWO JETS!', 240, 40, '#e9665a', 8, 'center');
    for (const c of s.corn) if (!SPC('poopcorn', c.x, c.y, 0.2)) R(c.x - 1, c.y - 1, 3, 3, '#f2c12e');
    const sh = s.warn > 0 ? (Math.random() - .5) * 4 : 0;
    if (!SPC('cleanout', cx + sh, cy, 0.6)) { C(cx + sh, cy, 10, '#d6d6d6'); C(cx + sh, cy, 6, '#5b3a1c'); }
    if (s.warn > 0) T('!', cx, cy - 22, '#e9665a', 12, 'center');
    if (!(s.inv > 0 && Math.floor(s.t * 12) % 2)) SPR(s.hero || 'matt', 7, s.px, s.py + 12);
    HUD(s, 'CLEANOUT BLOWOUT', s.DUR - s.t); PANTS(s, 6, 22);
    if (!s.on) T('SPUTTERING - CROSS NOW!', 240, 252, '#7bd65b', 8, 'center');
  },
});

// =====================================================================
// 3. SNAKE THE LINE — steer the cable head up a winding pipe. Spin through debris, don't kink on the walls, chew the clog.
GAMES.push({
  id: 'cable', name: 'SNAKE THE LINE', tag: 'Wipes · toys · roots · grease',
  how: ['You steer the cable head up the pipe. It feeds on its own.', 'Scraping the pipe wall KINKS the cable. Three kinks and you are done.', 'Hold SPACE to SPIN the cutter: spin THROUGH wipes and roots, or they snag you.', 'At the end, spin into the clog until it breaks up.'],
  ctl: '◀ ▶ STEER  ·  HOLD SPACE = SPIN',
  act: 'SPIN', dpad: 'lr',
  init(s) {
    s.LEN = [1700, 2100, 2500][s.diff]; s.d = 0; s.x = 240; s.kink = 0; s.KMAX = [4, 3, 3][s.diff]; s.snag = 0; s.wall = 0; s.chew = 0; s.CHEW = 100; s.spinT = 0;
    s.ph = [s.rnd() * 6, s.rnd() * 6, s.rnd() * 6];
    s.junk = []; for (let d = 260; d < s.LEN - 150; d += 110 + s.rnd() * 120) s.junk.push({ d, off: (s.rnd() - .5) * 30, kind: ['wipe', 'root', 'toy', 'wipe'][Math.floor(s.rnd() * 4)], gone: false });
    s.TIME = 40; s.x = this.cx(s, 0);   // start in the middle of the pipe
  },
  cx(s, d) { return 240 + 70 * Math.sin(d / 260 + s.ph[0]) + 24 * Math.sin(d / 140 + s.ph[1]) * Math.min(1, d / 400); },
  wid(s, d) { return 38 - 6 * s.diff + 8 * Math.sin(d / 180 + s.ph[2]); },
  update(s, dt, I) {
    s.t += dt; FX(s, dt);
    const H = HERO(s), spin = I.A || (I.ptr.down && Math.abs(I.ptr.x - s.x) < 40), atClog = s.d >= s.LEN;
    s.spinT += spin ? dt * 18 : dt * 3;
    if (!atClog) {
      // steering: keys or drag toward your finger
      let st = (I.R ? 1 : 0) - (I.L ? 1 : 0); if (I.ptr.down && Math.abs(I.ptr.x - s.x) >= 40) st = Math.sign(I.ptr.x - s.x);
      s.x += st * 150 * H.spd * dt;
      const feed = s.snag > 0 ? 0 : (spin ? 70 : 110) * (0.9 + 0.1 * s.k);
      s.snag = Math.max(0, s.snag - dt); s.d = Math.min(s.LEN, s.d + feed * dt);
      const c = this.cx(s, s.d), w = this.wid(s, s.d);
      // the walls: scraping builds up a kink, and a kink bounces you back toward the middle (one kink per hit, never a chain)
      s.wallCool = Math.max(0, (s.wallCool || 0) - dt);
      if (Math.abs(s.x - c) > w) { const side = Math.sign(s.x - c); s.x = c + side * w;
        if (s.wallCool <= 0) { s.wall += dt * 1.6 / H.steady; if (s.wall >= 1) { s.wall = 0; s.kink++; s.wallCool = 1.2; s.x = c + side * w * 0.4; s.shake = 0.35; PUFF(s, s.x, 190, '#bbb', 10); POP(s, s.x, 170, 'KINK!', '#e9665a'); SFX('drill_stop'); } } }
      else s.wall = Math.max(0, s.wall - dt * 1.2);
      for (const j of s.junk) if (!j.gone && Math.abs(j.d - s.d) < 10 && Math.abs(s.x - (this.cx(s, j.d) + j.off)) < 16) {
        j.gone = true;
        if (spin) { PUFF(s, s.x, 170, j.kind === 'root' ? '#8a6a3e' : j.kind === 'toy' ? '#e9665a' : '#f4f4f2', 14, 90); POP(s, s.x, 150, 'SHREDDED!', '#7bd65b'); SFX('drill_burst', { vol: 0.5 }); }
        else { s.snag = 0.9; s.shake = 0.25; POP(s, s.x, 150, 'SNAGGED! SPIN!', '#e9665a'); SFX('drill_stop'); }
      }
    } else {
      if (spin) { s.chew += dt * 22 * H.grip; if (s.rnd() < 0.5) PUFF(s, 240 + (s.rnd() - .5) * 40, 110, s.room === 'kitchen' ? '#1c1a17' : '#7a4a1e', 2, 80); }
      if (s.chew >= s.CHEW) { SFX('drain'); s.end = { win: true, stars: stars3(s.kink === 0 && s.t < 28, s.kink <= 1), line: s.kink ? `Line's open. ${s.kink} kink${s.kink > 1 ? 's' : ''} in the cable.` : 'Clean run, no kinks. Line is open.' }; }
    }
    if (s.kink >= s.KMAX) s.end = { win: false, stars: 0, line: 'Kinked the cable three times. Pull it and start over.' };
    else if (s.t >= s.TIME && !s.end) s.end = { win: false, stars: 0, line: 'Ran out of time. The clog won this round.' };
  },
  draw(s) {
    const greasy = s.room === 'kitchen';
    R(0, 0, W, H, '#1a1612');
    // screen y=190 is the cable head; rows above it are further up the pipe (this has to match the wall check exactly)
    for (let y = 16; y < H; y += 3) {
      const d = s.d + (190 - y), c = this.cx(s, d), w = this.wid(s, d);
      if (d > s.LEN + 30) { R(0, y, W, 3, '#14110c'); continue; }
      R(c - w - 10, y, 10, 3, '#6e7177'); R(c + w, y, 10, 3, '#5d6168'); R(c - w, y, w * 2, 3, greasy ? '#26231f' : '#3a332a');
      if (Math.floor(d / 60) % 2 === 0) R(c - w - 10, y, 3, 3, '#888');   // pipe joints
    }
    for (let k = 1; k <= 5; k++) { const d = s.d + k * 26, y = 190 - k * 26; if (d > s.LEN) break; const c = this.cx(s, d), nx = this.cx(s, d + 13) - c;
      g.globalAlpha = 0.5 - k * 0.07; R(c - 4 + nx * 0.5, y - 2, 3, 3, '#f7c418'); R(c + 1 + nx * 0.5, y - 2, 3, 3, '#f7c418'); R(c - 1 + nx, y - 5, 3, 3, '#f7c418'); g.globalAlpha = 1; }   // ^ arrows show where the pipe goes
    // the clog waiting at the end
    const cy = 190 - (s.LEN - s.d) - 10;
    if (cy > -40) { const left = 1 - s.chew / s.CHEW, c = this.cx(s, s.LEN);
      for (let i = 0; i < 18 * left + 2; i++) C(c - 24 + (i * 37) % 48, cy - 10 + (i * 13) % 26, 7, greasy ? (i % 2 ? '#1c1a17' : '#2e2a24') : (i % 2 ? '#7a4a1e' : '#5a3a1c')); }
    for (const j of s.junk) if (!j.gone) { const y = 190 - (j.d - s.d), x = this.cx(s, j.d) + j.off; if (y < 10 || y > H) continue;
      if (SPC(j.kind === 'wipe' ? 'wipes' : j.kind === 'root' ? 'roots' : 'toycar', x, y, 0.6)) continue;
      if (j.kind === 'wipe') { R(x - 8, y - 6, 16, 12, '#f4f4f2'); R(x - 6, y - 4, 12, 2, '#d9d4c8'); }
      else if (j.kind === 'root') { for (let i = 0; i < 5; i++) R(x - 10 + i * 4, y - 6 + (i % 2) * 4, 2, 10, '#8a6a3e'); }
      else { R(x - 7, y - 4, 14, 8, '#c0392b'); C(x - 4, y + 5, 2.5, '#222'); C(x + 4, y + 5, 2.5, '#222'); } }
    // the cable behind the head, and the spinning cutter
    g.strokeStyle = '#9a9a9a'; g.lineWidth = 3; g.beginPath(); g.moveTo(s.x, 190);
    for (let y = 196; y < H + 4; y += 6) g.lineTo(this.cx(s, s.d - (y - 190)) + (s.x - this.cx(s, s.d)) * Math.max(0, 1 - (y - 190) / 60), y); g.stroke();
    const sp = s.spinT; for (let i = 0; i < 4; i++) { const a = sp + i * 1.57; R(s.x + Math.cos(a) * 7 - 2, 186 + Math.sin(a) * 4 - 2, 4, 4, '#ddd'); }
    C(s.x, 190, 4, s.snag > 0 ? '#e9665a' : '#bbb');
    DRAWFX(s);
    HUD(s, 'SNAKE THE LINE', s.TIME - s.t);
    BAR(6, 30, 110, 7, s.d / s.LEN, '#7bd65b', 'TO THE CLOG');
    for (let i = 0; i < s.KMAX; i++) R(130 + i * 12, 26, 9, 9, i < s.kink ? '#e9665a' : '#3a3f4a'); T('KINKS', 130, 20, '#fff', 5);
    if (s.wall > 0.2) T('SCRAPING!', s.x, 205, '#f7c418', 6, 'center');
    if (s.d >= s.LEN) { BAR(140, 240, 200, 10, s.chew / s.CHEW, '#f7c418', 'BREAK UP THE CLOG: HOLD SPACE'); }
  },
});

// =====================================================================
// 4. FIND THE SEPTIC — numbers are the exact step-distance to the target.
GAMES.push({
  id: 'septic', name: 'FIND THE SEPTIC', tag: 'Two feet of snow · "no idea where it is"',
  how: ['Like Battleship: tap the yard to push your probe rod in.', 'MISS = nothing. "!" = you scraped concrete or gravel nearby.', 'Find the TANK first, then the LEACH FIELD.', 'Own the inspection camera? It shows which way the pipe leaves the house.'],
  ctl: 'TAP A SQUARE  ·  OR ARROWS + SPACE',
  pad: false, phone: 'tap a square to probe.',
  init(s) {
    s.C = 16; s.Rw = 9; s.Z = 24; s.ox = 48; s.oy = 18; s.HH = 18;   // big yard, house strip above
    s.cam = !!s.camera;
    s.probes = s.left = [26, 22, 20][s.diff];
    const wide = s.rnd() < 0.5, tw = wide ? 3 : 2, th = wide ? 2 : 3;
    s.tc = 1 + Math.floor(s.rnd() * (s.C - tw - 2)); s.tr = Math.floor(s.rnd() * 3);
    s.tank = new Set(); for (let c = s.tc; c < s.tc + tw; c++) for (let r = s.tr; r < s.tr + th; r++) s.tank.add(`${c},${r}`);
    s.pipeC = s.tc + Math.floor(tw / 2);
    const lr = s.tr + th + 1 + Math.floor(s.rnd() * 2), lc = clamp(s.tc - 2 + Math.floor(s.rnd() * 4), 0, s.C - 5); s.leach = new Set();
    for (const r of [lr, lr + 2]) if (r < s.Rw) for (let c = lc; c < lc + 5; c++) s.leach.add(`${c},${r}`);
    s.probed = {}; s.found = { tank: false, leach: false }; s.cur = { c: 8, r: 4 }; s.msg = s.cam ? 'Camera says the pipe heads out here. Find the TANK.' : 'Find the TANK. No clues. Just you and a probe rod.';
  },
  update(s, dt, I) {
    s.t += dt;
    if (I.Lp) s.cur.c = Math.max(0, s.cur.c - 1); if (I.Rp) s.cur.c = Math.min(s.C - 1, s.cur.c + 1);
    if (I.Up) s.cur.r = Math.max(0, s.cur.r - 1); if (I.Dp) s.cur.r = Math.min(s.Rw - 1, s.cur.r + 1);
    let pick = null;
    if (I.ptr.clicked) { const c = Math.floor((I.ptr.x - s.ox) / s.Z), r = Math.floor((I.ptr.y - s.oy - s.HH) / s.Z); if (c >= 0 && r >= 0 && c < s.C && r < s.Rw) { pick = { c, r }; s.cur = { c, r }; } }
    if (I.Ap) pick = { ...s.cur };
    if (pick) this.probe(s, pick.c, pick.r);
    const used = s.probes - s.left;
    if (s.found.tank && s.found.leach) s.end = { win: true, stars: stars3(used <= 10, used <= 15), line: `Found both with ${used} probes.` };
    else if (s.left <= 0) s.end = { win: false, stars: 0, line: 'Out of probes. Time to call the town for the septic plan.' };
  },
  near(set, c, r) { for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if (set.has(`${c + dc},${r + dr}`)) return true; return false; },
  probe(s, c, r) {
    const k = `${c},${r}`; if (s.probed[k] !== undefined) return;
    s.left--;
    if (!s.found.tank && s.tank.has(k)) { s.found.tank = true; s.tank.forEach(t => s.probed[t] = 'T'); s.msg = 'CLUNK! Tank found. Now the LEACH FIELD.'; SFX('clog'); return; }
    if (s.leach.has(k)) { s.probed[k] = 'L'; if (!s.found.leach) { s.found.leach = true; s.msg = s.found.tank ? '' : 'Gravel! Leach field. Now the TANK.'; } return; }
    const target = s.found.tank ? s.leach : s.tank;
    s.probed[k] = this.near(target, c, r) ? '!' : 'X';
    s.msg = s.probed[k] === '!' ? 'Scraped something. Close!' : 'Nothing. Just dirt.';
  },
  draw(s) {
    const yd = MG('bg_yard');
    if (yd) g.drawImage(yd, 0, 0, W, H); else R(0, 0, W, H, '#cfd8df');
    R(s.ox, s.oy, s.C * s.Z, s.HH, '#6d4a2f'); R(s.ox + 10, s.oy + 3, 14, 15, '#3d2a1a'); T('HOUSE', s.ox + 32, s.oy + 10, '#fff', 6);
    const gy = s.oy + s.HH;
    if (yd) g.drawImage(yd, 170, 140, 300, 125, s.ox, gy, s.C * s.Z, s.Rw * s.Z); else R(s.ox, gy, s.C * s.Z, s.Rw * s.Z, '#f4f7fa');
    if (s.cam) {   // the camera tells you which way the pipe goes, not how far
      R(s.ox + s.pipeC * s.Z + s.Z / 2 - 2, s.oy + s.HH - 4, 4, 6, '#888');
      g.setLineDash([3, 4]); g.strokeStyle = 'rgba(70,90,110,.55)'; g.lineWidth = 2; g.beginPath();
      g.moveTo(s.ox + s.pipeC * s.Z + s.Z / 2, gy); g.lineTo(s.ox + s.pipeC * s.Z + s.Z / 2, gy + s.Z * 2.5); g.stroke(); g.setLineDash([]);
    }
    g.strokeStyle = '#dde4ea'; g.lineWidth = 1;
    for (let c = 0; c <= s.C; c++) { g.beginPath(); g.moveTo(s.ox + c * s.Z + .5, gy); g.lineTo(s.ox + c * s.Z + .5, gy + s.Rw * s.Z); g.stroke(); }
    for (let r = 0; r <= s.Rw; r++) { g.beginPath(); g.moveTo(s.ox, gy + r * s.Z + .5); g.lineTo(s.ox + s.C * s.Z, gy + r * s.Z + .5); g.stroke(); }
    for (const k in s.probed) {
      const [c, r] = k.split(',').map(Number), p = s.probed[k], x = s.ox + c * s.Z, y = gy + r * s.Z;
      if (p === 'T') { if (SPC('septiclid', x + s.Z / 2, y + s.Z / 2, (s.Z + 6) / 55)) continue; R(x + 1, y + 1, s.Z - 2, s.Z - 2, '#8a8f94'); T('LID', x + s.Z / 2, y + s.Z / 2, '#fff', 5, 'center'); }
      else if (p === 'L') { R(x + 1, y + 1, s.Z - 2, s.Z - 2, '#9a8a6a'); T('GRV', x + s.Z / 2, y + s.Z / 2, '#fff', 5, 'center'); }
      else if (p === '!') { C(x + s.Z / 2, y + s.Z / 2, 9, '#f2903d'); T('!', x + s.Z / 2 + 1, y + s.Z / 2 + 1, '#111', 8, 'center'); }
      else { g.strokeStyle = '#8fa0b0'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 7, y + 7); g.lineTo(x + s.Z - 7, y + s.Z - 7); g.moveTo(x + s.Z - 7, y + 7); g.lineTo(x + 7, y + s.Z - 7); g.stroke(); }
    }
    g.strokeStyle = '#f7c418'; g.lineWidth = 2; g.strokeRect(s.ox + s.cur.c * s.Z + 1, gy + s.cur.r * s.Z + 1, s.Z - 2, s.Z - 2);
    HUD(s, 'FIND THE SEPTIC', null);
    T('PROBES ' + s.left, W - 6, 8, s.left <= 4 ? '#e9665a' : '#fff', 8, 'right');
    T(s.msg || '', 240, 262, '#2a3346', 7, 'center');
  },
});

// =====================================================================
// 5. OVERFLOW CONTROL — the stream visibly sways; keep the bucket under it and swap before it overflows.
GAMES.push({
  id: 'overflow', name: 'OVERFLOW CONTROL', tag: 'Restaurant kitchen · Thanksgiving basement',
  how: ['The cleanout is gushing. Catch it in the bucket.', 'The stream sways with the pressure: follow it.', 'When the bucket is FULL, press SPACE to swap in an empty one (takes half a second).', 'Keep the floor mess under 60% until the line drains.'],
  ctl: '◀ ▶ MOVE  ·  SPACE = SWAP BUCKET',
  act: 'SWAP', dpad: 'lr',
  init(s) { s.DUR = 15; s.px = 240; s.fill = 0; s.swap = 0; s.mess = 0; s.buckets = 0; s.ph = s.rnd() * 6; },
  update(s, dt, I) {
    s.t += dt; const k = s.k;
    const tt = s.t * k + s.ph;
    const p = clamp(0.5 + 0.33 * Math.sin(tt * 0.62) + 0.17 * Math.sin(tt * 1.35 + 1), 0, 1);
    s.land = 60 + p * 360;
    const flow = 20 + p * 14;
    mover1D(s, I, dt, 250 * HERO(s).spd, 30, W - 30);
    if (I.Ap && s.swap <= 0) { s.buckets++; s.fill = 0; s.swap = 0.5; }
    if (s.swap > 0) { s.swap -= dt; s.mess += flow * dt * 0.45; }
    else if (Math.abs(s.land - s.px) < 26) { s.fill += flow * dt; if (s.fill > 100) { s.mess += (s.fill - 100) * 0.45; s.fill = 100; } }
    else s.mess += flow * dt * 0.45;
    if (s.mess >= 60) s.end = { win: false, stars: 0, line: 'It got everywhere.' };
    else if (s.t >= s.DUR) s.end = { win: true, stars: stars3(s.mess < 20, s.mess < 40), line: `Floor mess: ${Math.round(s.mess)}%. ${s.buckets} buckets.` };
  },
  draw(s) {
    const FL = 230;
    if (BGI('bg_basement')) { g.globalAlpha = 0.35; R(0, 0, W, H, '#10151f'); g.globalAlpha = 1; }
    else { R(0, 0, W, H, '#3a3d42');
    for (let y = 16; y < FL; y += 30) for (let x = (y / 30 % 2) * 30; x < W; x += 60) R(x, y, 58, 28, '#45494f'); }
    R(0, FL, W, H - FL, '#8a8f94');
    const pw = s.mess / 60 * 420; g.fillStyle = '#6b4423'; g.beginPath(); g.ellipse(240, FL + 12, pw / 2 + 1, 5 + pw / 40, 0, 0, 7); g.fill();
    R(0, 60, 40, 30, '#d6d6d6'); R(36, 54, 12, 42, '#bbb');
    g.strokeStyle = '#7a4a1e'; g.lineWidth = 10; g.lineCap = 'round'; g.beginPath(); g.moveTo(46, 75); g.quadraticCurveTo(46 + (s.land - 46) * .7, 30, s.land, FL - 6); g.stroke();
    if (s.swap <= 0) {
      g.fillStyle = '#e07a1f'; g.beginPath(); g.moveTo(s.px - 24, FL - 52); g.lineTo(s.px + 24, FL - 52); g.lineTo(s.px + 19, FL); g.lineTo(s.px - 19, FL); g.fill();
      const fh = s.fill / 100 * 48; R(s.px - 19, FL - fh, 38, fh, '#5a3a1c');
      if (s.fill >= 100) T('FULL! SPACE', s.px, FL - 62, '#e9665a', 8, 'center'); else if (s.fill > 80) T('ALMOST', s.px, FL - 62, '#f7c418', 6, 'center');
    } else T('SWAP...', s.px, FL - 30, '#f7c418', 8, 'center');
    HUD(s, 'OVERFLOW CONTROL', s.DUR - s.t);
    BAR(6, 30, 120, 8, s.mess / 60, s.mess > 40 ? '#e9665a' : '#f7c418', 'FLOOR MESS');
  },
});

// =====================================================================
// 6. SEWER CAMERA — you're looking at the camera monitor, straight down the pipe. Push it, tag what's wrong, pick the right branch, find the clog.
GAMES.push({
  id: 'camera', name: 'SEWER CAMERA', tag: 'Scope the line · tag the problems · find the clog',
  how: ['This is the camera monitor: you are looking down the pipe.', 'The camera creeps forward on its own. Hold ▲ to push faster, ▼ to back up.', 'When a problem (roots, a crack, an offset joint, the clog) is inside the yellow box, press SPACE to TAG it.', 'Push too fast past an offset joint and the head snags: back up and go again. At the Y, steer ◀ ▶ into the branch the mess is coming from.'],
  ctl: '▲ PUSH · ▼ BACK UP · ◀ ▶ PICK THE BRANCH · SPACE = TAG',
  act: 'TAG',
  init(s) {
    s.TIME = [45, 40, 36][s.diff]; s.d = 0; s.v = 0; s.FORK = 34 + s.rnd() * 6; s.CLOG = s.FORK + 26 + s.rnd() * 8; s.CAP = s.FORK + 14;
    s.good = s.rnd() < 0.5 ? -1 : 1; s.choice = 0; s.branch = 0; s.snag = 0; s.snags = 0; s.wrong = 0; s.misses = 0; s.msg = ''; s.msgT = 0; s.flash = 0;
    s.PVC = s.rnd() < 0.5;   // white plastic or old cast iron
    const kinds = ['roots', 'crack', 'offset', 'belly', 'grease', 'roots', 'offset'];
    s.def = []; const add = (a, b, n) => { for (let i = 0; i < n; i++) s.def.push({ d: a + (b - a) * (i + 0.3 + s.rnd() * 0.4) / n, kind: kinds[Math.floor(s.rnd() * kinds.length)], ang: s.rnd() * 6.28, br: a >= s.FORK ? 1 : 0, tagged: false }); };
    add(6, s.FORK - 4, [3, 3, 4][s.diff]); add(s.FORK + 4, s.CLOG - 4, [2, 3, 3][s.diff]);
    s.def.push({ d: s.CLOG, kind: 'clog', ang: 0, br: 1, tagged: false });
  },
  bend(s, z) { return 46 * Math.sin(z / 17) + 20 * Math.sin(z / 7.3 + 1); },
  update(s, dt, I) {
    s.t += dt; FX(s, dt); s.msgT = Math.max(0, s.msgT - dt); s.flash = Math.max(0, s.flash - dt);
    const say = (m, t = 1.2) => { s.msg = m; s.msgT = t; };
    // steering at the Y
    if (I.L || I.Lp) s.choice = -1; if (I.R || I.Rp) s.choice = 1;
    if (I.ptr.down && I.ptr.y > 60 && I.ptr.y < 220 && s.d > s.FORK - 12 && !s.branch) s.choice = I.ptr.x < 240 ? -1 : 1;
    // speed: creeps on its own, ▲ pushes, ▼ backs up (a held finger on the top/bottom of the screen does the same)
    let want = 3.2;
    const up = I.U || (I.ptr.down && I.ptr.y < 90), dn = I.D || (I.ptr.down && I.ptr.y > 210);
    if (up) want = 9 * HERO(s).spd; if (dn) want = -6;
    if (s.snag > 0) { want = Math.min(0, want); if (dn) { s.snag -= dt * 2.5; if (s.snag <= 0) say('FREE. EASY NOW.'); } }
    s.v += (want - s.v) * Math.min(1, dt * 4);
    const before = s.d; s.d = Math.max(0, s.d + s.v * dt);
    // offset joints catch the head if you hit them fast
    for (const o of s.def) if (o.kind === 'offset' && o.br === s.branch && before < o.d - 0.8 && s.d >= o.d - 0.8) {
      if (s.v > 6 * Math.sqrt(HERO(s).steady)) { s.d = o.d - 0.9; s.v = 0; s.snag = 1; s.snags++; s.shake = 0.3; SFX('clog', { vol: 0.5 }); say('SNAGGED ON THE JOINT! BACK UP (▼)', 1.6); }
    }
    // the Y: you have to pick a side
    if (!s.branch && s.d >= s.FORK) {
      if (!s.choice) { s.d = s.FORK; s.v = 0; if (s.msgT <= 0) say('A Y IN THE LINE. ◀ OR ▶ ?', 1); }
      else { s.branch = s.choice === s.good ? 1 : 2; if (s.branch === 2) say('HMM. CLEAN IN HERE...', 1.2); }
    }
    if (s.branch && s.d < s.FORK - 0.5) { s.branch = 0; s.choice = 0; }   // backed out to the Y
    if (s.branch === 2 && s.d >= s.CAP - 1.5) { s.d = s.CAP - 1.5; s.v = Math.min(s.v, 0); if (s.msgT <= 0) { say('DEAD END. BACK IT UP (▼).', 1.6); s.wrong++; SFX('drill_stop'); } }
    // TAG
    if (I.Ap || (I.ptr.clicked && I.ptr.y >= 90 && I.ptr.y <= 210 && !(s.d > s.FORK - 12 && !s.branch))) {
      const inBox = s.def.filter(o => !o.tagged && o.br === (s.branch === 1 ? 1 : 0) && o.d - s.d > 1.2 && o.d - s.d < 6.5);
      if (inBox.length) { const o = inBox[0]; o.tagged = true; s.flash = 0.25; SFX('ui_select'); POP(s, 240, 120, `TAGGED: ${this.label(o.kind)} @ ${o.d.toFixed(1)} FT`, '#7dffb0');
        if (o.kind === 'clog') { SFX('drain'); const all = s.def.filter(x => x.kind !== 'clog'), got = all.filter(x => x.tagged).length;
          s.end = { win: true, stars: stars3(got === all.length && !s.snags && !s.wrong, got >= all.length / 2), line: `Found it at ${o.d.toFixed(0)} feet. Tagged ${got} of ${all.length} problems on the way.` }; return; } }
      else { s.misses++; SFX('click', { vol: 0.3 }); say('NOTHING IN THE BOX', 0.7); }
    }
    // anything you drive past without tagging is a miss on the report
    if (s.t >= s.TIME) s.end = { win: false, stars: 0, line: "Ran out of time. Customer's watching the clock. No report." };
  },
  label(k) { return { roots: 'ROOTS', crack: 'CRACK', offset: 'OFFSET JOINT', belly: 'BELLY (STANDING WATER)', grease: 'GREASE', clog: 'THE CLOG' }[k]; },
  draw(s) {
    const t = s.t, D = s.d, wall = s.PVC ? [232, 230, 222] : [96, 90, 84], CX = 240, CY = 132;
    R(0, 0, W, H, '#050605');
    const path = z => { const p = this.bend(s, D + z) - this.bend(s, D); return [CX + p * Math.min(1, z / 14), CY + 18 * Math.sin((D + z) / 11) * Math.min(1, z / 14) - 18 * Math.sin(D / 11) * Math.min(1, z / 14)]; };
    const rad = z => 900 / (z + 2.6);
    const shade = z => { const k = Math.max(0, 1 - z / 26) ** 1.4; return `rgb(${wall.map(c => Math.round(c * (0.12 + 0.88 * k))).join(',')})`; };
    // which way the pipe goes past the Y
    const branchDir = s.branch ? (s.branch === 1 ? s.good : -s.good) : 0;
    const zEnd = s.branch === 2 ? s.CAP - D : !s.branch ? s.FORK - D : 30;
    // the tunnel: near rings first, far ones on top (each smaller ring is deeper)
    for (let z = 0.3; z < Math.min(30, Math.max(0.3, zEnd)); z += 0.5) {
      let [x, y] = path(z); if (s.branch) x += branchDir * Math.max(0, z - 0) * 1.5;
      g.fillStyle = shade(z); g.beginPath(); g.arc(x, y, rad(z), 0, 7); g.fill();
      if (Math.floor((D + z) / 4) !== Math.floor((D + z - 0.5) / 4)) { g.strokeStyle = s.PVC ? 'rgba(150,150,140,.6)' : 'rgba(30,26,22,.8)'; g.lineWidth = Math.max(1, rad(z) / 40); g.beginPath(); g.arc(x, y, rad(z), 0, 7); g.stroke(); }   // joints every 4 ft
    }
    // what's at the end of the view: the Y, a dead-end cap, or more pipe into the dark
    if (!s.branch && zEnd < 30) { const [x, y] = path(zEnd), r = rad(zEnd);
      for (const side of [-1, 1]) { const hx = x + side * r * 0.45, good = side === s.good;
        g.fillStyle = '#050605'; g.beginPath(); g.arc(hx, y, r * 0.42, 0, 7); g.fill();
        if (good) for (let i = 0; i < 6; i++) R(hx - r * 0.3 + i * r * 0.11, y + r * 0.25 + Math.sin(t * 3 + i) * 2, Math.max(1, r * 0.05), Math.max(1, r * 0.04), '#5a3e1c');   // a brown trail coming out of the bad side
        if (s.choice === side) { g.strokeStyle = '#f7c418'; g.lineWidth = 2; g.beginPath(); g.arc(hx, y, r * 0.46, 0, 7); g.stroke(); } } }
    else if (s.branch === 2 && zEnd < 30) { const [x, y] = path(zEnd); g.fillStyle = s.PVC ? '#d8d6cc' : '#55504a'; g.beginPath(); g.arc(x + branchDir * zEnd * 1.5, y, rad(zEnd), 0, 7); g.fill(); }
    else { const [x, y] = path(30); g.fillStyle = '#050605'; g.beginPath(); g.arc(x + branchDir * 45, y, rad(30), 0, 7); g.fill(); }
    // the problems, far to near
    const vis = s.def.filter(o => o.br === (s.branch === 1 ? 1 : 0) && o.d - D > 0.4 && o.d - D < Math.min(28, zEnd)).sort((a, b) => b.d - a.d);
    for (const o of vis) {
      const z = o.d - D; let [x, y] = path(z); if (s.branch) x += branchDir * z * 1.5; const r = rad(z), a = o.ang;
      const wx = x + Math.cos(a) * r * 0.82, wy = y + Math.sin(a) * r * 0.82, k = Math.max(0.4, r / 60);
      if (o.kind === 'roots') { g.strokeStyle = '#8a6a3e'; g.lineWidth = Math.max(1, k); for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(x - r * 0.4 + i * r * 0.13, y - r * 0.95); g.quadraticCurveTo(x - r * 0.3 + i * r * 0.12 + Math.sin(i) * r * 0.2, y - r * 0.4, x - r * 0.35 + i * r * 0.11, y - r * (0.2 + (i % 3) * 0.12)); g.stroke(); } }
      else if (o.kind === 'crack') { g.strokeStyle = '#1a1612'; g.lineWidth = Math.max(1, k * 0.8); g.beginPath(); g.moveTo(wx, wy - r * 0.3); for (let i = 1; i < 6; i++) g.lineTo(wx + (i % 2 ? 1 : -1) * r * 0.06, wy - r * 0.3 + i * r * 0.12); g.stroke(); }
      else if (o.kind === 'offset') { g.strokeStyle = s.PVC ? '#9a968a' : '#1a1612'; g.lineWidth = Math.max(2, r * 0.12); g.beginPath(); g.arc(x + r * 0.12, y + r * 0.08, r * 0.95, 0, 7); g.stroke(); g.strokeStyle = 'rgba(232,130,42,.9)'; g.lineWidth = Math.max(2, r * 0.07); g.beginPath(); g.arc(x + r * 0.12, y + r * 0.08, r * 0.9, -0.7, 1.1); g.stroke(); }   // the lip of the shifted pipe catches the light
      else if (o.kind === 'belly') { g.fillStyle = 'rgba(70,110,140,.75)'; g.beginPath(); g.ellipse(x, y + r * 0.62, r * 0.75, r * 0.3, 0, 0, Math.PI); g.fill(); R(x - r * 0.5, y + r * 0.6 + Math.sin(t * 2) * k, r, Math.max(1, k), 'rgba(200,230,255,.5)'); }
      else if (o.kind === 'grease') { g.fillStyle = 'rgba(214,190,90,.85)'; for (let i = 0; i < 5; i++) { const aa = a + i * 0.35; g.beginPath(); g.arc(x + Math.cos(aa) * r * 0.85, y + Math.sin(aa) * r * 0.85, r * 0.12, 0, 7); g.fill(); } }
      else if (o.kind === 'clog') { const mess = s.room === 'kitchen' ? ['#1c1a17', '#2e2a24'] : ['#7a4a1e', '#5a3a1c'];
        for (let i = 0; i < 16; i++) { g.fillStyle = mess[i % 2]; g.beginPath(); g.arc(x + Math.cos(i * 2.4) * r * 0.5 * (i / 16), y + Math.sin(i * 2.4) * r * 0.5 * (i / 16), r * 0.3, 0, 7); g.fill(); }
        R(x - r * 0.2, y - r * 0.1, r * 0.3, r * 0.14, '#f4f4f2'); }   // a wipe in there, naturally
      if (o.tagged) T('TAG', x + r * 0.6, y - r * 0.6, '#7dffb0', 6, 'center');
    }
    // the camera's own light falling off, and a vignette like a real monitor
    const vg = g.createRadialGradient(CX, CY, 60, CX, CY, 300); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.85)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    // the TAG box: things between 1 and 6.5 feet ahead
    const [bx, by] = path(4.6), br = rad(4.6) * 0.8; g.strokeStyle = 'rgba(247,196,24,.75)'; g.lineWidth = 2; const bs = br * 1.15;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.beginPath(); g.moveTo(bx + sx * bs, by + sy * bs * 0.6); g.lineTo(bx + sx * bs, by + sy * bs); g.lineTo(bx + sx * bs * 0.6, by + sy * bs); g.stroke(); }
    // monitor overlay: footage counter, REC, scanlines
    for (let y = 16; y < H; y += 3) R(0, y, W, 1, 'rgba(0,0,0,.18)');
    T(`FT ${s.d.toFixed(1).padStart(5, '0')}`, 12, 30, '#7dffb0', 8); T(s.PVC ? 'PVC 4"' : 'CAST IRON 4"', 12, 44, '#7dffb0', 5);
    if (Math.floor(t * 2) % 2) { C(W - 70, 28, 3, '#e9665a'); } T('REC', W - 62, 28, '#e9665a', 6);
    const tagged = s.def.filter(o => o.tagged && o.kind !== 'clog').length; T(`TAGS ${tagged}`, W - 12, 44, '#f7c418', 6, 'right');
    if (s.flash > 0) { g.globalAlpha = s.flash * 2; R(0, 16, W, H, '#fff'); g.globalAlpha = 1; }
    if (s.msgT > 0) T(s.msg, 240, 236, '#f7c418', 7, 'center');
    if (s.snag > 0) T('SNAGGED', 240, 214, '#e9665a', 9, 'center');
    DRAWFX(s); HUD(s, 'SEWER CAMERA', s.TIME - s.t);
  },
});

// =====================================================================
// 7. GAG METER — Fishy Pissy. Turn the cap in the stink; step back to fresh air to recover.
GAMES.push({
  id: 'gag', name: 'FISHY PISSY', tag: 'The worst smell in the North Country',
  how: ['The cap is on the cleanout (right). Tap SPACE there to turn it. Every turn lets more stink out.', 'Hold ▼ to hold your breath before you walk into the cloud. Cranking the cap burns through your breath fast.', 'You can only get your breath back in the FRESH AIR by the door (left). Run out of breath in the cloud and you gag.', 'Every few turns the cap sticks: HOLD SPACE to crank it loose. Gag out 3 times and you lose.'],
  ctl: '◀ ▶ WALK  ·  SPACE = TURN CAP (HOLD WHEN STUCK)  ·  HOLD ▼ = HOLD BREATH',
  act: 'TURN',
  init(s) { s.TIME = [55, 64, 72][s.diff]; s.px = 70; s.turns = 0; s.NEED = [14, 18, 22][s.diff]; s.gag = 0; s.lungs = 100; s.strikes = 0; s.stun = 0; s.cd = 0; s.gasp = 0; s.stuck = 0; s.crank = 0; },
  update(s, dt, I) {
    s.t += dt; FX(s, dt);
    const S = s.turns / s.NEED, H = HERO(s);
    s.cloudX = 380 - (s.turns ? 90 + 190 * S : 0);
    if (s.stun > 0) { s.stun -= dt; }
    else mover1D(s, I, dt, 150 * H.spd, 40, 400);
    const atCap = s.px > 350, inCloud = s.turns > 0 && s.px > s.cloudX, fresh = s.px < 80;
    s.hold = s.stun <= 0 && I.D && s.lungs > 0;
    s.cd = Math.max(0, s.cd - dt);
    // turning the cap: a quarter turn per tap, and every few turns it sticks and has to be cranked (hold SPACE)
    let turned = false;
    if (s.stun <= 0 && atCap) {
      if (s.stuck) { if (I.A || I.ptr.down) { s.crank += dt; s.lungs -= 30 * dt / H.grip; if (s.crank >= 0.7 / H.grip) { s.stuck = 0; s.crank = 0; s.turns++; turned = true; POP(s, 380, 140, 'CRACKED IT!', '#9fe07a'); SFX('drill_stop', { vol: 0.5 }); } } else s.crank = Math.max(0, s.crank - dt * 2); }
      else if ((I.Ap || I.ptr.clicked) && s.cd <= 0) { s.turns++; s.cd = 0.2 / H.spd; turned = true; s.lungs -= 5 / H.grip; SFX('click', { vol: 0.35 });
        if (s.turns % 4 === 0 && s.turns < s.NEED) { s.stuck = 1; POP(s, 380, 140, 'STUCK! HOLD SPACE', '#f7c418'); } }
      if (turned) PUFF(s, 386, 160, '#a8c870', 6, 40);
    }
    // breath: holding it drains your lungs (faster while you work). You only get it back in the fresh air.
    if (s.hold) s.lungs = Math.max(0, s.lungs - 16 / H.grip * dt);
    else if (fresh) s.lungs = Math.min(100, s.lungs + 55 * dt);
    else if (!inCloud) s.lungs = Math.min(100, s.lungs + 12 * dt);
    if (inCloud && !s.hold) {   // breathing the cloud
      s.gag += 34 * (0.55 + S) * s.k / H.grip * dt;
      if (s.wasHold && s.lungs <= 0.5) { s.gag += 30; s.gasp = 0.8; POP(s, s.px, 150, '*GASP*', '#e9665a'); }
    }
    s.lungs = Math.max(0, s.lungs);
    s.wasHold = s.hold;
    if (!inCloud) s.gag = Math.max(0, s.gag - 30 * dt);
    s.gasp = Math.max(0, s.gasp - dt);
    if (s.gag >= 100) { s.strikes++; s.gag = 40; s.stun = 1.8; s.px = Math.max(40, s.px - 40); SFX('squish'); }
    if (s.turns >= s.NEED) s.end = { win: true, stars: stars3(s.strikes === 0, s.strikes <= 1), line: s.strikes ? `Cap's off. You gagged ${s.strikes}x.` : 'Cap off without a single gag. Iron stomach.' };
    else if (s.strikes >= 3) s.end = { win: false, stars: 0, line: 'You gagged out. Rod finishes it.' };
    else if (s.t >= s.TIME) s.end = { win: false, stars: 0, line: 'Too slow. The cap is still on.' };
  },
  draw(s) {
    const room = BGI('bg_laundry'), FY = room ? 232 : 214, CX = room ? 390 : 386, CY = room ? 157 : 163;
    if (room) { T('FRESH AIR', 34, 58, '#7bd65b', 6, 'center'); }
    else { R(0, 0, W, H, '#3d3a35'); R(0, 214, W, 56, '#6f6a62');
    R(14, 110, 40, 104, '#2b2016'); R(18, 114, 32, 100, '#cfe8f5');                  // open door
    T('FRESH', 34, 92, '#7bd65b', 6, 'center'); T('AIR', 34, 101, '#7bd65b', 6, 'center');
    R(388, 150, 70, 26, '#d6d6d6'); R(380, 156, 14, 14, '#bbb'); }
    g.save(); g.translate(CX, CY); g.rotate(s.turns * Math.PI / 2 / 4); R(-6, -6, 12, 12, '#999'); R(-2, -6, 4, 12, '#666'); g.restore();
    if (s.turns) { g.fillStyle = 'rgba(140,180,80,' + (0.16 + 0.3 * s.turns / s.NEED) + ')'; g.fillRect(s.cloudX, 40, W - s.cloudX, 176);
      for (let i = 0; i < 8; i++) C(s.cloudX + ((i * 47 + s.t * 20) % (W - s.cloudX)), 80 + (i * 29) % 120, 10 + i % 3 * 4, 'rgba(160,200,90,.25)'); }
    const hw = s.hero || 'matt', mv = s.lastPx != null && Math.abs(s.px - s.lastPx) > 0.01, left = mv && s.px < s.lastPx; s.lastPx = s.px;
    const fr = s.stun > 0 || s.gag > 70 ? MORE(hw, 15, 7) : mv ? WALK(hw, s.t, left ? 8 : 6) : (s.px > 300 ? 6 : 0);
    const MS = room ? 3.4 : 1, top = FY - 40 * MS;   // a 6-ft guy next to a 7-ft door
    SPR(hw, fr, s.px, FY, left && fr >= 9, MS);
    if (s.hold) T('(holding breath)', s.px, Math.min(160, top - 8), '#9fd1ff', 6, 'center');
    if (s.stun > 0) T('*GAG*', s.px, Math.min(160, top - 8), '#e9665a', 8, 'center');
    if (s.px > 350 && s.stun <= 0) T(s.stuck ? 'HOLD SPACE!' : 'SPACE = TURN', s.px, Math.min(132, top - 18), '#f7c418', 6, 'center');
    if (s.stuck && s.crank > 0) BAR(350, 140, 60, 5, s.crank / (0.7 / HERO(s).grip), '#f7c418', '');
    DRAWFX(s);
    HUD(s, 'FISHY PISSY', s.TIME - s.t);
    BAR(6, 30, 120, 8, s.gag / 100, s.gag > 70 ? '#e9665a' : '#9bc35a', 'GAG'); BAR(140, 30, 120, 8, s.lungs / 100, '#5aa0e0', 'LUNGS');
    BAR(274, 30, 120, 8, s.turns / s.NEED, '#f7c418', 'CAP ' + s.turns + '/' + s.NEED);
    T('STRIKES ' + 'X'.repeat(s.strikes) + '-'.repeat(3 - s.strikes), W - 6, 34, '#e9665a', 6, 'right');
  },
});

// =====================================================================
// 8. TROPHY PULL — reel it in like a fish; let go when it tugs.
GAMES.push({
  id: 'pull', name: 'TROPHY PULL', tag: 'The hair monster · the toy car',
  how: ['Hold SPACE to reel the auger in. Reeling builds TENSION.', 'It swings side to side in the trap: hold ◀ or ▶ to keep the line straight.', 'Watch for "!" — it is about to TUG. Let go until it calms down.', 'If the line snaps 3 times, it got away. Reel it all the way out.'],
  ctl: 'HOLD SPACE = REEL  ·  ◀ ▶ = KEEP IT STRAIGHT',
  act: 'REEL', dpad: 'lr',
  init(s) { s.TIME = 40; s.prog = 0; s.ten = 0; s.snaps = 0; s.nextTug = 1.6 + s.rnd(); s.tug = 0; s.warn = 0; s.idle = 0; s.sw = 0; s.swv = 0.5; },
  update(s, dt, I) {
    s.t += dt;
    const reel = I.A || I.ptr.down;
    s.nextTug -= dt;
    if (s.nextTug <= 0 && s.warn <= 0 && s.tug <= 0) s.warn = 0.95;   /* a longer heads-up before it tugs */
    if (s.warn > 0) { s.warn -= dt; if (s.warn <= 0) s.tug = 0.85; }
    if (s.tug > 0) { s.tug -= dt; if (s.tug <= 0) s.nextTug = (2.2 + s.rnd() * 1.8) / Math.sqrt(s.k); }
    // swing: it drifts in the trap; steer against it
    s.swv += (s.rnd() - 0.5) * 2.2 * dt; s.swv = clamp(s.swv, -0.6, 0.6);
    s.sw = clamp(s.sw + (s.swv * 0.65 * s.k - (I.L ? 1.6 : 0) + (I.R ? 1.6 : 0)) * dt, -1, 1);
    if (Math.abs(s.sw) >= 1) s.swv *= -0.6;
    const crooked = Math.abs(s.sw) > 0.6;
    if (reel) { s.ten += (30 + (s.tug > 0 ? 60 * s.k : 0) + (crooked ? 30 : 0)) / HERO(s).grip * dt; s.prog += (s.tug > 0 ? 2 : 8.5) * dt; s.idle = 0; }
    else { s.ten -= (s.tug > 0 ? 25 : 75) * dt; s.idle += dt; if (s.tug > 0) s.ten += 18 * s.k * dt; }
    s.ten = Math.max(0, s.ten);
    if (s.idle > 2.2) s.prog = Math.max(0, s.prog - 3 * dt);
    if (s.ten >= 100) { s.snaps++; s.ten = 15; s.prog = Math.max(0, s.prog - 15); s.flash = 0.4; }
    s.flash = Math.max(0, (s.flash || 0) - dt);
    if (s.prog >= 100) s.end = { win: true, stars: stars3(s.snaps === 0 && s.t < 26, s.snaps <= 1), line: `Landed it! A ${(14 + s.rnd() * 9).toFixed(1)}-inch trophy.` };
    else if (s.snaps >= 3) s.end = { win: false, stars: 0, line: 'Snapped three times. It got away.' };
    else if (s.t >= s.TIME) s.end = { win: false, stars: 0, line: 'Still down there. Somewhere.' };
  },
  draw(s) {
    R(0, 0, W, H, '#cfd6da'); R(0, 200, W, 70, '#9aa3a8');
    g.fillStyle = '#f4f4f2'; g.beginPath(); g.ellipse(240, 200, 120, 46, 0, 0, 7); g.fill();
    g.fillStyle = '#b9d4e0'; g.beginPath(); g.ellipse(240, 200, 92, 30, 0, 0, 7); g.fill();
    const depth = 1 - s.prog / 100, wob = s.sw * 70 + (s.tug > 0 ? Math.sin(s.t * 40) * 4 : 0) + (s.warn > 0 ? Math.sin(s.t * 30) * 1.5 : 0);
    const by = 200 - (1 - depth) * 120;
    g.strokeStyle = s.ten > 70 ? '#e9665a' : '#555'; g.lineWidth = 2; g.beginPath(); g.moveTo(240, 20); g.lineTo(240 + wob, by); g.stroke();
    if (s.prog > 5 && SPC('hair', 240 + wob, by + 10, 0.45 + s.prog / 180)) {} else if (s.prog > 5) { C(240 + wob, by + 6, 6 + s.prog / 12, '#3a2a1e'); for (let i = 0; i < 8; i++) R(240 + wob - 8 + i * 2, by + 6, 1, 6 + s.prog / 6, '#4a3424'); }
    SPR(s.hero || 'matt', 0, 330, 200);
    if (s.warn > 0) T('!', 240 + wob, by - 16, '#e9665a', 14, 'center');
    if (s.tug > 0) T('TUG! LET GO!', 240, 60, '#e9665a', 10, 'center');
    if (s.flash > 0) T('SNAP!', 240, 90, '#e9665a', 14, 'center');
    HUD(s, 'TROPHY PULL', s.TIME - s.t);
    BAR(6, 30, 160, 10, s.ten / 100, s.ten > 70 ? '#e9665a' : '#7bd65b', 'TENSION'); R(6 + 160 * .7, 28, 2, 14, '#fff');
    BAR(190, 30, 160, 10, s.prog / 100, '#f7c418', 'REELED IN');
    T('SNAPS ' + s.snaps + '/3', W - 6, 34, '#e9665a', 6, 'right');
    if (Math.abs(s.sw) > 0.5) T(s.sw > 0 ? '◀ CROOKED! ◀' : '▶ CROOKED! ▶', 240, 250, '#f7c418', 8, 'center');
  },
});

// =====================================================================
// 9. CLAW GRAB — the prize swirls toward the drain, spiraling in. Drop the grabber where it is GOING to be.
GAMES.push({
  id: 'claw', name: 'CLAW GRAB', tag: 'False teeth · the vape · anything shiny',
  how: ['Something is swirling around the bowl, and every lap it gets closer to the drain.', 'Move the grabber, then press SPACE to drop it. It takes a moment to reach the water.', 'Aim where it is GOING to be. Wads of toilet paper float around too: grab those and you wasted a try.', 'A clip on the edge just knocks it spinning faster. Get it before it goes down.'],
  ctl: '◀ ▶ ▲ ▼ MOVE  ·  SPACE = DROP',
  act: 'DROP',
  init(s) {
    s.TIME = 30; s.tries = [4, 3, 3][s.diff]; s.used = 0; s.px = 240; s.py = 130; s.ang = s.rnd() * 6; s.drop = 0; s.res = ''; s.resT = 0;
    s.cx = 240; s.cy = 140; s.rad = 1; s.boost = 0; s.DROP = 0.65; s.GRAB = 9 * Math.sqrt(HERO(s).steady); s.SINK = [0.028, 0.036, 0.045][s.diff];
    s.wads = []; for (let i = 0; i < [1, 2, 3][s.diff]; i++) s.wads.push({ ang: s.rnd() * 6, r: 0.45 + s.rnd() * 0.5, w: (0.6 + s.rnd() * 0.6) * (s.rnd() < 0.5 ? 1 : -1) });
  },
  pos(s, a, r) { r = r == null ? s.rad : r; return [s.cx + Math.cos(a) * 100 * r, s.cy + Math.sin(a) * 58 * r]; },
  update(s, dt, I) {
    s.t += dt; s.resT = Math.max(0, s.resT - dt); s.boost = Math.max(0, s.boost - dt);
    // speed surges and lulls (a toilet swirl is never steady), faster as it nears the drain, faster still if you clipped it
    const w = (0.8 + 0.35 * Math.sin(s.t * 1.7) + 0.25 * Math.sin(s.t * 3.1 + 1)) * s.k * (1 + (1 - s.rad) * 1.4) * (s.boost > 0 ? 1.8 : 1);
    s.ang += w * dt; s.rad -= s.SINK * dt;
    for (const o of s.wads) o.ang += o.w * dt * s.k;
    if (s.drop > 0) { s.drop -= dt; if (s.drop <= 0) {
      const [ox, oy] = this.pos(s, s.ang), d = Math.hypot(ox - s.px, oy - s.py);
      const wad = s.wads.find(o => { const [wx, wy] = this.pos(s, o.ang, o.r); return Math.hypot(wx - s.px, wy - s.py) < 11; });
      if (d < s.GRAB) s.got = true;
      else if (wad) { s.res = 'TOILET PAPER. GROSS.'; s.resT = 1.2; wad.gone = true; SFX('squish'); }
      else if (d < s.GRAB + 9) { s.res = 'CLIPPED IT! IT SPINS!'; s.resT = 1.1; s.boost = 1.4; SFX('splash', { vol: 0.4 }); }
      else { s.res = 'MISSED!'; s.resT = 1; SFX('splash', { vol: 0.3 }); }
      s.wads = s.wads.filter(o => !o.gone);
    } }
    else mover(s, I, dt, 110 * HERO(s).spd, 120, 360, 80, 200);
    if (s.drop <= 0 && !s.got && (I.Ap || I.ptr.clicked) && s.used < s.tries) { s.used++; s.drop = s.DROP; }
    if (s.got) s.end = { win: true, stars: stars3(s.used === 1, s.used <= 2), line: `Grabbed on try ${s.used}. ` + ({ vape: 'Blueberry ice. Rinse it. Or... maybe just buy a new one.', keys: 'Keys out. The fob still beeps. Mostly.', ring: 'The ring is back. Do not tell the husband.' }[s.item] || 'Rinsed off. Good as new. (Do not ask.)') };
    else if (s.rad <= 0.12) { SFX('flush'); s.end = { win: false, stars: 0, line: 'Down the drain. Bye.' }; }
    else if ((s.used >= s.tries && s.drop <= 0) || s.t >= s.TIME) s.end = { win: false, stars: 0, line: 'Out of grabs. It went down the drain.' };
  },
  draw(s) {
    R(0, 0, W, H, '#cfd6da');
    g.fillStyle = '#f6f6f4'; g.beginPath(); g.ellipse(s.cx, s.cy, 150, 104, 0, 0, 7); g.fill();
    g.fillStyle = '#9fc6d8'; g.beginPath(); g.ellipse(s.cx, s.cy, 124, 82, 0, 0, 7); g.fill();
    g.fillStyle = '#3d5f70'; g.beginPath(); g.ellipse(s.cx, s.cy, 16, 10, 0, 0, 7); g.fill();   // the drain, waiting
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(s.cx, s.cy, 30 + i * 30, 18 + i * 18, s.t * (1 + i * .3), 0, 4); g.stroke(); }
    if (s.diff === 0) for (let i = 0; i < 24; i++) { const [x, y] = this.pos(s, i / 24 * Math.PI * 2); R(x - 1, y - 1, 2, 2, 'rgba(255,255,255,.5)'); }   // easy mode shows the lap
    for (const o of s.wads) { const [x, y] = this.pos(s, o.ang, o.r); if (!SPC('tp', x, y, 0.6)) { R(x - 6, y - 4, 12, 8, '#f4f4f0'); R(x - 4, y - 6, 8, 3, '#e8e8e2'); R(x - 2, y - 1, 3, 2, '#d8d8d0'); } }
    const [ox, oy] = this.pos(s, s.ang);
    if (!s.got && SPC({ vape: 'vape', keys: 'keys', ring: 'ring' }[s.item] || 'teeth', ox, oy, s.item === 'ring' ? 0.55 : 0.65)) {}   // the real thing, swirling
    else if (!s.got) {   // what's swirling depends on the call
      if (s.item === 'vape') { R(ox - 9, oy - 3, 18, 6, '#3a3f4a'); R(ox - 9, oy - 3, 18, 2, '#5a6070'); R(ox + 5, oy - 2, 4, 4, '#6ab0ff'); R(ox - 11, oy - 2, 3, 4, '#222'); }
      else if (s.item === 'keys') { C(ox - 4, oy, 4, '#c9c4b8'); C(ox - 4, oy, 2, '#9fc6d8'); R(ox, oy - 1, 9, 2, '#c9c4b8'); R(ox + 6, oy + 1, 2, 3, '#c9c4b8'); R(ox - 12, oy - 4, 6, 9, '#222'); R(ox - 11, oy - 2, 4, 2, '#e9665a'); }
      else if (s.item === 'ring') { g.strokeStyle = '#f7c418'; g.lineWidth = 2; g.beginPath(); g.ellipse(ox, oy, 5, 3, 0, 0, 7); g.stroke(); R(ox - 1, oy - 5, 3, 3, '#e8f6ff'); }
      else { R(ox - 8, oy - 4, 16, 8, '#f0e6d8'); R(ox - 8, oy + 1, 16, 3, '#e3a7a0'); for (let i = 0; i < 5; i++) R(ox - 7 + i * 3, oy - 3, 2, 3, '#fff'); }
    }
    const drop = s.drop > 0 ? 1 - s.drop / s.DROP : 0;
    C(s.px, s.py, s.GRAB, 'rgba(0,0,0,.18)');
    g.strokeStyle = '#555'; g.lineWidth = 2; g.beginPath(); g.moveTo(s.px, 0); g.lineTo(s.px, s.py - 40 + drop * 34); g.stroke();
    const cy = s.py - 40 + drop * 34; R(s.px - 9, cy, 18, 4, '#888'); R(s.px - 10, cy + 4, 4, 8, '#888'); R(s.px + 6, cy + 4, 4, 8, '#888');
    if (s.resT > 0) T(s.res, 240, 250, '#e9665a', 9, 'center');
    HUD(s, 'CLAW GRAB', s.TIME - s.t); T('GRABS LEFT ' + (s.tries - s.used), 6, 28, '#14110c', 8);
    BAR(330, 24, 140, 6, (s.rad - 0.12) / 0.88, '#e9665a', ''); T('DRAIN', 326, 27, '#14110c', 6, 'right');
  },
});

// =====================================================================
// 10. PIPE DREAM — a Pipe Mania homage. Spin the pipe pieces to run the hose to the toilet before the water catches you.
GAMES.push({
  id: 'pour', name: 'PIPE DREAM', tag: 'No water in the house · fill the flush bucket',
  how: ["The water's off in the house. Run hose fittings from the neighbor's spigot (left) to the bucket (right).", 'Move the cursor and press SPACE to spin a pipe piece.', 'When the timer runs out the water starts flowing. It will not wait for you.', 'Stay ahead of the water. One leak and the driveway gets a bath.'],
  ctl: 'ARROWS = MOVE CURSOR  ·  SPACE = SPIN PIECE',
  act: 'SPIN', phone: 'tap a pipe piece to spin it.',
  init(s) {
    const C = 9, Rw = 5; s.C = C; s.Rw = Rw; s.Z = 38; s.ox = (W - C * s.Z) / 2; s.oy = 52;
    s.src = Math.floor(s.rnd() * Rw); s.cur = { c: 0, r: s.src }; s.spins = 0;
    s.grid = []; for (let r = 0; r < Rw; r++) { s.grid.push([]); for (let c = 0; c < C; c++) s.grid[r].push({ t: ['S', 'C', 'C', 'C', 'X'][Math.floor(s.rnd() * 5)], rot: Math.floor(s.rnd() * 4), wet: 0 }); }
    // carve a guaranteed route: across each column, with a vertical run to a random row
    let row = s.src;
    for (let c = 0; c < C; c++) {
      const tgt = c === C - 1 ? (s.dst = Math.floor(s.rnd() * Rw)) : Math.floor(s.rnd() * Rw);
      const cells = []; const step = Math.sign(tgt - row);
      if (step === 0) cells.push([row, 3, 1]);
      else { cells.push([row, 3, step > 0 ? 2 : 0]); for (let r = row + step; r !== tgt; r += step) cells.push([r, step > 0 ? 0 : 2, step > 0 ? 2 : 0]); cells.push([tgt, step > 0 ? 0 : 2, 1]); }
      for (const [r, a, b] of cells) s.grid[r][c] = { t: (a + 2) % 4 === b ? 'S' : 'C', rot: Math.floor(s.rnd() * 4), wet: 0 };
      row = tgt;
    }
    s.wait = [16, 13, 11][s.diff] * HERO(s).steady; s.flow = null; s.SPEED = [0.95, 0.8, 0.68][s.diff] * HERO(s).steady;
  },
  sides(p) { if (p.t === 'X') return [0, 1, 2, 3]; if (p.t === 'S') return p.rot % 2 ? [0, 2] : [1, 3]; return [p.rot % 4, (p.rot + 1) % 4]; },
  update(s, dt, I) {
    s.t += dt; FX(s, dt);
    if (I.Lp) s.cur.c = Math.max(0, s.cur.c - 1); if (I.Rp) s.cur.c = Math.min(s.C - 1, s.cur.c + 1);
    if (I.Up) s.cur.r = Math.max(0, s.cur.r - 1); if (I.Dp) s.cur.r = Math.min(s.Rw - 1, s.cur.r + 1);
    let hit = null;
    if (I.ptr.clicked) { const c = Math.floor((I.ptr.x - s.ox) / s.Z), r = Math.floor((I.ptr.y - s.oy) / s.Z); if (c >= 0 && r >= 0 && c < s.C && r < s.Rw) { hit = { c, r }; s.cur = { c, r }; } }
    if (I.Ap) hit = { ...s.cur };
    if (hit) { const p = s.grid[hit.r][hit.c]; if (p.wet > 0) { POP(s, s.ox + hit.c * s.Z + 19, s.oy + hit.r * s.Z, 'FULL OF WATER', '#e9665a'); } else { p.rot = (p.rot + 1) % 4; s.spins++; SFX('click', { vol: 0.4 }); } }
    // a finished line? open the valve and let it rip (Pipe Mania's fast-flow)
    if (hit || !s.checked) { s.checked = true; s.done = this.complete(s); if (s.done && !s.rush) { s.rush = true; POP(s, 240, 40, 'LINE COMPLETE! OPEN IT UP!', '#9fe07a'); } }
    if (!s.flow) { s.wait -= dt; if (s.wait <= 0 || s.done) { s.flow = { c: 0, r: s.src, from: 3, k: 0 }; SFX('faucet'); } return; }
    const f = s.flow, p = s.grid[f.r][f.c];
    if (f.k === 0 && !this.sides(p).includes(f.from)) return this.leak(s, f);
    f.k += dt / (s.done ? 0.12 : s.SPEED); p.wet = Math.min(1, f.k);
    if (f.k >= 1) {
      const sd = this.sides(p); const out = p.t === 'X' ? (f.from + 2) % 4 : sd.find(x => x !== f.from);
      const nc = f.c + (out === 1 ? 1 : out === 3 ? -1 : 0), nr = f.r + (out === 2 ? 1 : out === 0 ? -1 : 0);
      if (nc === s.C && nr === s.dst) { SFX('flush_big'); return (s.end = { win: true, stars: stars3(s.spins < 45, s.spins < 80), line: 'Bucket full. One fast pour... FLUUUSH.' }); }
      if (nc < 0 || nr < 0 || nc >= s.C || nr >= s.Rw) return this.leak(s, f, out);
      s.flow = { c: nc, r: nr, from: (out + 2) % 4, k: 0 };
    }
  },
  complete(s) {   // does the line, as it is now, run from the spigot all the way to the bucket?
    let c = 0, r = s.src, from = 3;
    for (let n = 0; n < 99; n++) { const p = s.grid[r][c], sd = this.sides(p); if (!sd.includes(from)) return false;
      const out = p.t === 'X' ? (from + 2) % 4 : sd.find(x => x !== from); c += out === 1 ? 1 : out === 3 ? -1 : 0; r += out === 2 ? 1 : out === 0 ? -1 : 0;
      if (c === s.C && r === s.dst) return true; if (c < 0 || r < 0 || c >= s.C || r >= s.Rw) return false; from = (out + 2) % 4; }
    return false;
  },
  leak(s, f) { s.shake = 0.4; PUFF(s, s.ox + f.c * s.Z + 19, s.oy + f.r * s.Z + 19, '#5fa8e0', 20, 90); SFX('splash'); s.end = { win: false, stars: 0, line: 'Leak! The driveway got flushed instead.' }; },
  draw(s) {
    R(0, 0, W, H, '#5f6a5a'); for (let i = 0; i < 40; i++) R((i * 97) % W, 20 + (i * 53) % 250, 3, 2, '#55604f');   // the driveway
    // hose bib + toilet
    R(s.ox - 26, s.oy + s.src * s.Z + 12, 22, 14, '#9a9a96'); R(s.ox - 8, s.oy + s.src * s.Z + 15, 8, 8, '#5fa8e0');
    const ty = s.oy + s.dst * s.Z, bx = s.ox + s.C * s.Z + 4; if (!SPI('bucket', bx + 12, ty + 36, 0.9)) { R(bx, ty + 8, 24, 26, '#e8822a'); R(bx - 2, ty + 6, 28, 4, '#c96a1a'); R(bx + 2, ty + 14, 20, 6, '#f4f4f2'); g.strokeStyle = '#999'; g.lineWidth = 1; g.beginPath(); g.arc(bx + 12, ty + 6, 12, Math.PI, 0); g.stroke(); }
    for (let r = 0; r < s.Rw; r++) for (let c = 0; c < s.C; c++) {
      const p = s.grid[r][c], x = s.ox + c * s.Z, y = s.oy + r * s.Z;
      { const sd = this.sides(p), key = p.t === 'X' ? 'X' : ['T', 'R', 'B', 'L'].filter((_, i) => sd.includes(i)).join('').replace('TRBL', 'X');
        const name = { TR: 'TR', RB: 'RB', BL: 'BL', TL: 'LT', RL: 'LR', TB: 'TB', X: 'X' }[key], im = name && MG((p.wet > 0 ? 'ptw_' : 'pt_') + name);
        if (im) { g.drawImage(im, x, y, s.Z, s.Z); continue; } }   // the drawn tiles; plain shapes below are the fallback
      R(x + 1, y + 1, s.Z - 2, s.Z - 2, '#3a4036');
      const m = s.Z / 2, wet = p.wet > 0, col = wet ? '#5fa8e0' : '#c9c4b8';
      for (const sd of this.sides(p)) { if (sd === 0) R(x + m - 5, y, 10, m + 5, '#777'); if (sd === 2) R(x + m - 5, y + m - 5, 10, m + 5, '#777'); if (sd === 1) R(x + m - 5, y + m - 5, m + 5, 10, '#777'); if (sd === 3) R(x, y + m - 5, m + 5, 10, '#777'); }
      for (const sd of this.sides(p)) { if (sd === 0) R(x + m - 3, y, 6, m + 3, col); if (sd === 2) R(x + m - 3, y + m - 3, 6, m + 3, col); if (sd === 1) R(x + m - 3, y + m - 3, m + 3, 6, col); if (sd === 3) R(x, y + m - 3, m + 3, 6, col); }
    }
    g.strokeStyle = '#f7c418'; g.lineWidth = 2; g.strokeRect(s.ox + s.cur.c * s.Z + 1, s.oy + s.cur.r * s.Z + 1, s.Z - 2, s.Z - 2);
    if (!s.flow) { BAR(140, 254, 200, 8, s.wait / ([16, 13, 11][s.diff] * HERO(s).steady), '#5fa8e0', ''); T(`WATER IN ${Math.ceil(s.wait)}`, 240, 244, '#fff', 7, 'center'); }
    else T('THE WATER IS COMING!', 240, 250, '#5fa8e0', 7, 'center');
    DRAWFX(s);
    HUD(s, 'PIPE DREAM', null);
  },
});

// =====================================================================
// 11. JETTER PULSE — kitty litter packs if you blast it; water beads keep growing.
GAMES.push({
  id: 'jetter', name: 'JETTER PULSE', tag: 'Kitty litter · water beads',
  how: ['Hold SPACE to build jetter pressure; let go to drop it.', 'Pressure in the GREEN band cuts the clog. Stay in the RED and it PACKS tighter.', 'Aim the nozzle with ▲ ▼ at the soft spot (it moves). Dead-on cuts 3x faster.', 'The clog keeps swelling, so keep pulsing. Clear it in time.'],
  ctl: 'HOLD SPACE = PRESSURE  ·  ▲ ▼ = AIM',
  act: 'JET', dpad: 'ud',
  init(s) { s.TIME = 30; s.p = 0; s.prog = 0; s.red = 0; s.packs = 0; s.LO = 30; s.HI = 75 + 8 * (HERO(s).grip - 1) * 4; s.aim = 0.5; s.spot = 0.5; s.sv = 0.25; },
  update(s, dt, I) {
    s.t += dt;
    s.p = clamp(s.p + ((I.A || I.ptr.down) ? 55 : -60) * dt, 0, 100);
    s.aim = clamp(s.aim + ((I.D ? 1 : 0) - (I.U ? 1 : 0)) * 1.1 * HERO(s).spd * dt, 0, 1);
    s.spot += s.sv * s.k * dt; if (s.spot < 0.1 || s.spot > 0.9) { s.sv *= -1; s.spot = clamp(s.spot, 0.1, 0.9); } if (s.rnd() < dt * 0.4) s.sv *= -1;
    const onSpot = Math.max(0.35, 1.2 - Math.abs(s.aim - s.spot) * 4);   // dead-on = up to 3x faster than a wild shot
    if (s.p >= s.LO && s.p <= s.HI) s.prog += (4 + (s.p - s.LO) * 0.2) * onSpot * dt;
    if (s.p > s.HI) { s.red += dt; if (s.red > 0.35) { s.prog = Math.max(0, s.prog - 8); s.packs++; s.red = -0.4; s.flash = 0.5; } }
    else s.red = Math.max(0, s.red);
    s.prog = Math.max(0, s.prog - 0.6 * s.k * dt);                 // water beads swelling back
    s.flash = Math.max(0, (s.flash || 0) - dt);
    if (s.prog >= 100) s.end = { win: true, stars: stars3(s.packs === 0, s.packs <= 2), line: `Line is open. ${s.packs} pack-up${s.packs === 1 ? '' : 's'}.` };
    else if (s.t >= s.TIME) s.end = { win: false, stars: 0, line: 'Still packed solid.' };
  },
  draw(s) {
    if (!BGI('bg_utility')) R(0, 0, W, H, '#2b2a26'); R(0, 90, W, 70, '#5d6168'); R(0, 100, W, 50, '#1e1d1a');
    const rem = 1 - s.prog / 100;
    R(260, 98, 140 * rem + 6, 54, '#cfc3a6'); for (let i = 0; i < 30 * rem; i++) R(262 + (i * 37) % (140 * rem + 1), 100 + (i * 17) % 50, 3, 3, '#a89c80');
    for (let i = 0; i < 6 * rem; i++) SPC('beads', 272 + (i * 53) % (130 * rem + 1), 110 + (i * 23) % 36, 0.5);
    const ny = 104 + s.aim * 42, sy = 104 + s.spot * 42;
    R(256, sy - 5, 10, 10, '#f7c418'); R(258, sy - 3, 6, 6, '#fff3b0');                       // the soft spot
    R(0, ny - 3, 120, 6, '#222'); R(116, ny - 7, 12, 14, '#999');
    if (s.p > 5) for (let i = 0; i < 10; i++) R(128 + i * 12 + (s.t * 300 % 12), ny - 1 + Math.sin(i + s.t * 30) * 3, 8, 2, s.p > s.HI ? '#e9665a' : '#9fd1ff');
    if (s.flash > 0) T('PACKED!', 240, 70, '#e9665a', 12, 'center');
    HUD(s, 'JETTER PULSE', s.TIME - s.t);
    const gx = 40, gw = 400; R(gx, 200, gw, 16, '#2c3326'); R(gx + s.LO / 100 * gw, 200, (s.HI - s.LO) / 100 * gw, 16, '#3f8f2e'); R(gx + s.HI / 100 * gw, 200, (100 - s.HI) / 100 * gw, 16, '#7a2a24');
    R(gx + s.p / 100 * gw - 3, 194, 6, 28, '#fff'); T('PRESSURE', gx, 188, '#fff', 6);
    BAR(gx, 240, gw, 8, s.prog / 100, '#f7c418', 'CLOG CLEARED');
  },
});

// =====================================================================
// 12. BUCKET HAUL — walk two full buckets to the van; lean to stop the slosh; hop the hose.
GAMES.push({
  id: 'haul', name: 'BUCKET HAUL', tag: 'Two 5-gallon buckets of water beads',
  how: ['Hold ▶ to walk to the van. Walking makes the buckets slosh.', 'Lean with ▲ / ▼ to steady them: keep the SLOSH needle in the middle.', 'Press SPACE to hop over hoses and steps (hop right at the marker).', 'Get there before time runs out with at least half the load.'],
  ctl: '▶ WALK  ·  ▲ ▼ LEAN  ·  SPACE = HOP',
  act: 'HOP',
  init(s) { s.TIME = 32; s.x = 0; s.LEN = 900; s.a = 0; s.v = 0; s.load = 100; s.hop = 0; s.trips = 0; s.obs = []; for (let d = 180; d < s.LEN - 80; d += 140 + s.rnd() * 90) s.obs.push({ d, done: false }); },
  update(s, dt, I) {
    s.t += dt;
    const walk = (I.R || I.ptr.down) ? 70 * HERO(s).spd : 0; s.x = Math.min(s.LEN, s.x + walk * dt);
    const lean = (I.U ? -1 : 0) + (I.D ? 1 : 0);
    const noise = walk ? (Math.sin(s.t * 6.3) * 0.9 + Math.sin(s.t * 2.7 + 1) * 0.6) * 1.15 * s.k : 0;
    s.v += (-3.2 * s.a - 1.6 * s.v + noise + lean * 2.6) * dt; s.a += s.v * dt; s.a = clamp(s.a, -1.4, 1.4);
    if (s.hop > 0) s.hop -= dt; else if (I.Ap) s.hop = 0.45;
    for (const o of s.obs) if (!o.done && s.x >= o.d) { o.done = true; if (s.hop > 0) { s.v += (s.rnd() - .5) * 0.6; } else { s.v += (s.rnd() < .5 ? -1 : 1) * 1.6; s.trips++; s.flash = 0.6; } }
    if (Math.abs(s.a) > 0.55) s.load = Math.max(0, s.load - (Math.abs(s.a) - 0.55) * 40 * dt);
    s.flash = Math.max(0, (s.flash || 0) - dt);
    if (s.x >= s.LEN) s.end = s.load >= 50 ? { win: true, stars: stars3(s.load >= 85, s.load >= 70), line: `Made it with ${Math.round(s.load)}% of the load.` } : { win: false, stars: 0, line: 'Most of it is on the lawn.' };
    else if (s.load < 50) s.end = { win: false, stars: 0, line: 'Most of it is on the lawn.' };
    else if (s.t >= s.TIME) s.end = { win: false, stars: 0, line: 'Rod: "Today, please."' };
  },
  draw(s) {
    const cam = s.x - 120, lawn = MG('bg_lawn');
    if (lawn) { const ox = -(((cam % W) + W) % W); R(0, 0, W, H, '#5fb83a'); g.drawImage(lawn, ox, -7, W, H); g.drawImage(lawn, ox + W, -7, W, H); }   // scrolls with you; grass line at 200
    else { R(0, 0, W, H, '#a9cfe6'); R(0, 200, W, 70, '#5a8a41'); R(0, 196, W, 6, '#4a7a35');
    R(-cam - 40, 90, 60, 110, '#b88660'); }
    if (IMG.van) g.drawImage(IMG.van, 0, 0, 432, IMG.van.height, Math.round(s.LEN - cam + 10), 202 - IMG.van.height / 3, 144, IMG.van.height / 3);
    for (const o of s.obs) { const x = o.d - cam; R(x - 14, 192, 28, 6, '#2f6f2a'); if (!o.done) R(x - 1, 170, 2, 10, '#f7c418'); }
    const hy = s.hop > 0 ? -Math.sin((1 - s.hop / 0.45) * Math.PI) * 14 : 0;
    const hasB = !!IMG[(s.hero || 'matt') + '_more'];
    SPR(s.hero || 'matt', MORE(s.hero || 'matt', 13, 6), 120, 198 + hy);
    const tilt = s.a * 0.5;
    if (!hasB) for (const side of [-1, 1]) { g.save(); g.translate(120 + side * 14, 178 + hy); g.rotate(tilt); if (!SPI('bucket', 0, 16, 0.52)) { R(-7, 0, 14, 14, '#e07a1f'); R(-6, 2, 12, 6 * s.load / 100 + 1, '#9fd1ff'); } g.restore(); }
    if (Math.abs(s.a) > 0.55) for (let i = 0; i < 3; i++) C(120 + Math.sign(s.a) * (22 + i * 6), 184 + i * 5 + hy, 2, '#9fd1ff');
    if (s.flash > 0) T('TRIPPED!', 120, 140, '#e9665a', 8, 'center');
    HUD(s, 'BUCKET HAUL', s.TIME - s.t);
    const mx = 160; R(mx, 26, 160, 10, '#2c3326'); R(mx + 80 - 0.55 / 1.4 * 80, 26, 0.55 / 1.4 * 160, 10, '#3f8f2e');
    R(mx + 80 + s.a / 1.4 * 80 - 2, 22, 4, 18, '#fff'); T('SLOSH', mx, 18 + 2, '#14110c', 6);
    BAR(6, 30, 120, 8, s.load / 100, '#5f9bc0', 'LOAD'); BAR(340, 30, 130, 8, s.x / s.LEN, '#f7c418', 'TO VAN');
  },
});

// =====================================================================
// 13. STAIRS OF DEATH — a Donkey Kong homage, upside down. Haul the jetter DOWN the zig-zag stairs while junk rolls after you.
GAMES.push({
  id: 'stairs', name: 'STAIRS OF DEATH', tag: 'The jetter vs. the basement stairs',
  how: ['Carry the jetter down four flights of cluttered basement stairs.', 'Walk with ◀ ▶. Paint cans and laundry baskets come rolling down after you.', 'Press SPACE to hop over a can, or over a CRACKED board (the dark ones).', 'Every hit or bad board costs a pair of pants. Reach the basement floor.'],
  ctl: '◀ ▶ = WALK  ·  SPACE = HOP',
  act: 'HOP', phone: 'hold left or right of you to walk, tap HOP to jump.', dpad: 'lr',
  init(s) {
    // four flights, zig-zagging down. each: x from a→b, y from ya→yb
    const bg = !!MG('bg_stairs'), y0 = bg ? 110 : 72, dy = bg ? 42 : 48;   // with the basement art: the first flight leaves from the landing by the door
    s.fl = []; for (let i = 0; i < 4; i++) { const r = i % 2 === 0; s.fl.push({ a: r ? 40 : 440, b: r ? 440 : 40, ya: y0 + i * dy, yb: y0 + i * dy + 18 }); }
    s.f = 0; s.x = 40; s.jump = 0; s.jy = 0; s.pantsMax = s.pants = [5, 4, 3][s.diff]; s.inv = 0; s.hits = 0; s.cans = []; s.next = 1.5; s.score = 0; s.facing = 1;
    s.holes = []; for (let i = 0; i < 4; i++) { const n = [1, 2, 2][s.diff] + (i > 1 ? 1 : 0); for (let j = 0; j < n; j++) s.holes.push({ f: i, u: 0.25 + (j + s.rnd() * 0.6) / (n + 0.4) * 0.6 }); }
    s.JUMP = 0.62 * Math.sqrt(HERO(s).steady);
  },
  yAt(s, f, x) { const F = s.fl[f]; return lerp(F.ya, F.yb, (x - F.a) / (F.b - F.a)); },
  uAt(s, f, x) { const F = s.fl[f]; return (x - F.a) / (F.b - F.a); },
  update(s, dt, I) {
    s.t += dt; FX(s, dt); s.inv -= dt;
    const F = s.fl[s.f], dirF = Math.sign(F.b - F.a);
    let mv = (I.R ? 1 : 0) - (I.L ? 1 : 0);
    if (I.ptr.down && !I.ptr.clicked) { const v = I.ptr.x - s.x; mv = Math.abs(v) < 6 ? 0 : Math.sign(v); }
    if (mv) s.facing = mv;
    s.x = clamp(s.x + mv * 78 * HERO(s).spd * dt, Math.min(F.a, F.b), Math.max(F.a, F.b));
    if ((I.Ap) && s.jump <= 0) { s.jump = s.JUMP; SFX('click', { vol: 0.3 }); }
    if (s.jump > 0) { s.jump -= dt; const p = 1 - Math.max(0, s.jump) / s.JUMP; s.jy = Math.sin(p * Math.PI) * 20; } else s.jy = 0;
    // end of the flight: step down to the next one
    if (this.uAt(s, s.f, s.x) >= 0.995) {
      if (s.f === 3) { SFX('door'); return (s.end = { win: true, stars: stars3(s.hits === 0, s.pants > 1), line: s.hits ? 'We made it. Mostly.' : 'Not a scratch on the jetter. Or on us.' }); }
      s.f++; s.x = s.fl[s.f].a; s.score += 100; POP(s, s.x, s.fl[s.f].ya - 30, 'LANDING!', '#9fe07a');
    }
    // cracked boards
    for (const h of s.holes) if (h.f === s.f && !h.used && s.jy < 3 && Math.abs(this.uAt(s, s.f, s.x) - h.u) < 0.018) { h.used = true; this.ouch(s, 'CRACK!'); if (s.end) return; }
    // rolling junk: starts at the top, rolls down every flight, faster than you walk
    s.next -= dt; if (s.next <= 0) { s.cans.push({ f: 0, x: 40, k: s.rnd() < 0.7 ? 'can' : 'basket', v: (150 + s.rnd() * 40) * [0.9, 1, 1.1][s.diff], spin: 0, scored: false }); s.next = [3.2, 2.5, 1.9][s.diff] * (0.7 + s.rnd() * 0.6); }
    for (const c of s.cans) {
      const CF = s.fl[c.f]; c.x += Math.sign(CF.b - CF.a) * c.v * dt; c.spin += dt * 12;
      if (this.uAt(s, c.f, c.x) >= 1) { c.f++; if (c.f > 3) { c.gone = true; continue; } c.x = s.fl[c.f].a; c.bounce = 0.3; }
      c.bounce = Math.max(0, (c.bounce || 0) - dt);
      if (c.f === s.f && Math.abs(c.x - s.x) < 8) {
        if (s.jy > 8) { if (!c.scored) { c.scored = true; s.score += 100; POP(s, s.x, this.yAt(s, s.f, s.x) - 40, '+100', '#f7c418'); SFX('ui_tap'); } }
        else if (s.inv <= 0) { c.gone = true; PUFF(s, c.x, this.yAt(s, c.f, c.x) - 6, c.k === 'can' ? '#d8d0e8' : '#c9a36a', 14, 80); this.ouch(s, c.k === 'can' ? 'BONK!' : 'LAUNDRY!'); if (s.end) return; }
      }
    }
    s.cans = s.cans.filter(c => !c.gone);
  },
  ouch(s, word) {
    s.pants--; s.hits++; s.inv = 1.4; s.shake = 0.35; POP(s, s.x, this.yAt(s, s.f, s.x) - 44, word, '#e9665a'); SFX('clog');
    if (s.pants <= 0) s.end = { win: false, stars: 0, line: `Down the stairs the fast way. The jetter is fine. ${s.hero === 'rod' ? 'Rod' : 'Matt'} is not.` };
  },
  draw(s) {
    const cellar = BGI('bg_stairs');
    if (!cellar) { R(0, 0, W, H, '#2a2420'); for (let i = 0; i < 9; i++) R(0, 20 + i * 30, W, 1, '#332c27');   // basement wall
    R(0, H - 14, W, 14, '#4a4f55'); }                                                              // the floor at the bottom
    for (let i = 0; i < 4; i++) {
      const F = s.fl[i], n = 20;
      for (let k = 0; k < n; k++) { const u = k / n, x = lerp(F.a, F.b, u), y = lerp(F.ya, F.yb, u), w = (F.b - F.a) / n;
        const hole = s.holes.some(h => h.f === i && Math.abs(h.u - (u + 0.5 / n)) < 0.03);
        R(Math.min(x, x + w), y, Math.abs(w) + 1, 6, hole ? '#3a2a1a' : '#a8794a'); R(Math.min(x, x + w), y, Math.abs(w) + 1, 2, hole ? '#2a1e12' : '#c99662');
        if (hole) { R(Math.min(x, x + w) + 4, y + 1, 2, 4, '#1a120a'); R(Math.min(x, x + w) + 10, y + 2, 3, 3, '#1a120a'); } }
      R(F.b - 2, F.yb, 4, 32, '#6b4a2e');   // a post at each landing
      for (let k = 0; k < n; k += 2) { const x = lerp(F.a, F.b, k / n), y = lerp(F.ya, F.yb, k / n); R(x - 1, y - 16, 2, 16, '#5a3c22'); R(Math.min(x, x + (F.b - F.a) / n * 2), y - 17, Math.abs(F.b - F.a) / n * 2 + 1, 2, '#6b4a2e'); }   // railing posts + handrail
    }
    // the customer up top, watching
    if (!cellar) { R(14, 24, 24, 48, '#1a1410'); R(16, 26, 20, 46, '#e8c878'); R(16, 26, 20, 3, '#fff2c0'); }   // the door at the top, light spilling out
    for (const c of s.cans) { const y = this.yAt(s, c.f, c.x) - 6 - Math.sin((c.bounce || 0) * 10) * 6;
      if (c.k === 'can') { R(c.x - 6, y - 6, 12, 12, '#bfc4cc'); R(c.x - 6, y - 6 + (Math.floor(c.spin) % 3) * 4, 12, 3, '#6aa0e0'); }
      else { R(c.x - 9, y - 7, 18, 13, '#c9a36a'); R(c.x - 9, y - 7, 18, 3, '#e8e4d8'); for (let k = 0; k < 4; k++) R(c.x - 7 + k * 4, y - 2, 2, 7, '#8a6a3a'); } }
    const py = this.yAt(s, s.f, s.x) - s.jy, dirF = Math.sign(s.fl[s.f].b - s.fl[s.f].a);
    if (s.cans.some(c => c.f === s.f && (s.x - c.x) * dirF > 0 && (s.x - c.x) * dirF < 120) && Math.floor(s.t * 8) % 2) T('!', s.x - dirF * 18, py - 50, '#e9665a', 10, 'center');
    if (s.inv <= 0 || Math.floor(s.t * 10) % 2) { SPR(s.hero || 'matt', WALK(s.hero || 'matt', s.t, s.facing > 0 ? 6 : 8), s.x, py, s.facing < 0 && !!IMG[(s.hero || 'matt') + '_more'], cellar ? 1.4 : 1); if (!SPI('jetter', s.x - 15 * s.facing, py - 10, 0.42, s.facing < 0)) { R(s.x - 12 * s.facing - 7, py - 22, 14, 12, '#e8822a'); R(s.x - 12 * s.facing - 5, py - 26, 10, 4, '#333'); } }   // carrying the jetter
    DRAWFX(s); HUD(s, 'STAIRS OF DEATH', null); PANTS(s, W - 6 - s.pantsMax * 14, 20); T(`FLIGHT ${s.f + 1}/4`, 6, 24, '#fff', 6);
  },
});

// =====================================================================
// 14. DOG HERDING — little dogs flee from you; push them into the van.
GAMES.push({
  id: 'dogs', name: 'DOG ROUNDUP', tag: 'The farm sewer inspection',
  how: ['The little dogs got out of the van. Again.', 'Dogs run AWAY from you. Get behind one and push it toward the open van door.', 'Once a dog is inside, it stays.', 'Get at least 4 of the 5 back in before time is up.'],
  ctl: '◀ ▶ ▲ ▼ MOVE (OR DRAG)',
  act: null,
  init(s) {
    s.TIME = [60, 50, 42][s.diff]; s.px = 400; s.py = 140;
    s.pen = { x: 420, y: 96, w: 50, h: 88 };
    s.dogs = []; for (let i = 0; i < 5; i++) s.dogs.push({ x: 60 + s.rnd() * 240, y: 40 + s.rnd() * 200, vx: 0, vy: 0, in: false, wt: 0, col: ['#d9b07a', '#fff', '#5a3a22', '#222', '#c98a4a'][i] });
  },
  update(s, dt, I) {
    s.t += dt;
    mover(s, I, dt, 135 * HERO(s).spd, 10, 412, 26, H - 10);
    const P = s.pen;
    for (const d of s.dogs) {
      if (d.in) { d.x = clamp(d.x, P.x + 8, P.x + P.w - 8); d.y = clamp(d.y, P.y + 10, P.y + P.h - 10); continue; }
      const dx = d.x - s.px, dy = d.y - s.py, dist = Math.hypot(dx, dy);
      let ax = 0, ay = 0;
      if (dist < 75) { ax = dx / dist * 1; ay = dy / dist * 1; }
      else { d.wt -= dt; if (d.wt <= 0) { d.wt = 1 + s.rnd() * 1.5; d.wx = (s.rnd() - .5); d.wy = (s.rnd() - .5); } ax = d.wx * 0.4; ay = d.wy * 0.4; }
      for (const o of s.dogs) if (o !== d && !o.in) { const ex = d.x - o.x, ey = d.y - o.y, e = Math.hypot(ex, ey); if (e < 16 && e > 0) { ax += ex / e * .6; ay += ey / e * .6; } }
      // wall avoidance: slide along walls instead of pinning in corners
      if (d.x < 26) ax += 1.2; if (d.x > 412 && !(d.y > P.y && d.y < P.y + P.h)) ax -= 1.2; if (d.y < 36) ay += 1.2; if (d.y > H - 20) ay -= 1.2;
      const sp = dist < 75 ? 92 * Math.sqrt(s.k) : 30;
      const m = Math.hypot(ax, ay) || 1; d.vx = lerp(d.vx, ax / m * sp, Math.min(1, dt * 6)); d.vy = lerp(d.vy, ay / m * sp, Math.min(1, dt * 6));
      d.x = clamp(d.x + d.vx * dt, 14, W - 14); d.y = clamp(d.y + d.vy * dt, 30, H - 12);
      const atDoor = d.y > P.y + 4 && d.y < P.y + P.h - 4;
      if (atDoor && d.x > P.x + 4) d.in = true;
      else if (!atDoor && d.x > P.x - 2) d.x = P.x - 2;
    }
    const n = s.dogs.filter(d => d.in).length; s.n = n;
    if (n === 5) s.end = { win: true, stars: stars3(s.t < s.TIME * 0.5, s.t < s.TIME * 0.8), line: `All 5 dogs in by ${s.t.toFixed(0)} seconds.` };
    else if (s.t >= s.TIME) s.end = n >= 4 ? { win: true, stars: 1, line: 'Four of five. The fifth one is in the sewer hole.' } : { win: false, stars: 0, line: `Only ${n} rounded up. The farmer is not impressed.` };
  },
  draw(s) {
    R(0, 0, W, H, '#6f9a4f'); for (let i = 0; i < 60; i++) R((i * 71) % W, (i * 43) % H, 3, 2, '#7fae5c');
    const P = s.pen; R(P.x - 4, P.y - 30, 64, P.h + 60, '#2c6cd6'); R(P.x, P.y, P.w, P.h, '#3b3d44'); R(P.x - 4, P.y - 30, 64, 12, '#f7c418');
    T('VAN', P.x + 26, P.y - 24, '#000', 6, 'center');
    R(200, 200, 26, 26, '#555'); C(213, 213, 9, '#222');                         // the inspection hole
    s.dogs.forEach((d, i) => { if (SPI((i % 2 ? 'lab_' : 'dog_') + (Math.floor(s.t * 8 + i) % 2), d.x, d.y + 6, 0.6, d.vx < 0)) return; R(d.x - 6, d.y - 4, 12, 8, d.col); R(d.x + (d.vx >= 0 ? 4 : -8), d.y - 6, 4, 4, d.col); R(d.x + (d.vx >= 0 ? -8 : 6), d.y - 3, 3, 2, d.col); });
    SPR(s.hero || 'matt', 7, s.px, s.py + 14);
    HUD(s, 'DOG ROUNDUP', s.TIME - s.t); T('IN VAN ' + (s.n || 0) + '/5', 6, 28, '#fff', 8);
  },
});

// =====================================================================
// 15. UNDER THE TRAILER — a Pac-Man homage in a dark crawlspace. Grab the parts, dodge the rats, fix the joint.
const CRAWL_MAP = [
  '#######################',
  '#.....#.........#.....#',
  '#.###.#.###.###.#.###.#',
  '#.#.................#.#',
  '#.#.###.##.#.##.###.#.#',
  '#.......#..#..#.......#',
  '#.#.###.#.###.#.###.#.#',
  '#.#.................#.#',
  '#.###.#.###.###.#.###.#',
  '#.....#.........#.....#',
  '#######################',
];
GAMES.push({
  id: 'crawl', name: 'UNDER THE TRAILER', tag: 'Dark crawlspace · detached pipe',
  how: ['Army-crawl through the crawlspace with the arrows. Pick up the crumbs of insulation for points.', 'Find the 3 parts: a FERNCO, a CLAMP and a length of PIPE. Then reach the broken joint (the drip).', 'The rats chase you. Grab a FLASHLIGHT and they run. Bump a scared rat to shoo it home.', 'Three rat bites and you are out of pants.'],
  ctl: 'ARROWS = CRAWL',
  act: null, phone: 'swipe or hold the d-pad to crawl.',
  init(s) {
    s.Z = 20; s.ox = 10; s.oy = 30; s.map = CRAWL_MAP.map(r => r.split(''));
    s.dots = new Set(); for (let r = 0; r < s.map.length; r++) for (let c = 0; c < 23; c++) if (s.map[r][c] === '.') s.dots.add(r * 100 + c);
    s.p = { c: 11, r: 9, x: 11, y: 9, d: [0, 0], want: [0, 0] }; s.dots.delete(911);
    s.parts = [{ c: 1, r: 1, k: 'FERNCO' }, { c: 21, r: 9, k: 'CLAMP' }, { c: 1, r: 9, k: 'PIPE' }]; s.got = [];
    s.lights = [{ c: 21, r: 1 }, { c: 11, r: 3 }]; s.scare = 0; s.joint = { c: 11, r: 1 };
    for (const o of [...s.parts, ...s.lights, s.joint]) s.dots.delete(o.r * 100 + o.c);
    s.D0 = s.dots.size;
    const nR = [2, 3, 4][s.diff], homes = [[9, 5], [13, 5], [10, 5], [12, 7]];
    s.rats = []; for (let i = 0; i < nR; i++) s.rats.push({ c: homes[i][0], r: homes[i][1], x: homes[i][0], y: homes[i][1], d: [0, 0], home: homes[i], wait: i * 1.6, out: 0 });
    s.pantsMax = s.pants = 3; s.inv = 0; s.hits = 0; s.score = 0; s.SP = 4.6 * HERO(s).spd; s.RSP = [2.8, 3.3, 3.8][s.diff];
  },
  open(s, c, r) { return r >= 0 && r < s.map.length && c >= 0 && c < 23 && s.map[r][c] !== '#'; },
  // one grid step-mover shared by you and the rats: glide between cell centers, pick a new way at each center
  step(s, a, sp, dt, choose) {
    let left = sp * dt;
    while (left > 0) {
      const tx = a.c + a.d[0], ty = a.r + a.d[1];
      if (a.d[0] || a.d[1]) {
        const dist = Math.abs(tx - a.x) + Math.abs(ty - a.y), m = Math.min(left, dist);
        a.x += a.d[0] * m; a.y += a.d[1] * m; left -= m;
        // reverse at any time (feels right in pac-man)
        if (dist - m > 1e-6) { if (a.want && a.want[0] === -a.d[0] && a.want[1] === -a.d[1] && (a.want[0] || a.want[1])) { a.c = tx; a.r = ty; a.d = a.want.slice(); } return; }
        a.c = tx; a.r = ty; a.x = tx; a.y = ty;
      }
      const nd = choose(a); if (!nd || !(nd[0] || nd[1]) || !this.open(s, a.c + nd[0], a.r + nd[1])) { a.d = [0, 0]; return; }
      a.d = nd; if (left <= 0) return;
    }
  },
  update(s, dt, I) {
    s.t += dt; FX(s, dt); s.inv -= dt; s.scare -= dt;
    const p = s.p;
    if (I.L) p.want = [-1, 0]; if (I.R) p.want = [1, 0]; if (I.U) p.want = [0, -1]; if (I.D) p.want = [0, 1];
    if (I.ptr.down) { const vx = I.ptr.x - (s.ox + p.x * s.Z + 10), vy = I.ptr.y - (s.oy + p.y * s.Z + 10); if (Math.hypot(vx, vy) > 12) p.want = Math.abs(vx) > Math.abs(vy) ? [Math.sign(vx), 0] : [0, Math.sign(vy)]; }
    this.step(s, p, s.SP, dt, a => this.open(s, a.c + a.want[0], a.r + a.want[1]) ? a.want.slice() : a.d);
    const k = p.r * 100 + p.c;
    if (s.dots.delete(k)) { s.score += 10; if (s.dots.size % 4 === 0) SFX('ui_tap', { vol: 0.25 }); }
    for (const pt of s.parts) if (!pt.got && pt.c === p.c && pt.r === p.r) { pt.got = true; s.got.push(pt.k); s.score += 200; POP(s, s.ox + p.c * s.Z + 10, s.oy + p.r * s.Z - 4, 'GOT ' + pt.k, '#9fe07a'); SFX('ui_select'); }
    for (const L of s.lights) if (!L.got && L.c === p.c && L.r === p.r) { L.got = true; s.scare = [7, 6, 5][s.diff] * HERO(s).steady; POP(s, s.ox + p.c * s.Z + 10, s.oy + p.r * s.Z - 4, 'FLASHLIGHT!', '#f7c418'); SFX('click'); }
    if (p.c === s.joint.c && p.r === s.joint.r) {
      if (s.got.length === 3) { SFX('drill_stop'); return (s.end = { win: true, stars: stars3(s.hits === 0 && s.dots.size < s.D0 * 0.5, s.hits < 2), line: 'Fernco on, clamps tight. No more drip.' }); }
      if (!s.warned) { s.warned = 1.5; POP(s, s.ox + p.c * s.Z + 10, s.oy + p.r * s.Z + 26, `NEED ${3 - s.got.length} MORE PART${s.got.length === 2 ? '' : 'S'}`, '#e9665a'); }
    }
    if (s.warned) { s.warned -= dt; if (s.warned <= 0 && !(p.c === s.joint.c && p.r === s.joint.r)) s.warned = 0; }
    // rats: chase when it is dark, scatter when the flashlight is on
    for (const r of s.rats) {
      if (r.wait > 0) { r.wait -= dt; continue; }
      const scared = s.scare > 0 && !r.shooed, sp = r.shooed ? 6 : scared ? s.RSP * 0.6 : s.RSP;
      this.step(s, r, sp, dt, a => {
        const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(d => this.open(s, a.c + d[0], a.r + d[1]) && !(d[0] === -a.d[0] && d[1] === -a.d[1] && (a.d[0] || a.d[1])));
        if (!opts.length) return [-a.d[0], -a.d[1]];
        const corner = [[1, 1], [21, 1], [1, 9], [21, 9]][s.rats.indexOf(r) % 4], scatter = (s.t % 20) < 6;   // like the ghosts: they wander off to their corners every so often
        const tgt = r.shooed ? { c: r.home[0], r: r.home[1] } : scatter ? { c: corner[0], r: corner[1] } : { c: p.c + p.d[0] * 2, r: p.r + p.d[1] * 2 };
        if (s.rnd() < [0.35, 0.22, 0.12][s.diff]) return opts[Math.floor(s.rnd() * opts.length)];
        const dist = d => Math.hypot(a.c + d[0] - tgt.c, a.r + d[1] - tgt.r);
        opts.sort((u, v) => (scared ? dist(v) - dist(u) : dist(u) - dist(v))); return opts[0];
      });
      if (r.shooed && r.c === r.home[0] && r.r === r.home[1]) { r.shooed = false; r.wait = 2; }
      if (Math.hypot(r.x - p.x, r.y - p.y) < 0.6) {
        if (scared) { r.shooed = true; s.score += 200; POP(s, s.ox + r.x * s.Z + 10, s.oy + r.y * s.Z, 'SHOO!', '#f7c418'); SFX('squish'); }
        else if (!r.shooed && s.inv <= 0) {
          s.pants--; s.hits++; s.inv = 1.8; s.shake = 0.35; PUFF(s, s.ox + p.x * s.Z + 10, s.oy + p.y * s.Z + 10, '#8a7a6a', 14, 70); POP(s, s.ox + p.x * s.Z + 10, s.oy + p.y * s.Z - 6, 'RAT BITE!', '#e9665a'); SFX('clog');
          if (s.pants <= 0) return (s.end = { win: false, stars: 0, line: 'The rats own this crawlspace. We are coming back with traps.' });
        }
      }
    }
  },
  draw(s) {
    const Z = s.Z, X = c => s.ox + c * Z, Y = r => s.oy + r * Z;
    R(0, 0, W, H, '#14110e');
    const dirt = MG('bg_crawl'); if (dirt) g.drawImage(dirt, 0, 40, 480, 230, X(0), Y(0), 23 * Z, s.map.length * Z);
    for (let r = 0; r < s.map.length; r++) for (let c = 0; c < 23; c++) {
      if (s.map[r][c] === '#') { R(X(c), Y(r), Z, Z, '#5a5a56'); R(X(c), Y(r), Z, 3, '#7a7a72'); R(X(c), Y(r) + Z - 2, Z, 2, '#3a3a38'); if ((r * 7 + c) % 5 === 0) R(X(c) + 6, Y(r) + 8, 6, 3, '#2a2a28'); }   // cinder blocks + piers
      else if (!dirt) { R(X(c), Y(r), Z, Z, '#4a3a28'); if ((r * 13 + c * 7) % 6 === 0) R(X(c) + 4, Y(r) + 12, 3, 2, '#3a2c1e'); }   // dirt
    }
    for (const k of s.dots) { const c = k % 100, r = Math.floor(k / 100); R(X(c) + 9, Y(r) + 9, 3, 3, '#f0b8c8'); }   // pink insulation crumbs
    for (const pt of s.parts) if (!pt.got) { const x = X(pt.c) + 10, y = Y(pt.r) + 10, b = Math.sin(s.t * 5) * 2;
      if (SPC(pt.k === 'FERNCO' ? 'coupling' : pt.k === 'CLAMP' ? 'waxring' : 'pvc_1', x, y + b, pt.k === 'PIPE' ? 0.45 : 0.5)) continue;
      if (pt.k === 'FERNCO') { R(x - 6, y - 5 + b, 12, 10, '#2b2b2b'); R(x - 7, y - 4 + b, 14, 2, '#c9c4b8'); R(x - 7, y + 2 + b, 14, 2, '#c9c4b8'); }
      else if (pt.k === 'CLAMP') { C(x, y + b, 6, '#c9c4b8'); C(x, y + b, 3, '#4a3a28'); R(x + 4, y - 2 + b, 5, 4, '#c9c4b8'); }
      else { R(x - 8, y - 3 + b, 16, 6, '#e8e4d8'); R(x - 8, y - 3 + b, 16, 2, '#fff'); } }
    for (const L of s.lights) if (!L.got) { const x = X(L.c) + 10, y = Y(L.r) + 10; if (SPC('flashlight', x, y, 0.5)) continue; R(x - 6, y - 3, 10, 6, '#f7c418'); R(x + 4, y - 4, 3, 8, '#fff6c0'); }
    // the broken joint: a dripping pipe
    { const x = X(s.joint.c), y = Y(s.joint.r); R(x - 4, y + 2, 12, 6, '#e8e4d8'); R(x + 14, y + 4, 10, 6, '#e8e4d8'); const d = (s.t * 1.5) % 1; R(x + 10, y + 8 + d * 10, 2, 3, '#7a5a2e'); }
    for (const r of s.rats) { const x = X(r.x) + 10, y = Y(r.y) + 12, scared = s.scare > 0 && !r.shooed, col = r.shooed ? '#3a3a3a' : scared && (s.scare > 1.5 || Math.floor(s.t * 8) % 2) ? '#6a8ad8' : '#6a5a4c';
      if (SPI('rat_' + (Math.floor(s.t * 8) % 2), x, y + 5, 0.55, (r.d && r.d[0]) < 0, r.shooed ? 0.3 : scared && Math.floor(s.t * 8) % 2 ? 0.55 : 1)) continue;
      R(x - 7, y - 4, 12, 7, col); R(x + 4, y - 3, 4, 4, col); R(x + 6, y - 2, 1, 1, '#e9665a'); R(x - 11, y - 1, 5, 1, '#c9a0a0'); R(x - 5 + Math.floor(s.t * 10) % 2 * 3, y + 3, 2, 2, col); }
    // you: crawling on your belly, headlamp ahead
    const p = s.p, px = X(p.x) + 10, py = Y(p.y) + 10;
    if (s.inv <= 0 || Math.floor(s.t * 10) % 2) { const h = p.d[0] || p.d[1] ? p.d : [1, 0], vert = h[1] !== 0;
      R(px - (vert ? 5 : 9), py - (vert ? 9 : 5), vert ? 10 : 18, vert ? 18 : 10, s.hero === 'rod' ? '#22325e' : '#2a3d78');
      R(px + h[0] * 7 - 3, py + h[1] * 7 - 3, 7, 7, '#e8b48a'); R(px + h[0] * 10 - 1, py + h[1] * 10 - 1, 3, 3, '#fff6c0'); }
    // darkness: you only see around your headlamp (wider with a flashlight)
    const rad = s.scare > 0 ? 180 : 105, gr = g.createRadialGradient(px, py, rad * 0.35, px, py, rad);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(6,5,4,0.74)'); g.fillStyle = gr; g.fillRect(0, 16, W, H - 16);
    DRAWFX(s); HUD(s, 'UNDER THE TRAILER', null); PANTS(s, 6, 20);
    T('PARTS ' + ['FERNCO', 'CLAMP', 'PIPE'].map(k => s.got.includes(k) ? k : '----').join(' '), W - 6, 24, '#9fe07a', 6, 'right');
  },
});

// =====================================================================
// 16. LINE DETECTIVE — a whole house of plumbing. Run water at the fixtures, read what backs up and what's just slow, and name the pipe.
GAMES.push({
  id: 'detective', name: 'LINE DETECTIVE', tag: 'The hidden cesspool · the second inlet',
  how: ['Something in this house is blocked. The customer already told you one thing (shown in yellow).', 'Tap a fixture to run water there. BACKS UP = a full clog somewhere on its way to the tank. SLOW = a partial clog (only big fixtures like toilets, tubs and the washer show it).', 'Water from a fixture goes down its own pipe, down the stack, then along the main to the tank.', 'Tests are limited. When you know, hit GUESS and tap the pipe. On hard jobs there are TWO problems: the clog and a slow spot.'],
  ctl: '◀ ▶ PICK · SPACE = TEST/GUESS · ▼ = READY TO GUESS · ▲ = CAMERA',
  pad: false, phone: 'tap fixtures to test them, then GUESS and tap the pipe.',
  init(s) {
    // the house, in cross-section: upstairs, first floor, basement; two stacks (A left, B right) into the main and out to the tank
    s.seg = {
      t2: [70, 80, 120, 80, 120, 140], k: [52, 140, 120, 140], tub: [366, 80, 300, 80, 300, 140], sk: [356, 140, 300, 140], w: [226, 200, 300, 200], fd: [384, 214, 384, 228],
      A2: [120, 140, 120, 228], B2: [300, 140, 300, 200], B3: [300, 200, 300, 228],
      MA: [120, 228, 300, 228], MB: [300, 228, 384, 228], MC: [384, 228, 432, 228],
    };
    s.fix = [
      { id: 't2', name: 'TOILET', floor: 'UP', x: 58, y: 70, big: true, path: ['t2', 'A2', 'MA', 'MB', 'MC'] },
      { id: 'tub', name: 'TUB', floor: 'UP', x: 382, y: 70, big: true, path: ['tub', 'B2', 'B3', 'MB', 'MC'] },
      { id: 'k', name: 'KITCHEN', floor: '1ST', x: 44, y: 130, big: false, path: ['k', 'A2', 'MA', 'MB', 'MC'] },
      { id: 'sk', name: 'BATH SINK', floor: '1ST', x: 374, y: 130, big: false, path: ['sk', 'B2', 'B3', 'MB', 'MC'] },
      { id: 'w', name: 'WASHER', floor: 'BSMT', x: 212, y: 190, big: true, path: ['w', 'B3', 'MB', 'MC'] },
      { id: 'fd', name: 'FLOOR DRAIN', floor: 'BSMT', x: 384, y: 200, big: true, path: ['fd', 'MC'] },
      { id: 'co', name: 'CLEANOUT', floor: 'BSMT', x: 150, y: 206, big: true, path: ['MA', 'MB', 'MC'] },   // pop the cap at the bottom of stack A: is it standing full?
    ];
    const NOPART = ['k', 'sk', 'fd', 'A2', 'B2'];   // partial clogs show up only on big fixtures, so they hide where a test can pin them down
    const keys = Object.keys(s.seg), pickSeg = (not) => { let k; do k = keys[Math.floor(s.rnd() * keys.length)]; while (not.includes(k)); return k; };
    // the problems: easy = one full clog · normal = one clog, could be full or partial · hard = a full clog AND a slow spot somewhere else
    s.full = null; s.part = null;
    if (s.diff === 0) s.full = pickSeg([]);
    else if (s.diff === 1) { if (s.rnd() < 0.5) s.full = pickSeg([]); else s.part = pickSeg(NOPART); }
    else {   // the slow spot has to be findable: some big fixture must run through it without hitting the full clog first
      let tries = 0; do { s.full = pickSeg([]); s.part = pickSeg([s.full, ...NOPART]); tries++; }
      while (tries < 50 && !s.fix.some(f => f.big && f.path.includes(s.part) && !f.path.includes(s.full)));
    }
    s.need = [s.full, s.part].filter(Boolean); s.found = [];
    s.tests = (s.diff === 2 ? 5 : 4) + (HERO(s).steady > 1 ? 1 : 0); s.used = 0; s.res = {}; s.mode = 'test'; s.sel = 0; s.anim = null; s.cam = s.camera ? 1 : 0; s.camMode = false; s.camRes = {};
    // the customer's complaint: one free result on a fixture the problem actually shows up at
    const shows = s.fix.filter(f => this.result(s, f) !== 'drain');
    const tell = shows.length ? shows[Math.floor(s.rnd() * shows.length)] : s.fix[0];
    s.res[tell.id] = this.result(s, tell); s.told = tell.id;
  },
  result(s, f) { if (s.full && f.path.includes(s.full)) return 'back'; if (s.part && f.big && f.path.includes(s.part)) return 'slow'; return 'drain'; },
  update(s, dt, I) {
    s.t += dt; FX(s, dt);
    if (s.anim) { s.anim.t += dt; if (s.anim.t > 1.4) s.anim = null; else return; }
    const segKeys = Object.keys(s.seg), list = s.mode === 'test' && !s.camMode ? s.fix.map(f => f.id) : segKeys;
    if (I.Lp) s.sel = (s.sel + list.length - 1) % list.length; if (I.Rp) s.sel = (s.sel + 1) % list.length;
    if (s.mode === 'test' && I.Dp) { s.mode = 'guess'; s.camMode = false; s.sel = 0; return; }   // keyboard: DOWN = guess, UP = camera
    if (s.mode === 'test' && I.Up && s.cam) { s.camMode = !s.camMode; s.sel = 0; return; }
    let pick = null, btn = null;
    if (I.ptr.clicked) {
      if (I.ptr.y > 246 && I.ptr.x > 360) btn = 'guess'; else if (I.ptr.y > 246 && I.ptr.x > 250 && I.ptr.x < 352 && s.cam) btn = 'cam';
      else if (s.mode === 'test' && !s.camMode) { const f = s.fix.find(f => Math.abs(I.ptr.x - f.x) < 32 && Math.abs(I.ptr.y - f.y) < 14); if (f) pick = f.id; }
      else { let best = null, bd = 12; for (const k in s.seg) { const d = this.dpoly(I.ptr.x, I.ptr.y, s.seg[k]); if (d < bd) { bd = d; best = k; } } pick = best; }
    }
    if (I.Ap) pick = list[s.sel];
    if (btn === 'guess' && s.mode === 'test') { s.mode = 'guess'; s.camMode = false; s.sel = 0; return; }
    if (btn === 'cam' && s.mode === 'test') { s.camMode = !s.camMode; s.sel = 0; return; }
    if (!pick) return;
    if (s.mode === 'test' && s.camMode) {   // one look with the sewer camera: is THIS pipe clear?
      s.cam = 0; s.camMode = false; s.camRes[pick] = pick === s.full ? 'CLOG' : pick === s.part ? 'BUILDUP' : 'CLEAR'; SFX('ui_select'); return;
    }
    if (s.mode === 'test') {
      if (s.res[pick] || s.tests <= 0) return;
      const f = s.fix.find(f => f.id === pick); s.res[pick] = this.result(s, f); s.tests--; s.used++; s.anim = { id: pick, t: 0 };
      SFX(s.res[pick] === 'back' ? 'gurgle' : s.res[pick] === 'slow' ? 'drips_loop' : 'drain', { vol: 0.5 });
      if (s.tests <= 0) { s.mode = 'guess'; s.sel = 0; }
      return;
    }
    // guessing
    if (s.found.includes(pick)) return;
    if (s.need.includes(pick)) {
      s.found.push(pick); SFX('ui_select'); POP(s, (s.seg[pick][0] + s.seg[pick][s.seg[pick].length - 2]) / 2, (s.seg[pick][1] + s.seg[pick][s.seg[pick].length - 1]) / 2 - 10, pick === s.full ? 'THE CLOG!' : 'THE SLOW SPOT!', '#7dffb0');
      if (s.found.length === s.need.length) s.end = { win: true, stars: stars3(s.used <= 2 + (s.diff === 2 ? 2 : 0), s.used <= 3 + (s.diff === 2 ? 2 : 0)), line: s.need.length > 1 ? `Found both problems in ${s.used} test${s.used === 1 ? '' : 's'}. Sherlock Rod.` : `Nailed it in ${s.used} test${s.used === 1 ? '' : 's'}. Detective work.` };
    } else { s.guess = pick; s.end = { win: false, stars: 0, line: "Wrong pipe. You dug up the lawn for nothing." }; }
  },
  dpoly(px, py, p) { let d = 1e9; for (let i = 0; i + 3 < p.length; i += 2) d = Math.min(d, this.dseg(px, py, p[i], p[i + 1], p[i + 2], p[i + 3])); return d; },
  dseg(px, py, x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy || 1, t = clamp(((px - x1) * dx + (py - y1) * dy) / l, 0, 1); return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)); },
  draw(s) {
    // the house in cross-section
    R(0, 0, W, H, '#8fb2c9'); R(10, 18, 412, 196, '#e8dcc6'); R(10, 150, 412, 64, '#bdb2a0');   // basement
    R(10, 84, 412, 4, '#8a7a60'); R(10, 148, 412, 4, '#8a7a60'); R(0, 214, W, 56, '#7a6a52'); for (let i = 0; i < 30; i++) R((i * 61) % W, 222 + (i * 17) % 44, 3, 2, '#6a5a44');
    g.fillStyle = '#7a3a2a'; g.beginPath(); g.moveTo(4, 20); g.lineTo(216, -4); g.lineTo(428, 20); g.fill();
    T('UPSTAIRS', 16, 26, '#8a7a60', 5); T('FIRST FLOOR', 16, 92, '#8a7a60', 5); T('BASEMENT', 16, 158, '#6a5e4c', 5);
    R(432, 210, 44, 34, '#8a8f94'); R(436, 214, 36, 26, '#6a6f74'); T('TANK', 454, 227, '#fff', 5, 'center');
    g.lineCap = 'round';
    const segKeys = Object.keys(s.seg), sel = (s.mode === 'guess' || s.camMode) ? segKeys[s.sel] : null;
    for (const k of segKeys) {
      const P = s.seg[k], found = s.found.includes(k), cam = s.camRes[k];
      g.strokeStyle = found ? '#7dffb0' : k === sel ? '#f7c418' : '#5d6168'; g.lineWidth = 9; g.beginPath(); g.moveTo(P[0], P[1]); for (let i = 2; i < P.length; i += 2) g.lineTo(P[i], P[i + 1]); g.stroke();
      g.strokeStyle = '#26231f'; g.lineWidth = 4; g.stroke();
      if (cam) T(cam, (P[0] + P[P.length - 2]) / 2, (P[1] + P[P.length - 1]) / 2 - 9, cam === 'CLEAR' ? '#27ae60' : '#c0392b', 5, 'center');
    }
    // water running down from the last fixture you tested
    if (s.anim) { const f = s.fix.find(f => f.id === s.anim.id), res = s.res[f.id], pts = [];
      const stopAt = res === 'back' ? f.path.indexOf(s.full) : f.path.length, p = Math.min(1, s.anim.t / 1.0) * (stopAt + 1);
      g.strokeStyle = res === 'slow' ? 'rgba(95,155,192,.5)' : '#5f9bc0'; g.lineWidth = 3;
      for (let i = 0; i < Math.min(p, f.path.length); i++) { const P = s.seg[f.path[i]], u = Math.min(1, p - i), n = P.length / 2 - 1, upto = u * n;
        g.beginPath(); g.moveTo(P[0], P[1]); for (let j = 0; j < n; j++) { const v = Math.min(1, Math.max(0, upto - j)); if (v <= 0) break; g.lineTo(P[j * 2] + (P[j * 2 + 2] - P[j * 2]) * v, P[j * 2 + 1] + (P[j * 2 + 3] - P[j * 2 + 1]) * v); } g.stroke(); } }
    const FIXSPR = { t2: 'toilet', tub: 'tub', k: 'kitchensink', sk: 'vanity', w: 'washer', fd: 'floordrain', co: 'cleanout' };
    s.fix.forEach(f => { const n = FIXSPR[f.id], im = n && MG(n); if (im) { const hh = (f.id === 'fd' || f.id === 'co') ? 16 : 28; SPI(n, f.x, f.y - 10, hh / im.height); } });
    s.fix.forEach((f, i) => {
      const hot = s.mode === 'test' && !s.camMode && s.sel === i, r = s.res[f.id];
      R(f.x - 31, f.y - 10, 62, 22, hot ? '#f7c418' : f.id === s.told ? '#e8b84a' : '#fff'); R(f.x - 29, f.y - 8, 58, 18, r === 'back' ? '#e9c8c0' : r === 'slow' ? '#efe2b8' : '#f4efe6');
      T(f.name, f.x, f.y - 2, '#333', 4, 'center', false);
      if (r) T(r === 'back' ? 'BACKS UP' : r === 'slow' ? 'SLOW' : 'DRAINS', f.x, f.y + 6, r === 'back' ? '#c0392b' : r === 'slow' ? '#b07a10' : '#27ae60', 4, 'center', false);
    });
    HUD(s, 'LINE DETECTIVE', null);
    const msg = s.mode === 'guess' ? (s.need.length > 1 ? `TAP THE PIPES: ${s.found.length}/2 FOUND` : 'TAP THE BLOCKED PIPE') : s.camMode ? 'CAMERA: TAP A PIPE TO LOOK INSIDE' : `TESTS LEFT ${s.tests}`;
    T(msg, W - 6, 8, '#f7c418', 7, 'right');
    T(`CUSTOMER SAYS: ${s.fix.find(f => f.id === s.told).name} ${s.res[s.told] === 'back' ? 'BACKS UP' : s.res[s.told] === 'slow' ? 'IS SLOW' : 'DRAINS'}`, 8, 256, '#f7c418', 5);
    if (s.diff === 2) T('TWO PROBLEMS: A CLOG + A SLOW SPOT', 8, 264, '#e9a05a', 4);
    if (s.mode === 'test') { R(362, 248, 112, 18, '#10151f'); T('GUESS >', 418, 257, '#fff', 6, 'center');
      if (s.cam) { R(254, 248, 98, 18, s.camMode ? '#2c6cd6' : '#10151f'); T('CAMERA (1)', 303, 257, '#fff', 5, 'center'); } }
    DRAWFX(s);
  },
});

// =====================================================================
// 17. PIPE INVADERS — a Space Invaders homage. The backup marches down the main; you shoot it with the jetter.
GAMES.push({
  id: 'flush', name: 'PIPE INVADERS', tag: 'The backup is marching down the main',
  how: ['A whole army of clogs is marching down the main line toward the cleanout.', 'Slide the jetter nozzle with ◀ ▶ and press SPACE to blast them.', 'They drip on you. Dodge the drips or lose a pair of pants.', 'Clear them all before they reach the bottom. The rubber duck up top is worth bonus.'],
  ctl: '◀ ▶ = SLIDE  ·  SPACE = BLAST',
  act: 'BLAST', phone: 'drag to slide, tap BLAST to shoot.', dpad: 'lr',
  init(s) {
    s.px = 240; s.py = 246; s.pantsMax = s.pants = [5, 4, 4][s.diff] + (HERO(s).grip > 1 ? 1 : 0); /* Rod's strong stomach: one more drip */ s.inv = 0; s.hits = 0; s.shots = []; s.drips = []; s.cool = 0; s.score = 0;
    s.ROWS = [3, 4, 5][s.diff]; s.COLS = 8; s.foes = [];
    const kinds = ['towel', 'grease', 'wipe', 'wipe', 'grease'];
    for (let r = 0; r < s.ROWS; r++) for (let c = 0; c < s.COLS; c++) s.foes.push({ x: 92 + c * 38, y: 40 + r * 24, k: kinds[r], hp: r === 0 ? 2 : 1, wob: s.rnd() * 6 });
    s.N0 = s.foes.length; s.dir = 1; s.step = 0; s.duck = null; s.nextDuck = 9; s.march = 0;
  },
  update(s, dt, I) {
    s.t += dt; FX(s, dt); s.inv -= dt; s.cool -= dt;
    mover1D(s, I, dt, 170 * HERO(s).spd, 30, W - 30);
    if ((I.A || I.Ap) && s.cool <= 0 && s.shots.length < (HERO(s).spd > 1 ? 3 : 2)) { s.shots.push({ x: s.px, y: s.py - 12 }); s.cool = 0.24; SFX('splash', { vol: 0.25, rate: 1.6 }); }
    for (const b of s.shots) b.y -= 330 * dt;
    // the march: the fewer clogs left, the faster they go (just like the original)
    const left = s.foes.length, sp = (14 + 70 * (1 - left / s.N0)) * [0.85, 1, 1.2][s.diff];
    let edge = false; for (const f of s.foes) { f.x += s.dir * sp * dt; if (f.x < 22 || f.x > W - 22) edge = true; }
    if (edge) { s.dir *= -1; for (const f of s.foes) { f.y += 10; f.x += s.dir * 3; } SFX('gurgle', { vol: 0.25 }); }
    s.march += dt * (1 + sp / 30);
    // drips
    if (left && s.drips.length < 2 + s.diff && s.rnd() < dt * (0.4 + s.diff * 0.2 + 0.3 * (1 - left / s.N0))) {   // only the bottom clog in a column can drip
      const f = s.foes[Math.floor(s.rnd() * left)], low = s.foes.filter(o => Math.abs(o.x - f.x) < 6).sort((a, b) => b.y - a.y)[0];
      s.drips.push({ x: low.x, y: low.y + 8, v: 62 + s.rnd() * 30 + s.diff * 12 }); }
    for (const d of s.drips) d.y += d.v * dt;
    // bonus duck
    s.nextDuck -= dt; if (!s.duck && s.nextDuck <= 0) { s.duck = { x: -20, v: 70 }; s.nextDuck = 14; }
    if (s.duck) { s.duck.x += s.duck.v * dt; if (s.duck.x > W + 20) s.duck = null; }
    // hits
    for (const b of s.shots) {
      if (s.duck && Math.abs(b.x - s.duck.x) < 12 && Math.abs(b.y - 26) < 8) { b.y = -99; POP(s, s.duck.x, 30, '+DUCK!', '#f7c418'); PUFF(s, s.duck.x, 26, '#f7c418', 14, 80); s.score += 300; s.duck = null; SFX('squish'); }
      for (const f of s.foes) if (f.hp > 0 && Math.abs(b.x - f.x) < 14 && Math.abs(b.y - f.y) < 10) {
        b.y = -99; f.hp--; PUFF(s, f.x, f.y, this.col(f.k), 8, 60);
        if (f.hp <= 0) { s.score += 50; SFX('squish', { vol: 0.5 }); if (s.rnd() < 0.25) POP(s, f.x, f.y, ['SPLOOSH', 'CLEAR', 'GONE'][Math.floor(s.rnd() * 3)]); } else SFX('clog', { vol: 0.4 });
        break;
      }
    }
    s.foes = s.foes.filter(f => f.hp > 0); s.shots = s.shots.filter(b => b.y > 10);
    for (const d of s.drips) if (s.inv <= 0 && Math.abs(d.x - s.px) < 9 && Math.abs(d.y - s.py) < 10) {
      d.y = 999; s.pants--; s.hits++; s.inv = 1.2; s.shake = 0.3; PUFF(s, s.px, s.py - 8, '#7a5a2e', 14, 70); POP(s, s.px, s.py - 24, 'DRIPPED ON', '#e9665a'); SFX('splash');
      if (s.pants <= 0) return (s.end = { win: false, stars: 0, line: 'Out of pants. The backup wins this round.' });
    }
    s.drips = s.drips.filter(d => d.y < H);
    if (s.foes.some(f => f.y > s.py - 18)) return (s.end = { win: false, stars: 0, line: 'It backed all the way up to the cleanout. Gross.' });
    if (!s.foes.length) { SFX('flush_big'); s.end = { win: true, stars: stars3(s.hits === 0, s.pants > 1), line: `Main line's clear! Score ${s.score + s.pants * 100}.` }; }
  },
  col(k) { return k === 'towel' ? '#e85a8e' : k === 'grease' ? '#2b2620' : '#e8e4d8'; },
  draw(s) {
    // inside the main: a long pipe, seen from the cleanout
    R(0, 0, W, H, '#1c1e1d'); R(14, 16, W - 28, H - 16, '#3b3f3c');
    for (let i = 0; i < 12; i++) { const y = 16 + ((i * 24 + s.march * 12) % (H - 16)); R(14, y, W - 28, 2, '#444945'); }   // pipe rings scroll as they march
    R(14, 16, 4, H, '#55594f'); R(W - 18, 16, 4, H, '#55594f');
    if (s.duck) { const x = s.duck.x; R(x - 8, 22, 14, 9, '#f7c418'); R(x + 2, 17, 8, 8, '#f7c418'); R(x + 9, 20, 4, 3, '#e8822a'); R(x + 5, 19, 2, 2, '#000'); }
    for (const f of s.foes) {
      const b = Math.sin(s.t * 6 + f.wob) * 1.5, x = f.x, y = f.y + b, fr = Math.floor(s.march * 2) % 2;
      if (f.k === 'towel') { R(x - 12, y - 7, 24, 14, f.hp > 1 ? '#e85a8e' : '#b84070'); R(x - 12, y - 3, 24, 2, '#fff'); R(x - 12, y + 2, 24, 2, '#fff'); R(x - 12 + (fr ? 0 : 20), y + 7, 4, 3, '#e85a8e'); }
      else if (f.k === 'grease' && SPC('grease', x, y, 0.62 + fr * 0.03)) {}
      else if (f.k !== 'grease' && SPC('tp', x, y, 0.62 + fr * 0.03)) {}
      else if (f.k === 'grease') { C(x, y, 9, '#2b2620'); C(x - 3, y - 3, 3, '#5a5040'); R(x - 9 + fr * 2, y + 6, 4, 4, '#2b2620'); R(x + 5 - fr * 2, y + 6, 4, 4, '#2b2620'); R(x - 4, y - 1, 2, 2, '#f7c418'); R(x + 2, y - 1, 2, 2, '#f7c418'); }
      else { R(x - 9, y - 7, 18, 14, '#e8e4d8'); R(x - 9, y - 7, 18, 3, '#d0ccc0'); R(x - 9 + fr * 14, y + 7, 4, 3, '#e8e4d8'); R(x - 4, y - 1, 2, 2, '#333'); R(x + 2, y - 1, 2, 2, '#333'); }
    }
    for (const d of s.drips) { if (SPC('glob_2', d.x, d.y, 0.32)) continue; R(d.x - 2, d.y - 4, 4, 6, '#7a5a2e'); R(d.x - 1, d.y - 7, 2, 3, '#7a5a2e'); }
    for (const b of s.shots) { R(b.x - 2, b.y - 8, 4, 12, '#9fd3ff'); R(b.x - 1, b.y + 4, 2, 6, '#5fa8e0'); }
    // the nozzle + the hero behind it
    if (s.inv <= 0 || Math.floor(s.t * 10) % 2) { R(s.px - 4, s.py - 14, 8, 10, '#c9c4b8'); R(s.px - 10, s.py - 4, 20, 8, '#e8822a'); R(s.px - 14, s.py + 4, 28, 6, '#333'); }
    SPR(s.hero || 'matt', 7, s.px + 30, H, false);
    DRAWFX(s); HUD(s, 'PIPE INVADERS', null); PANTS(s, 6, 20); T(`LEFT ${s.foes.length}`, W - 8, 24, '#fff', 6, 'right');
  },
});

// =====================================================================
// 18. POOP SWEEPER — minesweeper-lite. Cross the yard to the septic lid without stepping in it.
GAMES.push({
  id: 'poop', name: 'POOP SWEEPER', tag: 'The yard where three dogs live',
  how: ['Walk from the gate to the septic lid without stepping in dog poop.', 'Tap a square next to one you have uncovered to step there.', 'Numbers = how many poops touch that square (diagonals count).', 'Tap FLAG to mark poop you have figured out. You have spare boots.'],
  ctl: 'TAP A SQUARE  ·  OR ARROWS + SPACE  ·  FLAG BUTTON TO MARK',
  pad: false, phone: 'tap a square to step. Tap FLAG to mark poop.',
  init(s) {
    s.C = 12; s.Rw = 7; s.Z = 30; s.ox = 60; s.oy = 26;
    s.boots = s.bootsMax = [3, 3, 2][s.diff];
    const n = [9, 11, 13][s.diff];
    s.start = { c: 0, r: 3 }; s.goal = { c: 11, r: 3 };
    s.poop = new Set(); s.open = new Set(); s.flag = new Set(); s.stepped = new Set();
    const near = (c, r, p) => Math.abs(c - p.c) <= 1 && Math.abs(r - p.r) <= 1;
    while (s.poop.size < n) {
      const c = Math.floor(s.rnd() * s.C), r = Math.floor(s.rnd() * s.Rw);
      if (near(c, r, s.start) || (c === s.goal.c && r === s.goal.r)) continue;
      s.poop.add(c + ',' + r);
    }
    s.pos = { ...s.start }; s.cur = { c: 1, r: 3 }; s.flagMode = false; s.msg = ''; s.msgT = 0;
    this.reveal(s, s.start.c, s.start.r);
  },
  count(s, c, r) { let k = 0; for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if ((dc || dr) && s.poop.has((c + dc) + ',' + (r + dr))) k++; return k; },
  reveal(s, c, r) {
    const st = [[c, r]];
    while (st.length) { const [a, b] = st.pop(), k = a + ',' + b;
      if (a < 0 || b < 0 || a >= s.C || b >= s.Rw || s.open.has(k) || s.poop.has(k)) continue;
      s.open.add(k); s.flag.delete(k);
      if (this.count(s, a, b) === 0) for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if (dc || dr) st.push([a + dc, b + dr]); }
  },
  reachable(s, c, r) {             // can step onto any square touching an uncovered (or stepped-in) square
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) { const k = (c + dc) + ',' + (r + dr); if (s.open.has(k) || s.stepped.has(k)) return true; }
    return false;
  },
  update(s, dt, I) {
    s.t += dt; s.msgT = Math.max(0, s.msgT - dt);
    if (I.Lp) s.cur.c = Math.max(0, s.cur.c - 1); if (I.Rp) s.cur.c = Math.min(s.C - 1, s.cur.c + 1);
    if (I.Up) s.cur.r = Math.max(0, s.cur.r - 1); if (I.Dp) s.cur.r = Math.min(s.Rw - 1, s.cur.r + 1);
    let pick = null;
    if (I.ptr.clicked) {
      if (I.ptr.y > 244 && I.ptr.x > 330) { s.flagMode = !s.flagMode; }
      else { const c = Math.floor((I.ptr.x - s.ox) / s.Z), r = Math.floor((I.ptr.y - s.oy) / s.Z); if (c >= 0 && r >= 0 && c < s.C && r < s.Rw) { pick = { c, r }; s.cur = { c, r }; } }
    }
    if (I.Ap) pick = { ...s.cur };
    if (pick) {
      const k = pick.c + ',' + pick.r;
      if (s.flagMode) { if (!s.open.has(k)) { if (s.flag.has(k)) s.flag.delete(k); else s.flag.add(k); } }
      else if (s.flag.has(k)) { s.msg = 'FLAGGED. TAP FLAG TO UNMARK.'; s.msgT = 1.2; }
      else if (!s.open.has(k) && !s.stepped.has(k) && !this.reachable(s, pick.c, pick.r)) { s.msg = 'TOO FAR. STEP NEXT TO WHERE YOU HAVE BEEN.'; s.msgT = 1.2; }
      else if (s.poop.has(k)) { if (!s.stepped.has(k)) { s.stepped.add(k); s.boots--; SFX('squish'); s.shake = 0.3; s.msg = 'SQUISH!'; s.msgT = 1.2; } s.pos = { ...pick }; }
      else { this.reveal(s, pick.c, pick.r); s.pos = { ...pick }; }
    }
    if (s.boots <= 0) s.end = { win: false, stars: 0, line: 'Out of clean boots. The customer can find their own lid.' };
    else if (s.pos.c === s.goal.c && s.pos.r === s.goal.r) {
      const hits = s.bootsMax - s.boots;
      s.end = { win: true, stars: stars3(hits === 0, hits <= 1), line: hits ? `Made it to the lid. ${hits} squish${hits > 1 ? 'es' : ''}.` : 'Clean boots! Not a single squish.' };
    }
  },
  draw(s) {
    R(0, 0, W, H, '#5f8f43');
    R(s.ox - 18, s.oy + 3 * s.Z + 4, 12, s.Z - 8, '#8a6440'); T('GATE', s.ox - 12, s.oy + 3 * s.Z - 6, '#fff', 5, 'center');
    for (let c = 0; c < s.C; c++) for (let r = 0; r < s.Rw; r++) {
      const k = c + ',' + r, x = s.ox + c * s.Z, y = s.oy + r * s.Z;
      if (s.open.has(k)) { R(x, y, s.Z, s.Z, '#9cbf6e'); const n = this.count(s, c, r);
        if (n) T(String(n), x + s.Z / 2 + 1, y + s.Z / 2 + 1, ['', '#2e6fd6', '#2e8a3a', '#d6352e', '#6a2ea0', '#8a3a10'][Math.min(5, n)], 9, 'center'); }
      else { R(x, y, s.Z, s.Z, (c + r) % 2 ? '#4e7d36' : '#558a3b'); R(x + 6, y + 8, 2, 4, '#6fa04f'); R(x + 18, y + 16, 2, 4, '#6fa04f');
        if (this.reachable(s, c, r) && !s.end) { g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1; g.strokeRect(x + 1.5, y + 1.5, s.Z - 3, s.Z - 3); } }
      if ((s.stepped.has(k) || (s.end && s.poop.has(k))) && SPI(s.stepped.has(k) ? 'poop' : 'poopcorn', x + 15, y + 26, 0.8)) {} else if (s.stepped.has(k) || (s.end && s.poop.has(k))) { C(x + 15, y + 19, 7, '#5a3a1c'); C(x + 15, y + 14, 5, '#6b4423'); C(x + 15, y + 10, 3, '#7a4a1e'); }
      if (s.flag.has(k)) { R(x + 13, y + 6, 2, 18, '#333'); g.fillStyle = '#e9665a'; g.beginPath(); g.moveTo(x + 15, y + 6); g.lineTo(x + 24, y + 10); g.lineTo(x + 15, y + 14); g.fill(); }
    }
    { const f = Math.floor(s.t * 3) % 2; SPI('dog_' + f, 452, 70, 0.8, true); SPI('lab_' + (1 - f), 450, 130, 0.8, true); SPI('dog_' + (1 - f), 452, 190, 0.8, true); }
    const gx = s.ox + s.goal.c * s.Z, gy = s.oy + s.goal.r * s.Z; if (!SPC('septiclid', gx + 15, gy + 15, 0.5)) C(gx + 15, gy + 15, 11, '#8a8f94'); C(gx + 15, gy + 15, 8, '#a0a5aa'); T('LID', gx + 15, gy + 15, '#333', 5, 'center');
    g.strokeStyle = '#f7c418'; g.lineWidth = 2; g.strokeRect(s.ox + s.cur.c * s.Z + 1, s.oy + s.cur.r * s.Z + 1, s.Z - 2, s.Z - 2);
    SPR(s.hero || 'matt', 0, s.ox + s.pos.c * s.Z + 15, s.oy + s.pos.r * s.Z + 30);
    HUD(s, 'POOP SWEEPER', null);
    T('BOOTS ' + 'U'.repeat(s.boots) + '-'.repeat(s.bootsMax - s.boots), W - 6, 8, '#fff', 8, 'right');
    R(334, 246, 140, 20, s.flagMode ? '#e9665a' : '#10151f'); T(s.flagMode ? 'FLAG MODE: ON' : 'FLAG MODE: OFF', 404, 256, '#fff', 6, 'center');
    if (s.msgT > 0) T(s.msg, 170, 256, '#f7c418', 6, 'center');
  },
});

// =====================================================================
// 20. GREASE BOBBLE — a Bubble Bobble homage. Blow jetter bubbles to trap grease blobs, then pop them.
GAMES.push({
  id: 'bubble', name: 'GREASE BOBBLE', tag: 'Grease traps · fatbergs · the restaurant line',
  how: ['Grease blobs are loose in the trap room. Blow a jetter bubble (SPACE) to trap one.', 'Run into a trapped blob to POP it. Wait too long and it breaks out, angrier.', 'Jump with ▲. You can jump up through ledges.', 'Pop them all. Touch a loose blob and you lose a clean pair of pants.'],
  ctl: '◀ ▶ RUN  ·  ▲ JUMP  ·  SPACE = BUBBLE',
  act: 'BUBBLE',
  init(s) {
    s.TIME = 70; s.px = 60; s.py = 250; s.vx = 0; s.vy = 0; s.on = true; s.face = 1; s.pantsMax = s.pants = [5, 4, 3][s.diff]; s.inv = 1.5; s.cd = 0; s.pops = 0; s.combo = 0; s.comboT = 0;
    s.plat = [{ x: 0, y: 250, w: 480 }, { x: 40, y: 196, w: 150 }, { x: 290, y: 196, w: 150 }, { x: 140, y: 140, w: 200 }, { x: 20, y: 84, w: 130 }, { x: 330, y: 84, w: 130 }];
    const spots = [[100, 196], [360, 196], [240, 140], [80, 84], [400, 84], [300, 250], [200, 196]];
    s.foes = []; const n = [4, 5, 7][s.diff];
    for (let i = 0; i < n; i++) { const [x, y] = spots[i % spots.length]; s.foes.push({ x: x + (s.rnd() - .5) * 20, y, vx: (s.rnd() < .5 ? -1 : 1) * (28 + 10 * s.diff), vy: 0, st: 'walk', t: 0, angry: false, kind: i % 3 === 2 ? 'wipe' : 'grease' }); }
    s.bubs = []; s.loot = [];
  },
  ground(s, x, yPrev, y) { for (const p of s.plat) if (x > p.x - 4 && x < p.x + p.w + 4 && yPrev <= p.y && y >= p.y) return p.y; return null; },
  update(s, dt, I) {
    s.t += dt; FX(s, dt); const H = HERO(s);
    s.inv = Math.max(0, s.inv - dt); s.cd = Math.max(0, s.cd - dt); s.comboT = Math.max(0, s.comboT - dt); if (s.comboT <= 0) s.combo = 0;
    // run + jump (one-way ledges)
    let mv = (I.R ? 1 : 0) - (I.L ? 1 : 0); if (I.ptr.down && I.ptr.y > 60) mv = I.ptr.x < s.px - 10 ? -1 : I.ptr.x > s.px + 10 ? 1 : 0;
    if (mv) s.face = mv;
    s.vx += (mv * 130 * H.spd - s.vx) * Math.min(1, dt * 12);
    if ((I.Up || (I.ptr.clicked && I.ptr.y < s.py - 30)) && s.on) { s.vy = -335; s.on = false; SFX('bubble', { vol: 0.4, rate: 1.4 }); }
    s.vy += 760 * dt; const py0 = s.py; s.px = clamp(s.px + s.vx * dt, 12, W - 12); s.py += s.vy * dt;
    s.on = false; if (s.vy >= 0) { const gy = this.ground(s, s.px, py0, s.py); if (gy != null) { s.py = gy; s.vy = 0; s.on = true; } }
    if (s.py > 250) { s.py = 250; s.vy = 0; s.on = true; }
    // blow a bubble
    if ((I.Ap || (I.ptr.clicked && I.ptr.y >= s.py - 30 && Math.abs(I.ptr.x - s.px) < 40)) && s.cd <= 0) { s.cd = 0.35; s.bubs.push({ x: s.px + s.face * 12, y: s.py - 18, vx: s.face * 260, vy: 0, t: 0, foe: null }); SFX('bubble', { vol: 0.6 }); }
    for (const b of s.bubs) {
      b.t += dt;
      if (!b.foe) { b.vx *= Math.pow(0.06, dt); if (Math.abs(b.vx) < 30) b.vy = -22; }
      else { b.vx = Math.sin(b.t * 2) * 12; b.vy = -18; }
      b.x = clamp(b.x + b.vx * dt, 14, W - 14); b.y = Math.max(28, b.y + b.vy * dt);
      if (!b.foe) for (const f of s.foes) if (f.st !== 'trapped' && f.st !== 'gone' && Math.abs(f.x - b.x) < 16 && Math.abs(f.y - 10 - b.y) < 16 && b.t < 1.6) { b.foe = f; f.st = 'trapped'; b.t = 0; POP(s, b.x, b.y - 16, 'GOTCHA!', '#9fd1ff'); break; }
      // touch a trapped blob to pop it
      if (b.foe && Math.abs(b.x - s.px) < 16 && Math.abs(b.y - (s.py - 16)) < 22) {
        b.dead = true; b.foe.st = 'gone'; s.pops++; s.combo++; s.comboT = 1.2;
        const pts = 100 * s.combo; POP(s, b.x, b.y - 10, s.combo > 1 ? `x${s.combo} COMBO!` : '+100', '#f7c418');
        PUFF(s, b.x, b.y, b.foe.kind === 'wipe' ? '#f4f4f2' : '#c9a640', 16, 110); SFX('splash', { vol: 0.6 });
        s.loot.push({ x: b.x, y: b.y, vy: -60, kind: s.rnd() < .5 ? 'soap' : 'coffee' });
      }
      if (b.foe && b.t > 5.5) { b.dead = true; b.foe.st = 'walk'; b.foe.angry = true; b.foe.x = b.x; b.foe.y = b.y + 10; b.foe.vx = (s.rnd() < .5 ? -1 : 1) * 70; POP(s, b.x, b.y, 'IT BROKE OUT!', '#e9665a'); }
      if (!b.foe && b.t > 4) b.dead = true;
    }
    s.bubs = s.bubs.filter(b => !b.dead);
    // blobs walk the ledges and turn at the edges; wipes drift toward you
    for (const f of s.foes) {
      if (f.st !== 'walk') continue; f.t += dt;
      if (f.kind === 'wipe') { const dx = s.px - f.x, dy = (s.py - 10) - f.y, d = Math.hypot(dx, dy) || 1, sp = (f.angry ? 55 : 30) * s.k; f.x += dx / d * sp * dt; f.y += dy / d * sp * dt; }
      else {
        const sp = f.angry ? 1.8 : 1; f.x += f.vx * sp * dt; f.vy += 760 * dt; const y0 = f.y; f.y += f.vy * dt;
        if (f.vy >= 0) { const gy = this.ground(s, f.x, y0, f.y); if (gy != null) { f.y = gy; f.vy = 0; } }
        if (f.y > 250) { f.y = 250; f.vy = 0; }
        const onPlat = s.plat.find(p => Math.abs(p.y - f.y) < 1 && f.x > p.x && f.x < p.x + p.w);
        if (onPlat && (f.x < onPlat.x + 6 || f.x > onPlat.x + onPlat.w - 6) && s.rnd() < 0.7) f.vx *= -1;
        if (f.x < 14 || f.x > W - 14) { f.vx *= -1; f.x = clamp(f.x, 14, W - 14); }
        if (f.vy === 0 && s.rnd() < dt * 0.4) f.vy = -300;
      }
      if (s.inv <= 0 && Math.abs(f.x - s.px) < 13 && Math.abs((f.y - 8) - (s.py - 16)) < 18) { s.pants--; s.inv = 2.0; s.shake = 0.3; s.vx = (s.px < f.x ? -1 : 1) * 220; s.vy = -200; s.on = false; PUFF(s, s.px, s.py - 16, '#6b4423', 12); POP(s, s.px, s.py - 40, 'SPLAT!', '#e9665a'); SFX('squish'); }
    }
    for (const l of s.loot) { l.vy += 400 * dt; const y0 = l.y; l.y += l.vy * dt; const gy = this.ground(s, l.x, y0, l.y); if (l.vy > 0 && gy != null) { l.y = gy; l.vy = 0; }
      if (!l.got && Math.abs(l.x - s.px) < 14 && Math.abs(l.y - s.py) < 20) { l.got = true; POP(s, l.x, l.y - 20, l.kind === 'soap' ? 'SOAP!' : 'COFFEE!', '#7bd65b'); } }
    s.loot = s.loot.filter(l => !l.got);
    const left = s.foes.filter(f => f.st !== 'gone').length;
    if (s.pants <= 0) s.end = { win: false, stars: 0, line: 'Out of clean pants. The grease wins.' };
    else if (!left) s.end = { win: true, stars: stars3(s.pants === s.pantsMax && s.t < 40, s.pants >= s.pantsMax - 1), line: `Trap room cleared in ${Math.round(s.t)}s.` };
    else if (s.t >= s.TIME) s.end = { win: false, stars: 0, line: `${left} blob${left > 1 ? 's' : ''} still loose.` };
  },
  draw(s) {
    if (BGI('bg_kitchen')) R(0, 0, W, H, 'rgba(8,12,20,.55)'); else { R(0, 0, W, H, '#14202c'); for (let y = 16; y < H; y += 16) for (let x = (y / 16 % 2) * 16; x < W; x += 32) R(x, y, 30, 14, '#182634'); }
    for (const p of s.plat) { R(p.x, p.y, p.w, 6, '#6e7177'); R(p.x, p.y + 6, p.w, 3, '#4a4c52'); for (let x = p.x; x < p.x + p.w; x += 16) R(x, p.y, 1, 6, '#888'); }
    for (const l of s.loot) { if (l.kind === 'soap') { R(l.x - 6, l.y - 6, 12, 6, '#9fd1ff'); R(l.x - 4, l.y - 8, 8, 2, '#fff'); } else { R(l.x - 4, l.y - 10, 8, 10, '#f4f1ea'); R(l.x - 4, l.y - 6, 8, 3, '#8a5a2e'); } }
    for (const f of s.foes) { if (f.st !== 'walk') continue; const bob = Math.sin(s.t * 10 + f.x) * 1.5;
      if (f.kind === 'wipe') { R(f.x - 9, f.y - 20 + bob, 18, 16, '#f4f4f2'); R(f.x - 7, f.y - 18 + bob, 14, 2, '#d9d4c8'); R(f.x - 4, f.y - 14 + bob, 2, 3, f.angry ? '#e9665a' : '#222'); R(f.x + 2, f.y - 14 + bob, 2, 3, f.angry ? '#e9665a' : '#222'); }
      else { C(f.x, f.y - 8 + bob, 9, f.angry ? '#8a5a1e' : '#c9a640'); C(f.x - 3, f.y - 11 + bob, 3, '#e8d48a'); R(f.x - 4, f.y - 9 + bob, 2, 3, f.angry ? '#e9665a' : '#222'); R(f.x + 2, f.y - 9 + bob, 2, 3, f.angry ? '#e9665a' : '#222'); } }
    for (const b of s.bubs) { g.globalAlpha = 0.85; C(b.x, b.y, 11, 'rgba(159,209,255,.35)'); g.strokeStyle = '#9fd1ff'; g.lineWidth = 1.5; g.beginPath(); g.arc(b.x, b.y, 11, 0, 7); g.stroke(); g.globalAlpha = 1; R(b.x - 5, b.y - 6, 3, 3, '#fff');
      if (b.foe) { if (b.foe.kind === 'wipe') R(b.x - 6, b.y - 5, 12, 10, '#f4f4f2'); else C(b.x, b.y, 6, '#c9a640'); if (b.t > 4) T('!', b.x, b.y - 16, '#e9665a', 7, 'center'); } }
    if (!(s.inv > 0 && Math.floor(s.t * 12) % 2)) SPR(s.hero || 'matt', s.face > 0 ? 6 : 8, s.px, s.py);
    DRAWFX(s);
    HUD(s, 'GREASE BOBBLE', s.TIME - s.t); PANTS(s, 6, 22);
    T('LEFT ' + s.foes.filter(f => f.st !== 'gone').length, W - 6, 26, '#f7c418', 6, 'right');
  },
});

// =====================================================================
// 19. SUPER RON — a side-scroller starring Ron, God of Drains. Rod has notes.
const SR_TILE = 16, SR_GROUND = 15;                       // ground top is row 15 (y = 240)
const SR_LEVEL = (() => {
  const L = { len: 210, pits: [[38, 40], [74, 76], [118, 120], [150, 152], [176, 178]], pipes: [[16, 2], [28, 3], [46, 3], [60, 2], [88, 3], [102, 3], [132, 3], [162, 2], [186, 3]],
    blocks: [[10, 11], [11, 11], [12, 11], [52, 11], [53, 11], [54, 10], [55, 10], [80, 11], [81, 11], [96, 11], [97, 11], [98, 11], [140, 10], [141, 10], [142, 10], [168, 11], [169, 11]],
    plungers: [[11, 9], [12, 9], [20, 12], [21, 12], [33, 13], [39, 11], [54, 8], [55, 8], [66, 13], [67, 13], [75, 11], [76, 11], [92, 13], [97, 9], [110, 13], [111, 13], [119, 11], [126, 13], [141, 8], [151, 11], [152, 11], [158, 13], [170, 9], [177, 11], [192, 13], [193, 13]],
    grease: [24, 35, 57, 69, 84, 95, 108, 128, 138, 158, 172, 182, 196], wipes: [44, 82, 114, 146, 180] };
  return L;
})();
function srSolid(c, r) {
  const L = SR_LEVEL;
  if (c < 0) return true; if (c >= L.len) return false;
  if (r >= SR_GROUND) return !L.pits.some(([a, b]) => c >= a && c <= b);
  for (const [px, h] of L.pipes) if ((c === px || c === px + 1) && r >= SR_GROUND - h) return true;
  return L.blocks.some(([bx, by]) => bx === c && by === r);
}
function srRon(x, y, face, t, run, hurt) {               // feet at (x, y); a tiny Ron
  if (hurt && Math.floor(t * 12) % 2) return;
  g.save(); g.translate(Math.round(x), Math.round(y)); if (face < 0) g.scale(-1, 1);
  const leg = run ? Math.sin(t * 18) * 2 : 0;
  R(-7, -18, 6, 14 + Math.sin(t * 6), '#b8262b');                                   // cape
  R(-4, -5, 3, 5 + leg, '#3a3a52'); R(1, -5, 3, 5 - leg, '#3a3a52');                    // legs
  R(-5, -14, 10, 10, '#2c4f9c'); R(-5, -7, 10, 2, '#d6b24a');                            // tunic + belt
  R(-4, -21, 8, 7, '#e8b48a'); R(-5, -23, 10, 3, '#f2c94c'); R(-6, -21, 3, 8, '#f2c94c'); // head + golden hair
  R(-3, -16, 6, 3, '#e0a83a'); R(1, -19, 1, 1, '#111');                                  // beard + eye
  R(5, -24, 1, 14, '#8a5a2e'); R(3, -26, 5, 3, '#c0392b');                               // the plunger of power
  g.restore();
}
GAMES.push({
  id: 'superron', name: 'SUPER RON', tag: 'Ron has a video game now. Rod has notes.',
  how: ['Run right to the golden toilet at the end.', 'Jump over pits and pipes. Bonk toolboxes from below.', 'Land on grease blobs and wipe ghosts to squash them.', 'Grab golden plungers. Rod will be commenting.'],
  ctl: 'LEFT / RIGHT TO RUN  ·  SPACE / UP TO JUMP',
  act: 'JUMP',
  init(s) {
    const L = SR_LEVEL;
    s.p = { x: 40, y: SR_GROUND * SR_TILE, vx: 0, vy: 0, on: true, face: 1 };
    s.cam = 0; s.hearts = s.heartsMax = [4, 3, 2][s.diff]; s.time = [130, 110, 95][s.diff]; s.inv = 0; s.hits = 0; s.got = 0; s.total = L.plungers.length;
    s.plg = L.plungers.map(([c, r]) => ({ x: c * SR_TILE + 8, y: r * SR_TILE + 8, got: false }));
    s.bonked = new Set(); s.pops = [];
    s.foes = [...L.grease.map(c => ({ k: 'g', x: c * SR_TILE, y: SR_GROUND * SR_TILE, vx: -26, vy: 0, dead: 0 })),
              ...L.wipes.map(c => ({ k: 'w', x: c * SR_TILE, y: 150, y0: 150, vx: -18, dead: 0, ph: c }))];
    s.said = {}; s.bub = null; s.check = { x: 40, y: SR_GROUND * SR_TILE }; s.won = false; s.flush = 0;
    s.quip = (k, txt) => { if (s.said[k]) return; s.said[k] = 1; s.bub = { txt, t: 3.2 }; };
    s.quip('start', "Ron has his own game now? ...Sure.");
  },
  update(s, dt, I) {
    s.t += dt; const p = s.p, L = SR_LEVEL;
    if (s.bub) { s.bub.t -= dt; if (s.bub.t <= 0) s.bub = null; }
    if (s.won) { s.flush += dt; if (s.flush > 2.2) s.end = { win: true, stars: stars3(s.hits === 0 && s.got >= s.total * 0.6, s.hits <= 1), line: `${s.got}/${s.total} golden plungers. "This isn't how drains work."` }; return; }
    s.time -= dt; s.inv = Math.max(0, s.inv - dt);
    if (s.time <= 0) { s.end = { win: false, stars: 0, line: 'Out of time. Ron is late. Ron is never late. (Ron is late.)' }; return; }
    // run + jump
    let dir = (I.R ? 1 : 0) - (I.L ? 1 : 0);
    if (I.ptr.down && dir === 0) dir = I.ptr.x < W * 0.33 ? -1 : I.ptr.x > W * 0.66 ? 1 : 0;
    const acc = p.on ? 900 : 600; p.vx += dir * acc * dt; if (!dir && p.on) p.vx *= Math.pow(0.0005, dt);
    p.vx = clamp(p.vx, -120, 120); if (dir) p.face = dir;
    const jumpHeld = I.A || I.U || (I.ptr.down && I.ptr.x >= W * 0.33 && I.ptr.x <= W * 0.66);
    if ((I.Ap || I.Up || (I.ptr.clicked && I.ptr.x >= W * 0.33 && I.ptr.x <= W * 0.66)) && p.on) { p.vy = -330; p.on = false; }
    if (!jumpHeld && p.vy < -120) p.vy = -120;                       // short hop if you let go
    p.vy = Math.min(520, p.vy + 980 * dt);
    // move X, collide
    const hw = 6, hh = 22;
    p.x += p.vx * dt;
    for (const sx of [p.x - hw, p.x + hw]) for (const sy of [p.y - hh + 1, p.y - 1]) {
      const c = Math.floor(sx / SR_TILE), r = Math.floor(sy / SR_TILE);
      if (srSolid(c, r)) { if (p.vx > 0) p.x = c * SR_TILE - hw - 0.01; else if (p.vx < 0) p.x = (c + 1) * SR_TILE + hw + 0.01; p.vx = 0;
        if (L.pipes.some(([px]) => c === px || c === px + 1)) s.quip('pipe', "That's 4-inch PVC. You don't jump OVER pipes, Ron. You clean them."); }
    }
    // move Y, collide
    p.y += p.vy * dt; p.on = false;
    for (const sx of [p.x - hw + 1, p.x + hw - 1]) {
      const c = Math.floor(sx / SR_TILE);
      if (p.vy >= 0) { const r = Math.floor(p.y / SR_TILE); if (srSolid(c, r)) { p.y = r * SR_TILE; p.vy = 0; p.on = true; } }
      else { const r = Math.floor((p.y - hh) / SR_TILE); if (srSolid(c, r)) { p.y = (r + 1) * SR_TILE + hh; p.vy = 0;
        const k = c + ',' + r; if (L.blocks.some(([bx, by]) => bx === c && by === r) && !s.bonked.has(k)) { s.bonked.add(k); s.got++; s.pops.push({ x: c * SR_TILE + 8, y: r * SR_TILE - 4, t: 0.6 }); s.quip('box', "Don't headbutt the toolbox, Ron. We need that."); } } }
    }
    if (p.on && p.y >= SR_GROUND * SR_TILE - 0.5 && p.x > s.check.x + 120) s.check = { x: p.x, y: p.y };   // checkpoints only on solid ground
    // fell in a pit
    if (p.y > H + 40) { s.quip('pit', "A bottomless sewer?! That's a code violation."); hurt(s, true); }
    // plungers
    for (const q of s.plg) if (!q.got && Math.abs(q.x - p.x) < 10 && Math.abs(q.y - (p.y - 11)) < 16) { q.got = true; s.got++; s.quip('plunger', 'Why are there golden plungers in the air? Who is PAYING for these?'); }
    // foes
    for (const f of s.foes) {
      if (f.dead) { f.dead += dt; continue; }
      if (Math.abs(f.x - p.x) > 360) continue;
      if (f.k === 'g') {
        f.x += f.vx * dt; const ahead = Math.floor((f.x + Math.sign(f.vx) * 8) / SR_TILE);
        if (srSolid(ahead, SR_GROUND - 1) || !srSolid(ahead, SR_GROUND)) f.vx = -f.vx;
      } else { f.x += f.vx * dt; f.y = f.y0 + Math.sin(s.t * 2 + f.ph) * 22; }
      const fw = f.k === 'g' ? 8 : 9, ftop = f.k === 'g' ? f.y - 10 : f.y - 9, fbot = f.k === 'g' ? f.y : f.y + 9;
      if (Math.abs(f.x - p.x) < fw + hw && p.y > ftop && p.y - hh < fbot) {
        if (p.vy > 60 && p.y - ftop < 10) { f.dead = 0.01; p.vy = -230; SFX('squish'); s.quip(f.k, f.k === 'g' ? "You don't STOMP grease, Ron. You JET it." : 'Flushable wipes. Haunting us even here.'); }
        else if (s.inv <= 0) { s.quip('hit' + f.k, f.k === 'g' ? 'He got greased. Happens to the best of us.' : 'Wiped out. Literally.'); hurt(s, false); }
      }
    }
    // the golden toilet
    if (p.x > (L.len - 8) * SR_TILE && !s.won) { s.won = true; SFX('flush_big'); s.quip('end', "This isn't how drains work. What IS this?"); s.bub = { txt: "This isn't how drains work. What IS this?", t: 9 }; }
    s.cam = clamp(p.x - 180, 0, L.len * SR_TILE - W);
    s.pops.forEach(o => { o.t -= dt; o.y -= 30 * dt; }); s.pops = s.pops.filter(o => o.t > 0);
    function hurt(s, fell) {
      SFX(fell ? 'splash' : 'bubble'); s.hits++; s.hearts--; s.inv = 1.6;
      if (fell) { s.p.x = s.check.x; s.p.y = s.check.y; s.p.vx = s.p.vy = 0; for (const f of s.foes) if (!f.dead && Math.abs(f.x - s.p.x) < 60) f.x += 80 * Math.sign(f.x - s.p.x || 1); }
      else { s.p.vy = -200; s.p.vx = -s.p.face * 90; }
      if (s.hearts <= 0) s.end = { win: false, stars: 0, line: 'Game over, Ron. Rod finished the job. Nobody will ever know.' };
    }
  },
  draw(s) {
    const L = SR_LEVEL, cam = Math.round(s.cam), t = s.t;
    const gr = g.createLinearGradient(0, 0, 0, 240); gr.addColorStop(0, '#5aa8f0'); gr.addColorStop(1, '#bfe6ff'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 6; i++) { const x = ((i * 190 - cam * 0.3) % 1140 + 1140) % 1140 - 100; C(x, 60 + (i % 3) * 18, 12, '#fff'); C(x + 14, 56 + (i % 3) * 18, 15, '#fff'); C(x + 30, 60 + (i % 3) * 18, 11, '#fff'); }
    for (let i = 0; i < 8; i++) { const x = ((i * 160 - cam * 0.55) % 1280 + 1280) % 1280 - 120; g.fillStyle = i % 2 ? '#3f8f4a' : '#4fa357'; g.beginPath(); g.ellipse(x, 242, 70, 40 + (i % 3) * 12, 0, Math.PI, 0); g.fill(); }
    const c0 = Math.floor(cam / SR_TILE), c1 = c0 + Math.ceil(W / SR_TILE) + 1;
    for (let c = c0; c <= c1; c++) {
      const x = c * SR_TILE - cam;
      if (srSolid(c, SR_GROUND)) { R(x, 240, 16, 30, '#8a5a32'); R(x, 240, 16, 4, '#5fb848'); R(x + 3, 250, 3, 3, '#6b4423'); R(x + 10, 260, 3, 3, '#6b4423'); }
    }
    for (const [px, h] of L.pipes) {                                   // white PVC "pipes" (they're cleanouts, Ron)
      const x = px * SR_TILE - cam, top = (SR_GROUND - h) * SR_TILE; if (x < -40 || x > W + 10) continue;
      R(x + 2, top + 6, 28, h * SR_TILE - 6, '#e8ecef'); R(x + 4, top + 6, 5, h * SR_TILE - 6, '#ffffff'); R(x + 24, top + 6, 5, h * SR_TILE - 6, '#c9ced6');
      R(x, top, 32, 8, '#f2f4f6'); R(x, top + 7, 32, 2, '#aab1ba'); T('4"', x + 16, top + 20, '#7a8a9a', 5, 'center');
    }
    for (const [bx, by] of L.blocks) {                                // toolboxes
      const x = bx * SR_TILE - cam, y = by * SR_TILE, used = s.bonked.has(bx + ',' + by); if (x < -16 || x > W) continue;
      R(x, y, 16, 16, used ? '#7a4a40' : '#c0392b'); R(x, y + 6, 16, 2, '#8b2a1f'); R(x + 5, y + 2, 6, 2, '#222'); if (!used) R(x + 7, y + 9, 2, 3, '#f7c418');
    }
    for (const q of s.plg) if (!q.got) {                              // golden plungers (spinning)
      const x = q.x - cam; if (x < -10 || x > W + 10) continue; const w = Math.abs(Math.cos(t * 4 + q.x)) * 5 + 1;
      R(x - 1, q.y - 4, 2, 10, '#c98a1e'); g.fillStyle = '#f2c94c'; g.beginPath(); g.ellipse(x, q.y - 5, w, 4, 0, Math.PI, 0); g.fill();
    }
    s.pops.forEach(o => { R(o.x - cam - 1, o.y - 4, 2, 9, '#c98a1e'); R(o.x - cam - 4, o.y - 6, 8, 3, '#f2c94c'); });
    for (const f of s.foes) {
      const x = f.x - cam; if (x < -20 || x > W + 20) continue;
      if (f.dead) { if (f.dead < 0.4) { g.globalAlpha = 1 - f.dead / 0.4; R(x - 9, f.y - 3, 18, 3, f.k === 'g' ? '#c9a24a' : '#f2f0ea'); g.globalAlpha = 1; } continue; }
      if (f.k === 'g') { g.fillStyle = '#d9b04a'; g.beginPath(); g.ellipse(x, f.y - 5, 9, 6 + Math.sin(t * 8) * 0.8, 0, 0, Math.PI * 2); g.fill(); R(x - 4, f.y - 8, 2, 2, '#222'); R(x + 2, f.y - 8, 2, 2, '#222'); R(x - 6, f.y - 11, 3, 2, '#f4dc8a'); }
      else { g.fillStyle = '#f2f0ea'; g.beginPath(); g.moveTo(x - 9, f.y + 9); g.lineTo(x - 9, f.y - 4); g.quadraticCurveTo(x, f.y - 14, x + 9, f.y - 4); g.lineTo(x + 9, f.y + 9); for (let k = 0; k < 4; k++) g.lineTo(x + 9 - k * 6 - 3, f.y + 5 + (k % 2) * 4); g.fill(); R(x - 4, f.y - 3, 2, 3, '#222'); R(x + 2, f.y - 3, 2, 3, '#222'); R(x - 6, f.y + 2, 12, 1, '#c9d6df'); }
    }
    // the golden toilet
    const tx = (L.len - 6) * SR_TILE - cam; if (tx < W + 40) { R(tx, 212, 26, 28, '#f2c94c'); g.fillStyle = '#f7d96a'; g.beginPath(); g.ellipse(tx + 13, 212, 18, 7, 0, 0, Math.PI * 2); g.fill(); R(tx + 14, 180, 18, 26, '#f2c94c'); T('FLUSH', tx + 13, 172, '#f7c418', 5, 'center');
      if (s.won) { for (let i = 0; i < 8; i++) { const a = s.flush * 6 + i; C(tx + 13 + Math.cos(a) * 14 * (1 - s.flush / 2.2), 210 + Math.sin(a) * 5, 2, '#9fd0e0'); } } }
    if (!s.won || s.flush < 0.8) srRon(s.p.x - cam, s.p.y, s.p.face, t, Math.abs(s.p.vx) > 10 && s.p.on, s.inv > 0);
    HUD(s, 'SUPER RON', s.time);
    for (let i = 0; i < s.heartsMax; i++) { const on = i < s.hearts; C(130 + i * 12, 8, 3, on ? '#e9665a' : '#444'); C(135 + i * 12, 8, 3, on ? '#e9665a' : '#444'); g.fillStyle = on ? '#e9665a' : '#444'; g.beginPath(); g.moveTo(127 + i * 12, 9); g.lineTo(132.5 + i * 12, 15); g.lineTo(138 + i * 12, 9); g.fill(); }
    R(305, 3, 2, 10, '#c98a1e'); R(301, 2, 10, 4, '#f2c94c'); T(`${s.got}/${s.total}`, 314, 8, '#f2c94c', 6);   // golden plunger count
    // Rod's running commentary
    if (s.bub) { const lines = []; let ln = ''; for (const w of s.bub.txt.split(' ')) { if ((ln + ' ' + w).length > 34) { lines.push(ln); ln = w; } else ln = ln ? ln + ' ' + w : w; } lines.push(ln);
      const h = 18 + lines.length * 10; R(8, 22, 300, h, 'rgba(16,21,31,.92)'); g.strokeStyle = '#f7c418'; g.lineWidth = 1; g.strokeRect(8.5, 22.5, 299, h - 1);
      SPR('rod', 0, 24, 22 + h - 2); T('ROD:', 42, 30, '#f7c418', 6); lines.forEach((l, i) => T(l, 42, 42 + i * 10, '#fff', 6)); }
  },
});

// =====================================================================
// SONDE CROSSING — Frogger with a locator. The camera's sonde is out under Main Street; find it, spray-paint it, don't get hit.
GAMES.push({
  id: 'locate', name: 'SONDE CROSSING', tag: 'The auto shop line · it runs under Main Street',
  how: ['The shop line runs out under the street to the city main.', 'Rod is in the shop pushing the camera. Its sonde beeps.', 'Hop out into traffic with the locator. Faster beeps = closer.', 'When the signal maxes out, SPACE to spray-paint the spot.', 'Rod pushes the camera further after each mark. Mark all 3.', 'Getting clipped sends you back to the curb.'],
  ctl: '◀ ▶ ▲ ▼ HOP · SPACE MARK',
  act: 'MARK',
  init(s) {
    const bg = !!MG('bg_mainstreet'); s.bg = bg; s.nl = bg ? 4 : 6; const NL = s.nl;
    s.ys = bg ? [70, 90, 110, 130, 150, 172, 206, 238] : [36, 58, 80, 102, 124, 146, 168, 190, 212, 234];
    s.DUR = [80, 70, 62][s.diff]; s.row = NL + 2; s.px = 300; s.cool = 0; s.pantsMax = s.pants = [4, 3, 3][s.diff]; s.inv = 0; s.hits = 0; s.marks = []; s.bad = 0; s.beepT = 0; s.flash = 0; s.say = ''; s.sayT = 0;
    // the pipe: shop cleanout → kinks once under the road → city main at the far curb
    const x0 = 300 + (s.rnd() - 0.5) * 60, xk = 120 + s.rnd() * 240, x1 = clamp(xk + (s.rnd() - 0.5) * 140, 40, 440), rk = (bg ? 2 : 3) + Math.floor(s.rnd() * 2);
    s.pipe = [[x0, NL + 2], [xk, rk], [bg ? 245 : x1, 0]];
    const at = r => { const [a, b] = r > rk ? [s.pipe[0], s.pipe[1]] : [s.pipe[1], s.pipe[2]]; const f = (a[1] - r) / (a[1] - b[1]); return a[0] + (b[0] - a[0]) * f; };
    const rows = bg ? (s.diff === 2 ? [3 + (s.rnd() < .5 ? 1 : 0), 2, 1] : [4, 2 + (s.rnd() < .5 ? 1 : 0), 1]) : s.diff === 2 ? [5 + (s.rnd() < .5 ? 1 : 0), 3 + (s.rnd() < .5 ? 1 : 0), 1] : [6, 3 + (s.rnd() < .5 ? 1 : 0), 1];
    s.sondes = rows.map(r => ({ row: r, x: at(r) + (s.rnd() - 0.5) * 16 }));
    s.cur = 0;
    // traffic: rows 1-3 head left (far side), rows 4-6 head right
    const base = bg ? [0, 80, 62, 66, 88] : [0, 70, 95, 60, 60, 95, 75];
    s.lanes = []; s.cars = [];
    for (let r = 1; r <= NL; r++) {
      const dir = r <= NL / 2 ? -1 : 1, v = base[r] * s.k * (1 + s.diff * 0.12);
      s.lanes[r] = { dir, v };
      let x = s.rnd() * 120;
      while (x < W + 200) { s.cars.push(this.car(s, r, x)); x += 120 + s.rnd() * 140; }
    }
  },
  car(s, r, x) {
    const k = s.rnd(), kind = k < 0.12 ? 'log' : k < 0.3 ? 'truck' : k < 0.36 ? 'clog' : 'car';
    const w = { car: 30, truck: 44, log: 72, clog: 40 }[kind];
    const cols = ['#c0392b', '#2a5ab0', '#e8e4d8', '#b8bcc2', '#27ae60', '#f39c12', '#8e44ad'];
    const spr = { car: ['sedan', 'hatch', 'subaru', 'minivan', 'pickup'][Math.floor(s.rnd() * 5)], truck: 'bus', log: 'logtruck', clog: 'blackvan' }[kind], im = MG('car_' + spr), base = MG('car_sedan');
    const sw = im && base ? Math.round(im.width * 30 / base.width) : w;   // drawn cars: keep their real sizes relative to a 30px sedan
    return { row: r, x, w: sw, kind, spr: im ? 'car_' + spr : null, col: cols[Math.floor(s.rnd() * cols.length)], spd: kind === 'clog' ? 1.6 : kind === 'log' ? 0.75 : 1 };
  },
  rowY: r => 36 + r * 22,
  Y(s, r) { return s.ys[r]; },
  update(s, dt, I) {
    s.t += dt; s.cool -= dt; s.inv = Math.max(0, s.inv - dt); s.flash = Math.max(0, s.flash - dt); s.sayT -= dt;
    const H0 = HERO(s), hop = 0.15 / H0.spd;
    // hop
    if (s.cool <= 0) {
      let moved = true;
      if (I.U || I.Up) s.row = Math.max(0, s.row - 1);
      else if (I.D || I.Dp) s.row = Math.min(s.nl + 3, s.row + 1);
      else if (I.L || I.Lp) s.px = clamp(s.px - 12, 12, W - 12);
      else if (I.R || I.Rp) s.px = clamp(s.px + 12, 12, W - 12);
      else moved = false;
      if (I.ptr.down && !moved) { const ty = I.ptr.y; let tr = 0; s.ys.forEach((yy, i) => { if (Math.abs(yy - 10 - ty) < Math.abs(s.ys[tr] - 10 - ty)) tr = i; }); const dx = I.ptr.x - s.px;
        if (tr < s.row) { s.row--; moved = true; } else if (tr > s.row) { s.row = Math.min(s.nl + 3, s.row + 1); moved = true; } else if (Math.abs(dx) > 8) { s.px = clamp(s.px + Math.sign(dx) * 12, 12, W - 12); moved = true; } }
      if (moved) s.cool = hop;
    }
    // traffic
    for (const c of s.cars) { const L = s.lanes[c.row]; c.x += L.dir * L.v * c.spd * dt; }
    for (let r = 1; r <= s.nl; r++) {   // nobody rear-ends anybody: faster vehicles slow to the one ahead
      const L = s.lanes[r], cs = s.cars.filter(c => c.row === r).sort((a, b) => L.dir * (b.x - a.x));
      for (let i = 1; i < cs.length; i++) { const a = cs[i - 1], b = cs[i], gap = (a.w + b.w) / 2 + 14;
        if (L.dir * (a.x - b.x) < gap) { b.x = a.x - L.dir * gap; b.spd = Math.min(b.spd, a.spd); } } }
    for (const c of s.cars) { const L = s.lanes[c.row];
      if (L.dir < 0 && c.x < -60) { const last = Math.max(...s.cars.filter(o => o.row === c.row).map(o => o.x)); Object.assign(c, this.car(s, c.row, Math.max(W + 60, last + 120 + s.rnd() * 140))); }
      if (L.dir > 0 && c.x > W + 60) { const first = Math.min(...s.cars.filter(o => o.row === c.row).map(o => o.x)); Object.assign(c, this.car(s, c.row, Math.min(-60, first - 120 - s.rnd() * 140))); } }
    // getting clipped
    if (s.inv <= 0 && s.row >= 1 && s.row <= s.nl) for (const c of s.cars) if (c.row === s.row && Math.abs(c.x - s.px) < c.w / 2 + 6) {
      s.pants--; s.hits++; s.inv = 1.4; s.shake = 0.35; s.row = s.nl + 1; SFX(c.kind === 'log' ? 'horn_angry' : 'horn'); PUFF(s, s.px, this.Y(s, s.nl + 1) - 10, '#fff', 10);
      s.say = ['WATCH IT!', 'HONK HONK', 'GET OUTTA THE ROAD!', 'NICE VEST, IDIOT'][Math.floor(s.rnd() * 4)]; s.sayT = 1.4; break; }
    // the locator
    const so = s.sondes[s.cur];
    if (so) {
      const d = Math.hypot(s.px - so.x, (s.ys[s.row] - s.ys[so.row]));
      s.sig = clamp(1 - d / 170, 0, 1);
      s.beepT -= dt; if (s.beepT <= 0 && s.sig > 0.02) { s.beepT = lerp(0.9, 0.07, s.sig); if (typeof beep === 'function') beep(500 + s.sig * 900, 0.035, 'square', 0.02); }
      if (I.Ap) {
        const R0 = 13 * Math.sqrt(H0.steady);
        if (d < R0) { s.marks.push({ x: so.x, row: so.row, n: s.cur + 1 }); s.flash = 0.4; POP(s, so.x, this.Y(s, so.row) - 16, `MARKED! ${[4, 6, 8][s.cur]} FT DEEP`, '#7dffb0'); SFX('ui_select');
          s.cur++; s.say = s.cur < 3 ? ['ROD: PUSHING IT FURTHER...', 'ROD: OK, NEXT ONE OUT.'][s.cur - 1] : 'ROD: THAT\'S THE MAIN!'; s.sayT = 1.6; }
        else { s.bad++; s.t += 3; POP(s, s.px, this.Y(s, s.row) - 16, 'WEAK SIGNAL · -3s', '#e9665a'); SFX('clog'); }
      }
    }
    FX(s, dt);
    if (s.pants <= 0) s.end = { win: false, stars: 0, line: 'Clipped one too many times. Rod is calling the town for a flagger.' };
    else if (s.cur >= 3) s.end = { win: true, stars: stars3(s.hits === 0 && s.bad <= 1, s.hits <= 1), line: s.hits ? `All three marked. Clipped ${s.hits}x.` : 'All three marked. Not a scratch.' };
    else if (s.t >= s.DUR) s.end = { win: false, stars: 0, line: 'Out of time. The cops want the road open.' };
  },
  draw(s) {
    const Y = r => s.ys[r], top = Y(1) - 11, bot = Y(s.nl) + 11, p = s.pipe;
    if (s.bg && BGI('bg_mainstreet')) {
      R(p[0][0] - 4, Y(s.nl + 2) - 3, 8, 8, '#ddd'); R(p[0][0] - 3, Y(s.nl + 2) - 2, 6, 6, '#2c8a4a');
      SPR('rod', 7, p[0][0] + 14, Y(s.nl + 2) + 10);
      const f = Math.floor(s.t * 4) % 2, gx = (s.t * 14) % (W + 80) - 40, sx = W + 40 - (s.t * 22) % (W + 80);
      SPI('gull_' + f, gx, Y(0) + 6, 0.5); SPI('squirrel_' + f, sx, Y(s.nl + 1) + 6, 0.45, true);
    } else {
    R(0, 0, W, H, '#5c6b3a');
    R(0, Y(0) - 11, W, 22, '#b9b4a8'); for (let x = 0; x < W; x += 24) R(x, Y(0) - 11, 1, 22, '#9f998c');      // far sidewalk
    R(0, Y(0) - 16, W, 5, '#6a7a42');
    R(0, top, W, bot - top, '#3d3f44'); R(0, top, W, 2, '#e8e4d8'); R(0, bot - 2, W, 2, '#e8e4d8');               // Main Street
    R(0, Y(3) + 10, W, 2, '#f2c12e'); R(0, Y(3) + 13, W, 2, '#f2c12e');                                         // double yellow
    for (const r of [1, 2, 4, 5]) for (let x = (s.t * 0) % 40; x < W; x += 40) R(x, Y(r) + 10, 18, 2, '#cfcfcf');
    R(0, Y(7) - 11, W, 22, '#b9b4a8'); for (let x = 0; x < W; x += 24) R(x, Y(7) - 11, 1, 22, '#9f998c');      // near sidewalk
    R(0, Y(8) - 11, W, 44, '#7a7e84');                                                                             // shop lot
    // the auto shop
    R(0, Y(9) + 4, W, H - Y(9) - 4, '#8a5a3a'); R(0, Y(9) + 4, W, 3, '#5a3e26');
    for (const gx of [40, 150, 380]) { R(gx, Y(9) + 8, 70, H - Y(9) - 8, '#c9ccd1'); for (let yy = Y(9) + 12; yy < H; yy += 5) R(gx, yy, 70, 1, '#9aa0a6'); }
    T("JR'S AUTO", 260, Y(9) + 14, '#f7c418', 7, 'center');
    // city main manhole + the shop cleanout
    C(p[2][0], Y(0), 7, '#555'); C(p[2][0], Y(0), 5, '#6d6d6d'); R(p[2][0] - 4, Y(0) - 1, 8, 2, '#4a4a4a');
    R(p[0][0] - 4, Y(8) - 3, 8, 8, '#ddd'); R(p[0][0] - 3, Y(8) - 2, 6, 6, '#2c8a4a');
    SPR('rod', 7, p[0][0] + 14, Y(8) + 10);   // Rod, feeding the push rod
    }
    // spray marks
    for (const m of s.marks) { const x = m.x, y = Y(m.row); R(x - 7, y - 1, 14, 3, '#ff2d95'); R(x - 1, y - 7, 3, 14, '#ff2d95'); T(String(m.n), x + 9, y - 6, '#ff2d95', 6); }
    // traffic
    for (const c of s.cars) {
      const y = Y(c.row), x0 = c.x - c.w / 2, d = s.lanes[c.row].dir;
      R(x0 + 2, y + 6, c.w - 4, 3, 'rgba(0,0,0,.35)');
      if (c.spr && MG(c.spr)) { const im = MG(c.spr), h = im.height * c.w / im.width;   // facing the way the lane goes
        if (d < 0) { g.save(); g.translate(Math.round(c.x), 0); g.scale(-1, 1); g.drawImage(im, Math.round(-c.w / 2), Math.round(y + 8 - h), c.w, Math.round(h)); g.restore(); }
        else g.drawImage(im, Math.round(x0), Math.round(y + 8 - h), c.w, Math.round(h));
        continue; }
      if (c.kind === 'log') { R(x0, y - 7, 18, 14, '#c0392b'); R(x0 + 20, y - 6, c.w - 20, 12, '#5a3e26'); for (let i = 0; i < 3; i++) C(d > 0 ? x0 + 20 : x0 + c.w - 2, y - 4 + i * 4, 2.5, '#c9a06a'); if (d < 0) { R(x0, y - 7, 18, 14, '#5a3e26'); R(x0 + c.w - 18, y - 7, 18, 14, '#c0392b'); } }
      else if (c.kind === 'truck') { R(x0, y - 8, c.w, 15, c.col); R(d > 0 ? x0 + c.w - 12 : x0, y - 8, 12, 15, '#ddd'); R(d > 0 ? x0 + c.w - 8 : x0 + 2, y - 6, 6, 5, '#2b3a48'); }
      else if (c.kind === 'clog') { R(x0, y - 8, c.w, 15, '#c0392b'); R(x0, y - 2, c.w, 3, '#111'); T('CK', c.x, y - 4, '#111', 5, 'center'); R(d > 0 ? x0 + c.w - 9 : x0 + 2, y - 7, 7, 5, '#2b3a48'); }
      else { R(x0, y - 6, c.w, 12, c.col); R(x0 + 7, y - 9, c.w - 14, 5, c.col); R(x0 + 9, y - 8, c.w - 18, 3, '#2b3a48'); }
      R(x0 + 4, y + 5, 6, 3, '#111'); R(x0 + c.w - 10, y + 5, 6, 3, '#111');
    }
    // you, with the locator wand
    if (!(s.inv > 0 && Math.floor(s.t * 12) % 2)) { const fy = Y(s.row) + 10; SPR(s.hero || 'matt', 7, s.px, fy); R(s.px + 7, fy - 22, 2, 18, '#f39c12'); R(s.px + 4, fy - 26, 8, 5, '#f7c418'); R(s.px - 7, fy - 30, 14, 3, '#ff7a00'); }
    DRAWFX(s);
    if (s.sayT > 0) T(s.say, W / 2, Y(s.nl + 1) - 26, '#fff', 7, 'center');
    if (s.flash > 0) { g.globalAlpha = s.flash; R(0, 0, W, H, '#ff2d95'); g.globalAlpha = 1; }
    // locator screen
    const lx = 336, ly = 20, sig = s.sig || 0;
    R(lx, ly, 138, 26, '#10151f'); R(lx + 1, ly + 1, 136, 24, '#1d2a1d');
    T('LOCATOR', lx + 5, ly + 7, '#7dffb0', 5);
    for (let i = 0; i < 10; i++) R(lx + 6 + i * 9, ly + 20 - (i + 1) * 1.1, 7, 3 + (i + 1) * 1.1, i < Math.round(sig * 10) ? (i > 7 ? '#ff2d95' : '#7dffb0') : '#2f3f2f');
    T(String(Math.round(sig * 99)).padStart(2, '0'), lx + 128, ly + 14, sig > 0.85 ? '#ff2d95' : '#7dffb0', 9, 'right');
    HUD(s, `SONDE CROSSING  ${s.cur}/3`, s.DUR - s.t); PANTS(s, 6, 22);
  },
});

// =====================================================================
// THAW IT OUT — the steamer. Feed the steam hose up the frozen line from the cleanout, melt the ice,
// don't cook the pipe, and swap the bucket before the meltwater runs over.
GAMES.push({
  id: 'steamer', name: 'THAW IT OUT', tag: 'The frozen line · steamer up through the cleanout',
  how: ['The line froze solid along the outside wall. You are at the cleanout with the steamer.', '◀ ▶ feeds the steam hose up the pipe (or pulls it back).', 'Hold SPACE to steam the ice in front of the nozzle.', 'Steam too long in one spot and the pipe gets soft. Watch the HEAT bar.', 'The melt runs back down into your bucket. ▼ swaps the bucket before it spills.', 'Melt every chunk of ice to open the line.'],
  ctl: '◀ ▶ HOSE · SPACE STEAM · ▼ SWAP BUCKET',
  phone: 'the pad moves the hose (▼ swaps the bucket), the big button steams.',
  act: 'STEAM',
  init(s) {
    s.DUR = [60, 55, 50][s.diff]; s.hx = 92; s.heat = 0; s.bucket = 0; s.swap = 0; s.pantsMax = s.pants = [4, 3, 3][s.diff]; s.inv = 0; s.soft = 0; s.spill = 0;
    const n = [3, 4, 5][s.diff]; s.ice = [];
    let x = 150 + s.rnd() * 30;
    for (let i = 0; i < n; i++) { const w = 18 + s.rnd() * 22; s.ice.push({ x, w, hp: 1, max: (1.4 + s.rnd() * 1.0) * (1 + s.diff * 0.15) }); x += w + 20 + s.rnd() * 40; }
    s.drips = []; s.puffs = []; s.melted = 0;
  },
  update(s, dt, I) {
    s.t += dt; const H0 = HERO(s);
    s.inv = Math.max(0, s.inv - dt);
    const front = s.ice.find(c => c.hp > 0);
    const maxX = front ? front.x - 6 : 440;
    if (s.swap > 0) { s.swap -= dt; if (s.swap <= 0) { s.bucket = 0; POP(s, 60, 196, 'FRESH BUCKET', '#7dffb0'); } }
    else if (I.Dp || (I.D && s.bucket > 0.15)) { s.swap = 1.1 / Math.sqrt(H0.spd); SFX('splash'); }
    const dir = (I.R ? 1 : 0) - (I.L ? 1 : 0) + (I.ptr.down && !I.A ? Math.sign(I.ptr.x - s.hx) * (Math.abs(I.ptr.x - s.hx) > 4 ? 1 : 0) : 0);
    s.hx = clamp(s.hx + dir * 70 * H0.spd * dt, 92, maxX);
    const steaming = (I.A || (I.ptr.down && Math.abs(I.ptr.x - s.hx) <= 4)) && s.swap <= 0;
    // heat builds where you steam and bleeds off when you stop. Rod's steadier hands spread it out.
    if (steaming) {
      s.heat += dt * (0.42 + s.diff * 0.06) / H0.grip;
      if (front && front.x - s.hx < 16) { const m = dt / front.max; front.hp -= m; s.bucket += m * 0.42 * (1 + s.diff * 0.1); if (s.rnd() < dt * 8) s.drips.push({ x: s.hx, v: 0 }); if (front.hp <= 0) { s.melted++; POP(s, front.x + front.w / 2, 120, 'CRACK!', '#9fe0ff'); SFX('drain'); } }
      if (s.rnd() < dt * 20) s.puffs.push({ x: s.hx + 6, y: 150, l: 0.6 });
    } else s.heat = Math.max(0, s.heat - dt * 0.38);
    if (s.heat >= 1 && s.inv <= 0) { s.pants--; s.soft++; s.inv = 1; s.heat = 0.55; s.shake = 0.3; POP(s, s.hx, 120, "PIPE'S GOING SOFT!", '#e9665a'); }
    if (s.bucket >= 1 && s.inv <= 0) { s.pants--; s.spill++; s.inv = 1; s.bucket = 0.3; s.shake = 0.3; SFX('splash'); POP(s, 60, 190, 'BUCKET SPILLED!', '#e9665a'); }
    for (const d of s.drips) { d.v += dt * 140; d.x -= d.v * dt; } s.drips = s.drips.filter(d => d.x > 74);
    for (const p of s.puffs) { p.l -= dt; p.y -= dt * 30; p.x += dt * 10; } s.puffs = s.puffs.filter(p => p.l > 0);
    FX(s, dt);
    if (s.pants <= 0) s.end = { win: false, stars: 0, line: s.soft >= s.spill ? 'Cooked the pipe. Now it needs a new one.' : 'Meltwater all over the basement floor.' };
    else if (!front) s.end = { win: true, stars: stars3(s.soft + s.spill === 0 && s.t < s.DUR * 0.7, s.soft + s.spill <= 1), line: s.soft + s.spill ? 'Line is open. A little messy.' : 'Line is open. Not a drop on the floor.' };
    else if (s.t >= s.DUR) s.end = { win: false, stars: 0, line: 'Still frozen. Doreen is pouring hot water down it again.' };
  },
  draw(s) {
    if (BGI('bg_basement')) R(0, 0, W, H, 'rgba(10,12,16,.25)'); else { R(0, 0, W, H, '#3b4048');
    R(0, 0, 470, 240, '#5d5650'); for (let y = 10; y < 240; y += 14) for (let x = (y / 14 % 2) * 14; x < 470; x += 28) R(x, y, 26, 12, '#6a625b'); }   // basement block wall
    R(470, 0, 10, 240, '#e8eef4'); R(400, 0, 70, 240, 'rgba(180,210,235,.18)');   // the cold outside wall
    for (let i = 0; i < 12; i++) R(404 + (i * 37) % 60, (i * 53) % 230, 2, 2, '#e8f4ff');
    if (!MG('bg_basement')) R(0, 240, W, 30, '#4a4038');
    // the kitchen sink upstairs and the drain running down to the cleanout
    R(410, 18, 60, 10, '#c9ccd1'); R(426, 28, 28, 14, '#9aa0a6'); R(436, 42, 8, 108, '#e8e4d8'); R(436, 42, 3, 108, '#fff');
    R(70, 144, 374, 16, '#e8e4d8'); R(70, 144, 374, 4, '#fff'); R(70, 157, 374, 3, '#b9b4a8');   // the line
    R(60, 140, 14, 24, '#ddd'); R(62, 160, 10, 4, '#2c8a4a');   // cleanout
    // ice inside the pipe
    for (const c of s.ice) if (c.hp > 0) { const a = 0.35 + 0.65 * c.hp; g.globalAlpha = a; R(c.x, 147, c.w * (0.4 + 0.6 * c.hp), 10, '#bfe6ff'); R(c.x + 2, 148, 4, 8, '#ffffff'); g.globalAlpha = 1; }
    // the hose and nozzle
    R(74, 151, s.hx - 74, 3, '#2a2a2e'); R(s.hx - 2, 149, 8, 7, '#d0a03a');
    for (const p of s.puffs) { if (SPC('steam_' + Math.min(3, Math.floor((0.6 - p.l) / 0.15)), p.x, p.y, 0.45, false, Math.max(0, p.l / 0.6) * 0.9)) continue; g.globalAlpha = Math.max(0, p.l / 0.6) * 0.8; C(p.x, p.y, 4 + (0.6 - p.l) * 10, '#f4f6f8'); g.globalAlpha = 1; }
    for (const d of s.drips) R(d.x, 155, 3, 2, '#7fc4ff');
    // the bucket under the cleanout
    const bx = 44, by = 196;
    if (s.swap > 0) { T('SWAP!', bx + 16, by - 8, '#f7c418', 6, 'center'); g.globalAlpha = 0.4; }
    R(bx, by, 32, 28, '#e8762b'); R(bx + 2, by + 28 - 26 * Math.min(1, s.bucket), 28, 26 * Math.min(1, s.bucket), '#7fc4ff'); R(bx - 2, by - 2, 36, 3, '#c45f1e'); g.globalAlpha = 1;
    if (s.bucket > 0.8 && Math.floor(s.t * 6) % 2) T('!', bx + 16, by - 18, '#e9665a', 10, 'center');
    if (!(s.inv > 0 && Math.floor(s.t * 12) % 2)) SPR(s.hero || 'rod', 6, 104, 240);
    DRAWFX(s);
    HUD(s, `THAW IT OUT  ${s.melted}/${s.ice.length}`, s.DUR - s.t); PANTS(s, 6, 22);
    BAR(330, 26, 140, 6, s.heat, s.heat > 0.8 ? '#e9665a' : '#f39c12', 'PIPE HEAT');
    BAR(330, 44, 140, 6, s.bucket, s.bucket > 0.8 ? '#e9665a' : '#7fc4ff', 'BUCKET');
  },
});

if (typeof module !== 'undefined') module.exports = { GAMES, HEROES, srSolid: typeof srSolid !== 'undefined' ? srSolid : null, setCtx: c => { g = c; } };
