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
  const col = c || '#fff', m = /^#([0-9a-f]{6})$/i.exec(col), n = m ? parseInt(m[1], 16) : 0xffffff, lum = m ? (0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) : 255;
  if (lum > 110) { const o = (sz || 8) <= 7 ? 1 / 3 : 2 / 3; g.fillStyle = '#000'; g.fillText(s, x + o, y + o); }   /* drop shadow: one screen pixel on small text so it stays sharp */   // drop shadow only behind light text; dark text on a light label stays crisp
  g.fillStyle = col; g.fillText(s, x, y); g.textAlign = 'left';
}
/* wrap text to a pixel width (measured, not guessed). Returns the lines; draws them if y != null. */
function WRAP(s, x, y, maxW, c, sz, lh, maxLines, al) {
  g.font = Math.max(5, sz || 8) + 'px "Press Start 2P", monospace'; const out = []; let ln = '';
  for (const w of String(s).split(' ')) { const t2 = ln ? ln + ' ' + w : w; if (ln && g.measureText(t2).width > maxW) { out.push(ln); ln = w; } else ln = t2; }
  if (ln) out.push(ln); const L = maxLines ? out.slice(-maxLines) : out;
  if (y != null) L.forEach((l, i) => T(l, x, y + i * (lh || (sz || 8) + 4), c, sz, al)); return L; }
function BAR(x, y, w, h, f, c, label) {
  R(x - 1, y - 1, w + 2, h + 2, '#000'); R(x, y, w, h, '#2c3326'); R(x, y, w * Math.max(0, Math.min(1, f)), h, c);
  if (label) T(label, x, y - 6, '#fff', 6);
}
function SPR(who, frame, cx, feetY, flip, sc) {       // crew sheets: 24x40 frames. 0 front, 6 right, 7 back, 8 left. sc: scale to match a drawn room
  sc = (sc || 1.8) * (who === 'rod' ? 0.94 : 1); const w = 24 * sc, h = 40 * sc;   // Matt stands a little taller than Rod   // default 1.4x: readable on a phone
  const im = IMG[who]; if (!im) { R(cx - 8 * sc, feetY - 36 * sc, 16 * sc, 36 * sc, who === 'rod' ? '#22325e' : '#2a3d78'); return; }
  let src = im, fi = frame; if (frame >= 18) { src = IMG[who + '_walk'] || im; fi = src === im ? (frame >= 22 ? 7 : 0) : frame - 18; }   // 18-21 walk toward you, 22-25 walk away
  else if (frame >= 9) { src = IMG[who + '_more'] || im; fi = src === im ? 0 : frame - 9; }   // 9-17: the extra poses (walk, buckets, kneel, gag, sludge, thumbs up)
  const fw = src.width / (src === IMG[who + '_walk'] ? 8 : 9), fh = src.height; g.imageSmoothingEnabled = fw > 24;   // hi-res sheets get smoothed down, old 24x40 ones stay crisp
  if (flip) { g.save(); g.translate(Math.round(cx), 0); g.scale(-1, 1); g.drawImage(src, fi * fw, 0, fw, fh, Math.round(-w / 2), Math.round(feetY - h), w, h); g.restore(); }
  else g.drawImage(src, fi * fw, 0, fw, fh, Math.round(cx - w / 2), Math.round(feetY - h), w, h);
  g.imageSmoothingEnabled = false;
}
const MORE = (who, f, old) => IMG[who + '_more'] ? f : old;   // new pose if this crew member has the extra sheet, else the closest old frame
const WALK = (who, t, old) => MORE(who, 9 + Math.floor(t * 8) % 4, old);   // 4-step walk cycle, facing right (flip for left)
// The hero, facing and walking the way they're actually moving: right/left = walk cycle, up = back view, down = front view, stepping.
// Remembers the last direction when standing still. sc defaults to 1.5 (bigger, easier to read on a phone).
function HERO_AT(s, x, feetY, sc, opt) {
  const who = s.hero || 'matt', o = opt || {}, dt = 1 / 60;
  const dx = s._hx == null ? 0 : x - s._hx, dy = s._hy == null || o.horiz ? 0 : feetY - s._hy; s._hx = x; s._hy = feetY;   // horiz: jumping doesn't count as walking up
  const mv = Math.abs(dx) + Math.abs(dy) > 0.05 && !o.still;
  if (mv) { s._face = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy < 0 ? 'U' : 'D'); s._walk = 0.12; } else s._walk = Math.max(0, (s._walk || 0) - dt);
  if (!s._face || (o.force && o.face)) s._face = o.face || 'D';
  const f = s._face || o.face || 'D', walking = s._walk > 0, step = Math.floor(s.t * 8);
  let fr, flip = false, bob = 0;
  if (o.pose != null) fr = o.pose;
  else if (f === 'R' || f === 'L') { fr = walking ? WALK(who, s.t, f === 'R' ? 6 : 8) : (f === 'R' ? 6 : 8); flip = f === 'L' && fr >= 9; }
  else if (walking && IMG[who + '_walk']) fr = (f === 'U' ? 22 : 18) + step % 4;   // real steps toward / away from you
  else { fr = f === 'U' ? 7 : 0; if (walking) { flip = step % 2 === 1; bob = step % 2 ? -1.5 : 0; } }   // no front/back walk art yet: step by mirroring + a bob
  SPR(who, fr, x, feetY + bob * (sc || 1.8), flip, sc || 1.8);
}
// enemy animation: hold each frame for `hold` seconds before stepping to the next (each enemy keeps its own clock)
function ANIM(o, now, n, hold) { if (o._af == null) { o._af = Math.floor(Math.random() * n); o._at = now; } if (now - o._at >= hold) { o._af = (o._af + 1) % n; o._at = now; } return o._af; }
// draw every frame of an enemy at ONE scale (from its first frame), so squash/stretch frames don't jump in size
function SCL(base, h) { return base ? h / base.height : 1; }
// A proper porcelain bowl seen from above/front: shaded rim, inner wall falling away, deep water with moving highlights.
function BOWL(cx, cy, rx, ry, t, opt) {
  const o = opt || {}, E2 = (x, y, a, b, f) => { g.fillStyle = f; g.beginPath(); g.ellipse(x, y, a, b, 0, 0, 7); g.fill(); };
  E2(cx + 3, cy + ry * 0.16, rx * 1.03, ry * 1.05, 'rgba(0,0,0,.22)');                                   // shadow on the floor
  let gr = g.createLinearGradient(cx, cy - ry, cx, cy + ry); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.55, '#f0f1ee'); gr.addColorStop(1, '#c9cdca'); E2(cx, cy, rx, ry, gr);   // the rim
  g.strokeStyle = '#aab0ad'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, 7); g.stroke();
  gr = g.createLinearGradient(cx, cy - ry * 0.8, cx, cy + ry * 0.8); gr.addColorStop(0, '#b4b9b6'); gr.addColorStop(0.5, '#e6e8e4'); gr.addColorStop(1, '#fafaf8'); E2(cx, cy, rx * 0.86, ry * 0.84, gr);   // inner wall (dark at the top where it falls away)
  const wx = rx * 0.76, wy = ry * 0.72, wc = cy + ry * 0.05;
  gr = g.createRadialGradient(cx, wc, 2, cx, wc, wx); gr.addColorStop(0, o.deep || '#2f6f8f'); gr.addColorStop(0.55, o.mid || '#5fa3c2'); gr.addColorStop(1, o.edge || '#a9d3e4'); E2(cx, wc, wx, wy, gr);   // the water
  g.save(); g.beginPath(); g.ellipse(cx, wc, wx, wy, 0, 0, 7); g.clip();
  g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 1.5; for (let i = 0; i < 4; i++) { const a = t * (0.9 + i * 0.25) + i * 1.7; g.beginPath(); g.ellipse(cx, wc, wx * (0.25 + i * 0.19), wy * (0.25 + i * 0.19), 0, a, a + 1.3 + i * 0.2); g.stroke(); }   // swirl highlights
  g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.ellipse(cx - wx * 0.45, wc - wy * 0.5, wx * 0.22, wy * 0.1, -0.4, 0, 7); g.fill();          // the bathroom light, reflected
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2; g.beginPath(); g.ellipse(cx, cy, rx * 0.95, ry * 0.94, 0, Math.PI * 1.1, Math.PI * 1.6); g.stroke();   // a gleam on the rim
  return { wx, wy, wc };
}
function BATHFLOOR(wallH) { R(0, 0, W, wallH, '#bfd6cf'); for (let x = 0; x < W; x += 24) for (let y = 16; y < wallH; y += 24) R(x, y, 23, 23, ((x / 24 + Math.floor(y / 24)) % 2) ? '#cbe0d9' : '#c2d8d1');
  R(0, wallH, W, 4, '#8fa8a0'); R(0, wallH + 4, W, H - wallH - 4, '#9a9ca3'); for (let x = 0; x < W; x += 40) R(x, wallH + 4, 1, H, '#84868d'); for (let y = wallH + 24; y < H; y += 24) R(0, y, W, 1, '#84868d'); }
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
  how: ['You are at the open septic tank. The customer is on the porch with a pot.', 'He is aiming for the tank. He is not good at it.', 'The first splash is thrown right at you. The next ones are thrown where you are GOING. Change direction!', 'The big one is the whole pot. Survive 20 seconds.'],
  ctl: '◀ ▶ MOVE',
  act: null, dpad: 'lr',
  init(s) { s.DUR = 20; s.px = 240; s.pvx = 0; s.lastPx = 240; s.globs = []; s.splats = []; s.next = 0.8; s.nextBig = 5; s.pantsMax = s.pants = [4, 3, 3][s.diff]; s.inv = 0; s.hits = 0; s.cx = 240; s.cv = 60; s.wind = 0; },
  update(s, dt, I) {
    s.t += dt;
    mover1D(s, I, dt, 190 * HERO(s).spd, 16, W - 16); s.pvx += ((s.px - s.lastPx) / Math.max(dt, 1e-3) - s.pvx) * Math.min(1, dt * 8); s.lastPx = s.px;   /* how fast you're moving, and which way */
    const ramp = s.t / s.DUR;
    s.next -= dt; s.nextBig -= dt;
    const launch = (big, lead, delay) => {   /* lead 0 = at where you are now; 1 = where you'll be when it lands */
      const fly = (big ? 1.25 : lerp(1.05, 0.8, ramp) / Math.sqrt(s.k)) + (delay || 0);
      const r = big ? 20 : 7 + s.rnd() * 5;
      const tx = clamp(s.px + s.pvx * fly * lead * (0.85 + s.rnd() * 0.3) + (s.rnd() - 0.5) * 10, 18, W - 18);
      s.globs.push({ t0: s.t, fly, tx, sx: s.cx, r, big }); s.wind = 0.3; if (big) SFX('splash');
    };
    if (s.next <= 0 && s.t < s.DUR - 1) {   // he flings the pot: the first one at you, the next ones where you're going
      const n = Math.min(3, 1 + Math.floor(s.rnd() * (1.3 + ramp * 1.6 + s.diff * 0.4)));
      for (let i = 0; i < n; i++) launch(false, i === 0 ? 0 : 1, i * 0.18);
      s.next = lerp(1.0, 0.6, ramp) / s.k * (0.75 + s.rnd() * 0.5) * (0.7 + 0.3 * n); }
    if (s.nextBig <= 0 && s.t < s.DUR - 1.5) { launch(true, 0.5, 0); s.nextBig = 6 + s.rnd() * 2; }
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
      const x = lerp(o.sx + 14, o.tx, f), y = lerp(40 + dy, 222, f) - Math.sin(f * Math.PI) * 60;
      if (!SPC('glob_' + (Math.floor(f * 8) % 4), x, y, o.r / 14, o.tx < o.sx)) { C(x, y, o.r * 0.8, '#8a6a1e'); C(x - o.r * 0.25, y - o.r * 0.25, o.r * 0.3, '#c9a640'); }
    }
    { const hw = s.hero || 'matt', hit = s.inv > 0 && IMG[hw + '_more']; if (hit || !(s.inv > 0 && Math.floor(s.t * 12) % 2)) HERO_AT(s, s.px, 224, 2.1, { face: 'D', horiz: true, pose: hit ? 16 : null }); }
    HUD(s, 'SPLASH DODGE', s.DUR - s.t); PANTS(s, 6, 22);
  },
});

// =====================================================================
// 2. CLEANOUT BLOWOUT — a 3D run across the yard to the van. The whole line backed up: cleanouts along the yard
//    erupt in HUGE poop geysers that rain turds and corn onto the path (watch the shadows), the yard is already
//    covered in piles, and it's raining brown. One safe gap wanders across every row: you have to find it.
//    At the van, you turn around. You are covered.
GAMES.push({
  id: 'sprinkler', name: 'CLEANOUT BLOWOUT', tag: 'Run the yard · dodge the poop geysers',
  how: ['The whole line backed up and every cleanout in the yard is erupting. RUN FOR THE VAN.', 'The yard is flooded with sewage. Stay on the three plywood planks: hop plank to plank around the piles (◀ ▶ or tap the sides).', 'The geysers rain turds and corn onto the path: the SHADOWS show where it lands.', 'Every row has one gap. Find it. Get hit too many times and that is it for your pants.'],
  dpad: 'lr',
  ctl: '◀ ▶ CHANGE LANE (OR TAP THE SIDES)',
  act: null,
  init(s) {
    s.DIST = [560, 660, 760][s.diff]; s.z = 0; s.v = 0; s.x = 0; s.tx = null; s.objs = []; s.next = 16; s.safe = 0; s.lane = 0; s.rowN = 0; s.rainMode = 0;
    s.pantsMax = s.pants = [4, 3, 3][s.diff]; s.inv = 0; s.hits = 0; s.say = ''; s.sayT = 0; s.drops = []; s.outro = null; s.goo = 0;
    for (let i = 0; i < 70; i++) s.drops.push({ x: s.rnd() * W, y: s.rnd() * H, v: 260 + s.rnd() * 160 });
  },
  G: 30, D: 6, HY: 92, FY: 246, LW: 92, U: 58, XM: 1.4,
  P(s, rel, x, h) { const sc = this.D / (Math.max(-this.D * 0.9, rel) + this.D); return { x: 240 + x * this.LW * sc, y: this.HY + (this.FY - this.HY) * sc - (h || 0) * this.U * sc, sc }; },
  img(n, cx, by, h, flip, ax, rot, wmul) { const im = MG(n); if (!im) return false; const w = h * im.width / im.height * (wmul || 1); g.save(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.translate(cx, by); if (rot) g.rotate(rot); if (flip) g.scale(-1, 1); g.drawImage(im, -w * (ax == null ? 0.5 : ax), -h, w, h); g.restore(); return true; },
  hit(s, word) { if (s.inv > 0) return; s.pants--; s.hits++; s.goo++; s.inv = 1.1; s.shake = 0.35; s.say = word; s.sayT = 1.1; SFX('splash', { vol: 0.7 }); },
  row(s, wz, ramp) {   /* one row of mess across the yard, with ONE gap around the safe line */
    const R2 = () => s.rnd(), prev = s.safe; if (R2() < 0.6) s.safe = Math.max(-1, Math.min(1, s.safe + (s.safe === -1 ? 1 : s.safe === 1 ? -1 : (R2() < 0.5 ? -1 : 1))));
    s.rowN++; if (s.rainMode <= 0 && s.rowN > 3 && R2() < 0.22 + ramp * 0.2) { s.rainMode = 3 + Math.floor(R2() * 3); const side = R2() < 0.5 ? -1 : 1; s.objs.push({ k: 'gey', wz: wz - 6, x: side * 2.05, fired: false, col: 0, rows: [] }); }
    const rain = s.rainMode > 0, gey = rain ? s.objs.filter(o => o.k === 'gey' && !o.fired).slice(-1)[0] : null; if (rain) s.rainMode--;
    const open = [-1, 0, 1].filter(x => x !== s.safe), both = R2() < 0.55 + ramp * 0.4 + s.diff * 0.1;   /* only the safe lane is clear (it moves one lane at a time, with time to hop between rows) */
    const keep = both ? open : open.sort(() => R2() - 0.5).slice(0, 1);
    for (const x of keep) { const corn = R2() < 0.35, o = { k: corn ? 'corn' : 'turd', wz: wz + (R2() - 0.5) * 0.5, x, h: 0, landed: !rain, spin: R2() * 6, pile: !rain };
      if (rain && gey) { o.h = 999; o.wait = true; gey.rows.push(o); } s.objs.push(o); } },
  update(s, dt, I) {
    s.t += dt; s.inv = Math.max(0, s.inv - dt); s.shake = Math.max(0, (s.shake || 0) - dt); s.sayT = Math.max(0, s.sayT - dt);
    for (const d of s.drops) { d.y += d.v * dt; d.x -= d.v * 0.12 * dt; if (d.y > H) { d.y = -10; d.x = s.rnd() * (W + 40); } }
    if (s.outro) { s.outro.t += dt; if (s.outro.t > 4.2 || (s.outro.t > 1.2 && (I.ptr.clicked || I.Ap))) s.end = s.outro.end; return; }   /* at the van: you turn around */
    const ramp = Math.min(1, s.z / s.DIST); s.v = (16 + 9 * ramp) * s.k; s.z += s.v * dt;   /* faster: less time to decide */
    if (I.Lp || (I.ptr.clicked && I.ptr.x / W < 0.5)) s.lane = Math.max(-1, s.lane - 1);   /* three lanes, one hop at a time: no standing in between */
    if (I.Rp || (I.ptr.clicked && I.ptr.x / W >= 0.5)) s.lane = Math.min(1, s.lane + 1);
    s.x += Math.sign(s.lane - s.x) * Math.min(Math.abs(s.lane - s.x), 5.6 * dt);   /* one hop, plank to plank */
    while (s.z + 70 > s.next && s.next < s.DIST - 14) { this.row(s, s.next, ramp); s.next += (6.6 - 1.4 * ramp) * (0.9 + s.rnd() * 0.25); }
    for (const o of s.objs) {
      const rel = o.wz - s.z, prev = o.rel == null ? rel : o.rel; o.rel = rel;
      if (o.k === 'gey') { if (!o.fired && rel < 62) { o.fired = true; o.col = 2.8; SFX('gurgle', { vol: 0.9 }); s.say = 'INCOMING!'; s.sayT = 1.2;   /* blows way up ahead: everything is down well before you get there */
          for (const q of o.rows) { const tt = Math.max(0.6, (q.wz - s.z - 20) / s.v); q.h = 0.5 * this.G * 0.4 * tt * tt; q.vh = 0; q.wait = false; } }
        o.col = Math.max(0, o.col - dt); continue; }
      if ((o.k === 'turd' || o.k === 'corn') && !o.landed && !o.wait) { o.vh -= this.G * 0.4 * dt; o.h = Math.max(0, o.h + o.vh * dt); if (o.h <= 0) o.landed = true; }
      if (prev > 0 && rel <= 0 && (o.k === 'turd' || o.k === 'corn') && !o.wait && o.h < 1.2 && Math.abs(o.x - s.x) < (o.k === 'corn' ? 0.34 : 0.4)) this.hit(s, o.pile ? (o.k === 'corn' ? 'STEPPED IN CORN!' : 'STEPPED IN IT!') : (o.k === 'corn' ? 'CORNED!' : 'DIRECT HIT!'));
    }
    s.objs = s.objs.filter(o => o.wz - s.z > -4);
    if (s.pants <= 0) s.end = { win: false, stars: 0, line: 'You did not make it to the van. You are not getting IN the van, either.' };
    else if (s.z >= s.DIST) { SFX('door'); s.outro = { t: 0, end: { win: true, stars: stars3(s.hits === 0, s.hits <= 1), line: s.hits ? `Made the van. Hit ${s.hits}x. Rod makes you ride in the back.` : 'Not a speck... wait. The rain. Rod makes you ride in the back anyway.' } }; }
  },
  draw(s) {
    const { HY, FY, D } = this, sh = s.shake > 0 ? (Math.random() - 0.5) * 6 : 0, t = s.t, ramp = Math.min(1, s.z / s.DIST);
    g.save(); g.translate(sh, 0);
    if (IMG.bg_yard3) { g.imageSmoothingEnabled = true; g.drawImage(IMG.bg_yard3, 0, 165 - HY - 4, 480, HY + 4, -6, 0, W + 12, HY + 4); g.imageSmoothingEnabled = false; }
    else { R(-6, 0, W + 12, HY, '#9fc4e0'); }
    g.fillStyle = `rgba(80,55,25,${0.18 + 0.25 * ramp})`; g.fillRect(-6, 0, W + 12, HY);   /* the sky is going brown */
    for (let y = HY; y < H; y += 2) { const rel = D * (FY - HY) / Math.max(0.5, y - HY) - D, wz = s.z + rel, f = Math.min(1, (y - HY) / (H - HY)), c0 = [150, 146, 66], c1 = [98, 114, 44], v = Math.sin(wz * 0.31) * 4 + Math.sin(wz * 0.117 + 1.3) * 5, m = (a, b2) => Math.round(a + (b2 - a) * f + v);
      R(-6, y, W + 12, 2, `rgb(${m(c0[0], c1[0])},${m(c0[1], c1[1])},${m(c0[2], c1[2])})`); }   /* an ordinary back lawn: no mowing stripes */
    { const hsh = n => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }, z0 = Math.floor(s.z / 1.1) * 1.1;   /* the lawn is soaked: brown puddles everywhere off the planks */
      for (let zz = z0 + 40; zz >= z0; zz -= 1.1) { const rel = zz - s.z; if (rel < -1) continue; const k = Math.round(zz / 1.1);
        for (let i = 0; i < 6; i++) { const x = (hsh(k * 13 + i) - 0.5) * 10, p = this.P(s, rel + hsh(k * 7 + i) * 1.1, x), sc2 = p.sc, kind = hsh(k * 31 + i); if (p.y < HY + 1) continue;
          if (kind < 0.35) { g.fillStyle = 'rgba(96,66,28,.55)'; g.beginPath(); g.ellipse(p.x, p.y, (30 + kind * 120) * sc2, (5 + kind * 18) * sc2, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(200,170,110,.25)'; g.beginPath(); g.ellipse(p.x - 6 * sc2, p.y - 1 * sc2, (10 + kind * 30) * sc2, 2 * sc2, 0, 0, 7); g.fill(); }   /* sewage puddle, with a shine */
          else if (kind < 0.6) { g.strokeStyle = '#5f7c2c'; g.lineWidth = Math.max(1, 1.5 * sc2); g.beginPath(); for (let j = -2; j <= 2; j++) { g.moveTo(p.x + j * 3 * sc2, p.y); g.lineTo(p.x + j * 4.5 * sc2, p.y - (7 + (j & 1) * 3) * sc2); } g.stroke(); } } } }
    { const far = 70, PL = 0.34;   /* three plywood planks laid across a river of sewage to the van: hop plank to plank, you can't run in the muck */
      { const m1 = this.P(s, far, -1.75), m2 = this.P(s, far, 1.75), n1 = this.P(s, -0.9, -1.75), n2 = this.P(s, -0.9, 1.75), gr = g.createLinearGradient(0, m1.y, 0, H); gr.addColorStop(0, '#6b4a22'); gr.addColorStop(1, '#4e3417'); g.fillStyle = gr;
        g.beginPath(); g.moveTo(m1.x, m1.y); g.lineTo(m2.x, m2.y); g.lineTo(n2.x, n2.y); g.lineTo(n1.x, n1.y); g.fill();
        for (let zz = Math.ceil(s.z / 1.6) * 1.6; zz < s.z + 40; zz += 1.6) { const rel = zz - s.z; for (const xx of [-1.55, -0.5, 0.5, 1.55]) { const q = this.P(s, rel, xx + Math.sin(zz * 1.7 + xx * 3) * 0.08); g.fillStyle = 'rgba(170,130,70,.35)'; g.beginPath(); g.ellipse(q.x, q.y, 9 * q.sc, 1.6 * q.sc + 0.4, 0, 0, 7); g.fill(); if (Math.sin(zz * 3.1 + xx) > 0.85) C(q.x + 5 * q.sc, q.y - 1, Math.max(1, 2.2 * q.sc), 'rgba(140,100,50,.8)'); } } }   /* ripples and bubbles in the muck */
      for (const lx of [-1, 0, 1]) { const a1 = this.P(s, far, lx - PL), a2 = this.P(s, far, lx + PL), b1 = this.P(s, -0.9, lx - PL), b2 = this.P(s, -0.9, lx + PL);
        g.fillStyle = '#4a3418'; g.beginPath(); g.moveTo(a1.x - 1, a1.y); g.lineTo(a2.x + 1, a2.y); g.lineTo(b2.x + 3, b2.y + 3); g.lineTo(b1.x - 3, b1.y + 3); g.fill();   /* the plank's edge */
        g.fillStyle = '#b48a52'; g.beginPath(); g.moveTo(a1.x, a1.y); g.lineTo(a2.x, a2.y); g.lineTo(b2.x, b2.y); g.lineTo(b1.x, b1.y); g.fill();
        for (let zz = Math.ceil(s.z / 8) * 8; zz < s.z + far; zz += 8) { const rel = zz - s.z, c1 = this.P(s, rel, lx - PL), c2 = this.P(s, rel, lx + PL); g.strokeStyle = '#6e5230'; g.lineWidth = Math.max(1, 2 * c1.sc); g.beginPath(); g.moveTo(c1.x, c1.y); g.lineTo(c2.x, c2.y); g.stroke();   /* seams between sheets */
          for (const fx of [-0.22, 0.22]) { const n1 = this.P(s, rel + 0.4, lx + fx); C(n1.x, n1.y, Math.max(0.6, 1.4 * n1.sc), '#3a2a14'); } }   /* nails */
        for (let zz = Math.ceil(s.z / 3) * 3; zz < s.z + 40; zz += 3) { const rel = zz - s.z, q = this.P(s, rel, lx + Math.sin(zz) * 0.18); g.fillStyle = 'rgba(110,72,30,.35)'; g.beginPath(); g.ellipse(q.x, q.y, 9 * q.sc, 2.4 * q.sc, 0, 0, 7); g.fill(); } } }   /* muddy boot prints */
    { const rel = s.DIST - s.z + 4; if (rel < 75 && IMG.van_back) { const p = this.P(s, rel, 0), im = IMG.van_back, fw = im.width / 6, h = 2.6 * this.U * p.sc, w = h * fw / im.height; g.imageSmoothingEnabled = true; g.drawImage(im, 0, 0, fw, im.height, p.x - w / 2, p.y - h, w, h); g.imageSmoothingEnabled = false; } }
    const L = s.objs.filter(o => o.wz - s.z > -1).sort((a, b) => (b.wz - s.z) - (a.wz - s.z));
    for (const o of L) { const rel = o.wz - s.z;
      if (o.k === 'gey') { const p = this.P(s, rel, o.x), ph = 1.0 * this.U * p.sc;   /* a HUGE geyser off the side of the path */
        if (o.col > 0 && MG('cb_gey')) { const a2 = Math.min(1, o.col * 1.2), gh = Math.max(ph * 3, p.y + 20) * (1 + Math.sin(t * 20) * 0.03); g.globalAlpha = a2; this.img('cb_gey', p.x, p.y + 2, gh, Math.floor(t * 8) % 2 === 0, 0.5, 0, 2.2); g.globalAlpha = 1;
          for (let i = 0; i < 14; i++) { const f = (t * 1.6 + i / 14) % 1, xx = p.x + (o.x > 0 ? -1 : 1) * f * 260 * p.sc * 3, yy = 20 + Math.sin(f * Math.PI) * -10 + f * f * (p.y - 20); C(xx, yy, Math.max(2, 5 * p.sc * 2), `rgba(110,68,28,${a2 * (1 - f * 0.5)})`); } }   /* arcing out over the path */
        else { this.img('cb_pipe', p.x, p.y, ph * 1.3, o.x > 0, 0.36); if (!o.fired && rel < 50 && Math.floor(t * 8) % 2) T('!', p.x, p.y - ph * 1.3 - 6, '#e9665a', Math.max(7, Math.round(14 * p.sc)), 'center'); }
        continue; }
      if (o.k === 'turd' || o.k === 'corn') { const gp = this.P(s, rel, o.x, 0), sz = (o.k === 'corn' ? 0.32 : 0.6) * this.U * gp.sc;
        if (!o.landed && !o.wait) { const near = Math.max(0, 1 - o.h / 14); g.fillStyle = `rgba(30,30,15,${0.25 + 0.5 * near})`; g.beginPath(); g.ellipse(gp.x, gp.y, sz * (0.5 + 0.7 * near), sz * 0.22 * (0.5 + 0.7 * near), 0, 0, 7); g.fill(); }
        if (o.wait) { continue; }
        const p = this.P(s, rel, o.x, o.landed ? 0 : o.h);
        if (o.k === 'turd') { if (o.landed) { if (!SPC('poop', gp.x, gp.y - sz * 0.42, gp.sc * 1.0)) C(gp.x, gp.y - sz * 0.3, sz * 0.4, '#6e4420'); }   /* just poop */
          else if (!SPC('poop', p.x, p.y - sz * 0.4, gp.sc * 1.0)) C(p.x, p.y - sz * 0.4, sz * 0.4, '#6e4420'); }
        else { if (MG('tp')) SPC('tp', p.x + sz * 0.15, p.y - sz * 0.55, gp.sc * 0.75, o.spin > 3);   /* a wad of toilet paper with corn all through it */
          for (let i = 0; i < 5; i++) { const ox = (i - 2) * sz * 0.35, oy = Math.sin(o.spin + i * 1.7) * sz * 0.25; g.fillStyle = '#f2c12e'; g.beginPath(); g.ellipse(p.x + ox, p.y - sz * 0.3 + oy, sz * 0.16, sz * 0.24, o.spin + i + t * (o.landed ? 0 : 8), 0, 7); g.fill(); } } } }
    // you
    { const p = this.P(s, 0, s.x), who = s.hero || 'matt', O = s.outro;
      g.fillStyle = 'rgba(30,40,20,.4)'; g.beginPath(); g.ellipse(p.x, p.y, 22, 6, 0, 0, 7); g.fill();
      if (O) { const covered = !!IMG[who + '_more'], fr = O.t < 0.5 ? 7 : O.t < 0.8 ? 6 : covered ? 16 : 0; SPR(who, fr, p.x, p.y, false, 2.4);   /* turns around... in his sludge-covered pose */
        if (O.t >= 0.8) { const sc2 = 2.4, top = p.y - 40 * sc2;
          if (!covered) for (let i = 0; i < 12; i++) { const fx = Math.sin(i * 12.9898) * 0.5, fy = 0.12 + ((i * 0.618) % 1) * 0.8, x = p.x + fx * 22 * sc2 * 0.5, y = top + fy * 38 * sc2; if (!SPC('glob_' + (i % 4), x, y, 0.32 + (i % 3) * 0.08)) C(x, y, 4, '#6e4420'); }
          for (let i = 0; i < 3 + s.goo; i++) R(p.x + Math.sin(i * 7.3) * 18, p.y - 10 - ((t * 40 + i * 13) % 28), 1.5, 4, '#5a3618');   /* still dripping */
          SPC('poop', p.x + 2, top + 12, 0.5);   /* and one right on top of his head */
          for (let i = 0; i < 4; i++) { const an = t * (4 + i) + i * 1.6; R(p.x + Math.cos(an) * 24, top + 8 + Math.sin(an * 1.3) * 10, 2, 2, '#111'); }   /* flies */
          R(0, H - 46, W, 30, 'rgba(16,21,31,.85)'); T(s.hits ? 'Made it. ...Mostly.' : 'Made it! ...Wait. The RAIN.', 240, H - 37, '#f7c418', 8, 'center'); T(`${HERO(s).name === 'ROD' ? 'MATT' : 'ROD'}: "You're riding in the back."`, 240, H - 24, '#e8dcc0', 6, 'center'); } }
      else if (!(s.inv > 0 && Math.floor(t * 12) % 2)) { const f = Math.abs(s.lane - s.x), hop = f > 0.02 ? Math.sin(Math.min(1, f) * Math.PI) * 26 : 0;   /* hopping plank to plank */
        SPR(who, hop ? 7 : (IMG[who + '_walk'] ? 22 + Math.floor(t * 10) % 4 : 7), p.x, p.y - hop - (hop ? 0 : Math.abs(Math.sin(t * 20)) * 2), false, 2.4); } }
    g.restore();
    // the brown rain
    g.strokeStyle = `rgba(95,62,26,${0.35 + 0.35 * ramp})`; g.lineWidth = 1; g.beginPath(); for (const d of s.drops) { g.moveTo(d.x, d.y); g.lineTo(d.x + 3, d.y - 9); } g.stroke();
    R(0, 0, W, 16, 'rgba(16,21,31,.92)'); T('CLEANOUT BLOWOUT', 6, 8, '#f7c418', 7); T('VAN ' + Math.max(0, Math.ceil((s.DIST - s.z) * 1.5)) + ' FT', W - 6, 8, '#fff', 7, 'right');
    BAR(150, 5, 120, 6, Math.min(1, s.z / s.DIST), '#7bd65b'); PANTS(s, 6, 22);
    if (s.sayT > 0 && !s.outro) T(s.say, 240, 60, s.say === 'INCOMING!' ? '#f7c418' : '#e9665a', 12, 'center');
    if (s.t < 4) { R(100, 32, 280, 20, 'rgba(16,21,31,.75)'); T('FIND THE GAP  ·  WATCH THE SHADOWS', 240, 42, '#fff', 6, 'center'); }
  },
});

// =====================================================================
// 3. SNAKE THE LINE — steer the cable head up a winding pipe. Spin through debris, don't kink on the walls, chew the clog.
GAMES.push({
  id: 'cable', name: 'SNAKE THE LINE', tag: 'Flex shaft & chain knocker · wipes · roots',
  how: ['You are running the FLEX SHAFT up the pipe, a chain knocker on the end. It feeds on its own; you steer.', 'Scraping the pipe wall KINKS the shaft. Three kinks and you are done.', 'Hold SPACE to SPIN: the chains fling out and scour the pipe. Spin THROUGH wipes and roots, or they snag the chains.', 'At the end, spin into the clog until the chains chew it apart.'],
  act2: 'SPIN',
  ctl: '◀ ▶ STEER  ·  HOLD SPACE = SPIN',
  act: 'SPIN', dpad: 'lr',
  init(s) {
    s.LEN = [1700, 2100, 2500][s.diff]; s.d = 0; s.x = 240; s.kink = 0; s.KMAX = [4, 3, 3][s.diff]; s.snag = 0; s.wall = 0; s.chew = 0; s.CHEW = 100; s.spinT = 0;
    s.ph = [s.rnd() * 6, s.rnd() * 6, s.rnd() * 6];
    s.junk = []; for (let d = 260; d < s.LEN - 150; d += 110 + s.rnd() * 120) s.junk.push({ d, off: (s.rnd() - .5) * 30, kind: ['wipe', 'root', 'toy', 'wipe'][Math.floor(s.rnd() * 4)], gone: false });
    s.TIME = 40; s.x = this.cx(s, 0); s.PVC = s.rnd() < 0.5;   /* start in the middle of the pipe */
  },
  cx(s, d) { return 240 + 70 * Math.sin(d / 260 + s.ph[0]) + 24 * Math.sin(d / 140 + s.ph[1]) * Math.min(1, d / 400); },
  wid(s, d) { return 38 - 6 * s.diff + 8 * Math.sin(d / 180 + s.ph[2]); },
  update(s, dt, I) {
    s.t += dt; FX(s, dt);
    const H = HERO(s), spin = I.A || I.B || (I.ptr.down && Math.abs(I.ptr.x - 240) < 60), atClog = s.d >= s.LEN;   /* touch: hold the middle to spin, either side to steer */
    s.spinT += spin ? dt * 18 : dt * 0.8; s.spinRate = spin ? 18 : 0;
    if (!atClog) {
      // steering: keys or drag toward your finger
      let st = (I.R ? 1 : 0) - (I.L ? 1 : 0); if (I.ptr.down && Math.abs(I.ptr.x - 240) >= 60) st = Math.sign(I.ptr.x - 240);
      s.x += st * 150 * H.spd * dt;
      const feed = s.snag > 0 ? 0 : (spin ? 48 : 110) * (0.9 + 0.1 * s.k);   /* spinning the chains slows the push */
      s.snag = Math.max(0, s.snag - dt); s.d = Math.min(s.LEN, s.d + feed * dt);
      const c = this.cx(s, s.d), w = this.wid(s, s.d);
      // the walls: scraping builds up a kink, and a kink bounces you back toward the middle (one kink per hit, never a chain)
      s.wallCool = Math.max(0, (s.wallCool || 0) - dt);
      if (Math.abs(s.x - c) > w) { const side = Math.sign(s.x - c); s.x = c + side * w;
        if (s.wallCool <= 0) { s.wall += dt * 1.6 / H.steady; if (s.wall >= 1) { s.wall = 0; s.kink++; s.wallCool = 1.2; s.x = c + side * w * 0.4; s.shake = 0.35; PUFF(s, 240 + side * 120, 190, '#bbb', 10); POP(s, 240, 170, 'KINK!', '#e9665a'); SFX('drill_stop'); } } }
      else s.wall = Math.max(0, s.wall - dt * 1.2);
      for (const j of s.junk) if (!j.gone && Math.abs(j.d - s.d) < 10 && Math.abs(s.x - (this.cx(s, j.d) + j.off)) < 16) {
        j.gone = true;
        if (spin) { PUFF(s, 240, 180, j.kind === 'root' ? '#8a6a3e' : j.kind === 'toy' ? '#e9665a' : '#f4f4f2', 18, 140); POP(s, 240, 150, 'SHREDDED!', '#7bd65b'); SFX('drill_burst', { vol: 0.5 }); }
        else { s.snag = 0.9; s.shake = 0.25; POP(s, 240, 150, 'SNAGGED! SPIN!', '#e9665a'); SFX('drill_stop'); }
      }
    } else {
      if (spin) { s.chew += dt * 22 * H.grip; if (s.rnd() < 0.5) PUFF(s, 240 + (s.rnd() - .5) * 40, 110, s.room === 'kitchen' ? '#1c1a17' : '#7a4a1e', 2, 80); }
      if (s.chew >= s.CHEW) { SFX('drain'); s.end = { win: true, stars: stars3(s.kink === 0 && s.t < 28, s.kink <= 1), line: s.kink ? `Line's open. ${s.kink} kink${s.kink > 1 ? 's' : ''} in the cable.` : 'Clean run, no kinks. Line is open.' }; }
    }
    if (s.kink >= s.KMAX) s.end = { win: false, stars: 0, line: 'Kinked the cable three times. Pull it and start over.' };
    else if (s.t >= s.TIME && !s.end) s.end = { win: false, stars: 0, line: 'Ran out of time. The clog won this round.' };
  },
  draw(s) {   /* riding behind the cutter head, looking up the pipe */
    const SC = 1 / 30, c = this.cx(s, s.d), w = this.wid(s, s.d), off = clamp((s.x - c) / w, -1.15, 1.15), ox = off * 0.6, oy = 0.28, greasy = s.room === 'kitchen';
    const sway = clamp((this.cx(s, s.d + 420) - c) * 0.7, -55, 55), toClog = (s.LEN - s.d) * SC, hole = Math.min(0.95, s.chew / s.CHEW);
    R(0, 0, W, H, '#050605');
    TUNNEL.draw({ D: s.d * SC, t: s.t, pvc: s.PVC, ox, oy, plugs: [{ f: Math.max(1.4, toClog), hole, kind: greasy ? 'grease' : 'debris', seed: 5 }], water: 0.28 }, 0, sway);
    // junk coming at you, far to near
    const vis = s.junk.filter(q => !q.gone && q.d > s.d && (q.d - s.d) * SC < 26).sort((a, b) => b.d - a.d);
    for (const q of vis) { const f = (q.d - s.d) * SC, X = q.off / w * 0.6, Y = q.kind === 'root' ? -0.55 : q.kind === 'toy' ? 0.62 : 0.15;
      let [x, y, r] = TUNNEL.proj(f, X, Y, ox, oy); x += sway * Math.min(1, f / 8); const lit = Math.max(0.3, 1 / (1 + (f / 13) ** 2)), sc = r * 0.76 / 30; r *= 2;   /* 2x: big enough to see coming */
      g.globalAlpha = 1; g.filter = `brightness(${Math.round(lit * 110)}%)`; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';   /* smooth, not blocky, at 2x */
      if (!SPC(q.kind === 'wipe' ? 'wipes' : q.kind === 'root' ? 'roots' : 'toycar', x, y, sc)) { if (q.kind === 'wipe') R(x - r * 0.3, y - r * 0.2, r * 0.6, r * 0.4, '#f4f4f2'); else if (q.kind === 'root') for (let i2 = 0; i2 < 5; i2++) R(x - r * 0.3 + i2 * r * 0.15, y - r * 0.3, r * 0.05, r * 0.5, '#8a6a3e'); else R(x - r * 0.25, y - r * 0.15, r * 0.5, r * 0.3, '#c0392b'); }
      g.filter = 'none'; g.imageSmoothingEnabled = false; }
    TUNNEL.vignette(0.55);
    // the flex shaft: comes from behind you, runs away down the pipe to the chain knocker spinning a couple of feet ahead
    const fH = 3.6, hubX = ox, hubY = oy - 0.1, P = (f, X, Y) => { const q = TUNNEL.proj(f, X, Y, ox, oy); q[0] += sway * Math.min(1, Math.max(0, f) / 8); return q; };
    { const pts = []; for (let f2 = 0.1; f2 <= fH; f2 += 0.1) { const u = (f2 - 0.1) / (fH - 0.1); pts.push(P(f2, hubX + Math.sin(f2 * 1.3 + s.t * 0.6) * 0.05 * (1 - u), hubY + 0.62 * (1 - u) * (1 - u))); }   /* from just under you, away down the pipe */
      for (let i2 = 0; i2 < pts.length - 1; i2++) { const [x1, y1, r1] = pts[i2], [x2, y2] = pts[i2 + 1], bare = i2 > pts.length - 5, wdt = Math.max(2, r1 * 0.075);
        g.strokeStyle = bare ? '#9aa0a8' : '#202226'; g.lineWidth = wdt; g.lineCap = 'round'; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
        g.strokeStyle = bare ? ((i2 + Math.floor(s.spinT * 3)) % 2 ? '#d8dce2' : '#6a7078') : 'rgba(255,255,255,.12)'; g.lineWidth = Math.max(1, wdt * 0.3); g.beginPath(); g.moveTo(x1, y1 - wdt * 0.25); g.lineTo(x2, y2 - wdt * 0.25); g.stroke(); }   /* casing sheen; the bare spinning cable at the head */
      g.lineCap = 'butt'; }
    { const [hx, hy, hr] = P(fH, hubX, hubY), spin = s.spinT, spinning = (s.spinRate || 0) > 6 && !(s.snag > 0), n = 3, Lc = 0.86;
      if (spinning) { g.strokeStyle = 'rgba(200,205,212,.18)'; g.lineWidth = Math.max(2, hr * 0.12); g.beginPath(); g.ellipse(hx, hy, hr * Lc, hr * Lc, 0, 0, 7); g.stroke(); }   /* the blur ring the chains make */
      for (let c2 = 0; c2 < n; c2++) for (let ghost = spinning ? 2 : 0; ghost >= 0; ghost--) {
        const base = spin + c2 * Math.PI * 2 / n - ghost * 0.22; g.globalAlpha = ghost ? 0.25 / ghost : 1;
        for (let l = 0; l < 11; l++) { const u = (l + 1) / 11;
          let X, Y; if (spinning) { X = hubX + Math.cos(base) * Lc * u; Y = hubY + Math.sin(base) * Lc * u; } else { const a0 = c2 * 2.1 + 0.5; X = hubX + Math.cos(a0) * 0.12 * u + Math.sin(s.t * 2 + c2) * 0.03 * u; Y = hubY + u * 0.5; }   /* flung out to the walls, or hanging */
          const [lx, ly, lr] = P(fH, X, Y), sz = Math.max(1.2, lr * 0.03);
          if (l % 2) R(lx - sz, ly - sz * 0.5, sz * 2, sz, s.snag > 0 ? '#e9665a' : '#c8ccd2'); else R(lx - sz * 0.5, ly - sz, sz, sz * 2, s.snag > 0 ? '#b8443a' : '#8e949c');   /* alternating links */
          if (l === 10 && spinning && !ghost) { R(lx - sz, ly - sz, sz * 2, sz * 2, '#f2f4f6'); if (Math.random() < 0.35) R(lx + (Math.random() - 0.5) * 10, ly + (Math.random() - 0.5) * 10, 2, 2, '#f7c418'); } }   /* carbide tip, sparks off the wall */
        g.globalAlpha = 1; }
      C(hx, hy, Math.max(3, hr * 0.075), s.snag > 0 ? '#e9665a' : '#7e848c'); C(hx - hr * 0.02, hy - hr * 0.02, Math.max(1, hr * 0.025), '#e8eaee'); }   /* the knocker hub */
    if (s.wall > 0.2) for (let i2 = 0; i2 < 6; i2++) R(240 + Math.sign(off) * (90 + Math.random() * 60), 150 + Math.random() * 60, 3, 2, i2 % 2 ? '#f7c418' : '#e9665a');   /* scraping the wall */
    DRAWFX(s);
    HUD(s, 'SNAKE THE LINE', s.TIME - s.t);
    BAR(6, 30, 110, 7, s.d / s.LEN, '#7bd65b', 'TO THE CLOG');
    for (let i = 0; i < s.KMAX; i++) R(130 + i * 12, 26, 9, 9, i < s.kink ? '#e9665a' : '#3a3f4a'); T('KINKS', 130, 20, '#fff', 5);
    if (Math.abs(off) > 0.75) T(off > 0 ? '◀ WALL! STEER LEFT' : 'WALL! STEER RIGHT ▶', 240, 64, '#f7c418', 7, 'center');
    if (s.d >= s.LEN) { BAR(140, 240, 200, 10, s.chew / s.CHEW, '#f7c418', 'BREAK UP THE CLOG: HOLD SPACE'); }
  },
});

// =====================================================================
// 4. FIND THE SEPTIC — numbers are the exact step-distance to the target.
GAMES.push({
  id: 'septic', name: 'FIND THE SEPTIC', tag: 'Two feet of snow · "no idea where it is"',
  how: ['Like Battleship: tap the yard to push your probe rod in. Find the TANK and the D-BOX.', 'One solid pipe runs out of the tank to the small concrete D-box. The leach field fans out from the D-box: gravel and perforated pipe.', 'MISS = nothing. "!" = you scraped concrete or gravel nearby. Hitting the pipe or the field gravel is a clue: follow it.', 'Find the TANK first, then follow the pipe to the D-BOX.', 'Own the inspection camera? It shows which way the pipe leaves the house.'],
  dpad: 'omni',
  ctl: 'TAP A SQUARE  ·  OR ARROWS + SPACE',
  pad: false, phone: 'tap a square to probe.',
  init(s) {
    s.C = 22; s.Rw = 12; s.Z = 18; s.ox = 42; s.oy = 16; s.HH = 18;   // a BIG snowy yard, house strip above
    s.cam = !!s.camera;
    s.probes = s.left = [26, 22, 19][s.diff] + (Number(DDT.param('probes')) || 0);   // spare probe rods from Fernko's
    const wide = s.rnd() < 0.5, tw = wide ? 3 : 2, th = wide ? 2 : 3, L = 3 + Math.floor(s.rnd() * 2), arm = 3;   // the field: 2*arm+1 wide, L deep
    s.tc = arm - 1 + Math.floor(s.rnd() * (s.C - tw - 2 * arm + 2)); s.tr = Math.floor(s.rnd() * Math.max(1, s.Rw - th - 2 - L - 1));
    s.tank = new Set(); for (let c = s.tc; c < s.tc + tw; c++) for (let r = s.tr; r < s.tr + th; r++) s.tank.add(`${c},${r}`);
    s.pipeC = s.tc + Math.floor(tw / 2);
    const dr = Math.min(s.Rw - 1 - L, s.tr + th + 1 + Math.floor(s.rnd() * 2)), dc = clamp(s.pipeC, arm, s.C - 1 - arm);
    s.pipe = new Set(); for (let r = s.tr + th; r < dr; r++) s.pipe.add(`${s.pipeC},${r}`);   // the one solid line out of the tank
    if (dc !== s.pipeC) for (let c = Math.min(dc, s.pipeC); c <= Math.max(dc, s.pipeC); c++) s.pipe.add(`${c},${dr - 1}`);
    s.dbox = `${dc},${dr}`; s.dpos = { c: dc, r: dr }; s.L = L; s.arm = arm;
    s.leach = new Set();   // two squares side by side: the outside box, plus the center line straight down from the D-box
    for (let c = dc - arm; c <= dc + arm; c++) { s.leach.add(`${c},${dr}`); s.leach.add(`${c},${dr + L}`); }
    for (let r = dr; r <= dr + L; r++) { s.leach.add(`${dc - arm},${r}`); s.leach.add(`${dc + arm},${r}`); s.leach.add(`${dc},${r}`); }
    s.leach.delete(s.dbox);
    s.probed = {}; s.found = { tank: false, dbox: false }; s.cur = { c: 11, r: 6 }; s.msg = s.cam ? 'Camera says the pipe heads out here. Find the TANK.' : 'Find the TANK. No clues. Just you and a probe rod.';
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
    if (s.found.tank && s.found.dbox && !s.reveal) { s.reveal = 0.001; s.msg = 'Found it all! Tank, pipe, D-box, leach field.'; SFX('ding'); }
    if (s.reveal) { s.reveal += dt; if (s.reveal > 2.6) s.end = { win: true, stars: stars3(used <= 11, used <= 15), line: `Found the tank and the D-box with ${used} probes.` }; return; }   // let them look at it first
    else if (s.left <= 0) s.end = { win: false, stars: 0, line: 'Out of probes. Time to call the town for the septic plan.' };
  },
  near(set, c, r) { for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if (set.has(`${c + dc},${r + dr}`)) return true; return false; },
  probe(s, c, r) {
    const k = `${c},${r}`; if (s.probed[k] !== undefined) return;
    s.left--;
    if (!s.found.tank && s.tank.has(k)) { s.found.tank = true; s.tank.forEach(t => s.probed[t] = 'T'); s.msg = s.found.dbox ? '' : 'CLUNK! Tank found. Follow the outlet pipe to the D-BOX.'; SFX('clog'); return; }
    if (k === s.dbox) { s.probed[k] = 'D'; s.found.dbox = true; s.msg = s.found.tank ? '' : 'The D-box! Now find the TANK.'; SFX('clog'); return; }
    if (s.leach.has(k)) { s.probed[k] = 'L'; s.msg = 'Gravel. That is the leach field: the D-box is at its head.'; return; }
    if (s.pipe.has(k)) { s.probed[k] = 'P'; s.msg = 'Clink. A pipe. Follow it.'; return; }
    const target = s.found.tank ? new Set([s.dbox, ...s.pipe]) : s.tank;
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
    const cx = c => s.ox + c * s.Z + s.Z / 2, cy = r => gy + r * s.Z + s.Z / 2, show = !!s.reveal;
    if (s.found.tank) { const xs = [...s.tank].map(k => +k.split(',')[0]), ys = [...s.tank].map(k => +k.split(',')[1]), x0 = s.ox + Math.min(...xs) * s.Z, y0 = gy + Math.min(...ys) * s.Z, w = (Math.max(...xs) - Math.min(...xs) + 1) * s.Z, h = (Math.max(...ys) - Math.min(...ys) + 1) * s.Z;
      R(x0 - 1, y0 - 1, w + 2, h + 2, '#55595e'); R(x0 + 1, y0 + 1, w - 2, h - 2, '#8a8f94'); for (let i = 1; i < 4; i++) R(x0 + 2, y0 + i * h / 4, w - 4, 1, '#7a7f84');   // the concrete tank
      if (!SPC('septiclid', x0 + w / 2, y0 + h / 2, (Math.min(w, h)) / 55)) T('LID', x0 + w / 2, y0 + h / 2, '#fff', 5, 'center'); }
    if (show) {   // the whole system, drawn in once you've found it
      g.strokeStyle = '#3a3f46'; g.lineWidth = 4; g.beginPath(); const pc = [...s.pipe].map(k => k.split(',').map(Number));
      const tb = Math.max(...[...s.tank].map(k => +k.split(',')[1])); g.moveTo(cx(s.pipeC), gy + (tb + 1) * s.Z); for (const [c, r] of pc) g.lineTo(cx(c), cy(r)); g.lineTo(cx(s.dpos.c), cy(s.dpos.r)); g.stroke();
      const a = s.arm, d = s.dpos; g.strokeStyle = 'rgba(70,60,40,.85)'; g.lineWidth = 5; g.setLineDash([4, 3]);
      g.strokeRect(cx(d.c - a), cy(d.r), a * 2 * s.Z, s.L * s.Z); g.beginPath(); g.moveTo(cx(d.c), cy(d.r)); g.lineTo(cx(d.c), cy(d.r + s.L)); g.stroke(); g.setLineDash([]);
      R(cx(d.c) - 6, cy(d.r) - 6, 12, 12, '#6f747a'); R(cx(d.c) - 4, cy(d.r) - 4, 8, 8, '#9aa0a6'); T('D', cx(d.c), cy(d.r) + 1, '#222', 5, 'center');
      T('LEACH FIELD', cx(d.c), cy(d.r + s.L) + s.Z * 0.9, '#2a3346', 5, 'center'); }
    for (const k in s.probed) {
      const [c, r] = k.split(',').map(Number), p = s.probed[k], x = s.ox + c * s.Z, y = gy + r * s.Z;
      if (p === 'T') continue;
      if (p === 'P') { const has = (dc, dr) => s.pipe.has(`${c + dc},${r + dr}`) || (dc === 0 && dr === -1 && s.tank.has(`${c},${r - 1}`)) || `${c + dc},${r + dr}` === s.dbox, m = s.Z / 2;   /* the pipe runs the way it really goes */
        R(x + m - 3, y + m - 3, 6, 6, '#3a3f46'); if (has(0, -1)) R(x + m - 3, y, 6, m, '#3a3f46'); if (has(0, 1)) R(x + m - 3, y + m, 6, m, '#3a3f46'); if (has(-1, 0)) R(x, y + m - 3, m, 6, '#3a3f46'); if (has(1, 0)) R(x + m, y + m - 3, m, 6, '#3a3f46'); continue; }
      if (p === 'D') { R(x + 3, y + 3, s.Z - 6, s.Z - 6, '#6f747a'); T('D', x + s.Z / 2, y + s.Z / 2 + 1, '#fff', 5, 'center'); continue; }
      if (p === 'L') { R(x + 1, y + 1, s.Z - 2, s.Z - 2, '#9a8a6a'); T('GRV', x + s.Z / 2, y + s.Z / 2, '#fff', 5, 'center'); }
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
  how: ['The cleanout is gushing. Catch it in the bucket.', 'The stream sways with the pressure: follow it.', 'When the bucket is FULL, press SPACE to swap in an empty one (takes half a second).', 'Keep the floor mess from filling the bar until the line drains.'],
  ctl: '◀ ▶ MOVE  ·  SPACE = SWAP BUCKET',
  act: 'SWAP', dpad: 'lr',
  init(s) { s.DUR = 15; s.px = 240; s.fill = 0; s.swap = 0; s.mess = 0; s.buckets = 0; s.ph = s.rnd() * 6; s.blobs = []; s.drops = []; },
  update(s, dt, I) {
    s.t += dt; const k = s.k;
    const tt = s.t * k + s.ph;
    const p = clamp(0.5 + 0.3 * Math.sin(tt * 0.5) + 0.12 * Math.sin(tt * 1.1 + 1), 0, 1);
    s.land = 110 + p * 300;
    const flow = 17 + p * 11;
    mover1D(s, I, dt, 250 * HERO(s).spd, 30, W - 30);
    if (I.Ap && s.swap <= 0) { s.buckets++; s.fill = 0; s.swap = 0.35; SFX('splash', { vol: 0.3 }); }
    const inB = s.swap <= 0 && Math.abs(s.land - s.px) < 34; s.inB = inB;
    if (s.swap > 0) { s.swap -= dt; s.mess += flow * dt * 0.3; }
    else if (inB) { s.fill += flow * dt; if (s.fill > 100) { s.mess += (s.fill - 100) * 0.3; s.fill = 100; } }
    else s.mess += flow * dt * 0.3;
    if (!inB && s.rnd() < dt * 6) { const b = s.blobs.find(q => Math.abs(q.x - s.land) < 14); if (b) b.r = Math.min(34, b.r + 1.5); else s.blobs.push({ x: s.land + (s.rnd() - 0.5) * 10, r: 6 }); }   /* the mess spreads where it lands */
    for (let i = 0; i < 3; i++) if (s.rnd() < dt * 30) s.drops.push({ x: s.land + (s.rnd() - 0.5) * 8, y: inB ? 196 : 228, vx: (s.rnd() - 0.5) * 120, vy: -60 - s.rnd() * 90, l: 0.5 });
    for (const d of s.drops) { d.vy += 500 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.l -= dt; } s.drops = s.drops.filter(d => d.l > 0);
    if (s.mess >= 75) s.end = { win: false, stars: 0, line: 'It got everywhere.' };
    else if (s.t >= s.DUR) s.end = { win: true, stars: stars3(s.mess < 20, s.mess < 40), line: `Floor mess: ${Math.round(s.mess)}%. ${s.buckets} buckets.` };
  },
  draw(s) {   /* a basement: the cleanout tee on the wall gushing, you with a 5-gallon bucket chasing the stream */
    const FL = 232;
    if (!BGI('bg_basement')) { R(0, 0, W, H, '#3a3d42'); for (let y = 16; y < FL; y += 30) for (let x = (y / 30 % 2) * 30; x < W; x += 60) R(x, y, 58, 28, '#45494f'); } else { g.globalAlpha = 0.3; R(0, 0, W, H, '#10151f'); g.globalAlpha = 1; }
    R(0, FL, W, H - FL, '#7e8288'); R(0, FL, W, 2, '#9aa0a6'); for (let x = 0; x < W; x += 48) R(x, FL + 2, 1, H, '#6e7278');   /* concrete floor */
    for (const b of s.blobs) { g.fillStyle = '#5a3a1c'; g.beginPath(); g.ellipse(b.x, FL + 6, b.r * 1.6, 3 + b.r * 0.18, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(200,160,100,.45)'; g.beginPath(); g.ellipse(b.x - b.r * 0.4, FL + 4, b.r * 0.5, 1.2, 0, 0, 7); g.fill(); }   /* puddles, with a wet shine */
    // the cleanout: a 4" PVC stack on the wall with a tee, the cap blown off and hanging on the floor
    R(10, 16, 18, FL - 16, '#e8e4d8'); R(10, 16, 4, FL - 16, '#ffffff'); R(24, 16, 4, FL - 16, '#c9c4b8');
    R(10, 62, 30, 30, '#e8e4d8'); R(10, 62, 30, 4, '#fff'); R(36, 60, 8, 34, '#d8d4c8'); R(42, 64, 3, 26, '#5a3a1c');   /* the tee and its open mouth */
    g.save(); g.translate(30, FL - 4); g.rotate(-0.4); R(-8, -3, 16, 6, '#e8e4d8'); R(-3, -6, 6, 3, '#c9c4b8'); g.restore();   /* the cap, on the floor */
    // the stream: a thick arc, darker core, light streaks and chunks riding it
    const P = u => { const x0 = 44, y0 = 77, cx = 44 + (s.land - 44) * 0.6, cy = 40, x1 = s.land, y1 = s.inB ? 196 : FL - 2; const a = 1 - u; return [a * a * x0 + 2 * a * u * cx + u * u * x1, a * a * y0 + 2 * a * u * cy + u * u * y1]; };
    for (const [wd, col] of [[13, '#4a2e14'], [9, '#7a4a1e'], [4, '#a06a34']]) { g.strokeStyle = col; g.lineWidth = wd; g.lineCap = 'round'; g.beginPath(); for (let u = 0; u <= 1.001; u += 0.05) { const [x, y] = P(u); u ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
    for (let i = 0; i < 6; i++) { const u = (s.t * 1.6 + i / 6) % 1, [x, y] = P(u); R(x - 2, y - 2, 4, 3, i % 3 ? '#c9a640' : '#f2e6c0'); }   /* corn and paper riding the stream */
    for (const d of s.drops) R(d.x, d.y, 2, 2, '#7a4a1e');
    // you and the bucket
    const who = s.hero || 'matt'; HERO_AT(s, s.px - 30, FL + 2, 2.4, { horiz: true });
    if (s.swap <= 0) { const lv = s.fill / 100, col = s.fill > 80 ? '#e9665a' : '#f7c418';
      g.fillStyle = '#e07a1f'; g.beginPath(); g.moveTo(s.px - 20, FL - 40); g.lineTo(s.px + 20, FL - 40); g.lineTo(s.px + 16, FL); g.lineTo(s.px - 16, FL); g.fill();   /* the 5-gallon bucket */
      R(s.px - 20, FL - 42, 40, 4, '#f29a4a'); R(s.px - 16, FL - 26, 32, 2, '#c45f1e'); R(s.px - 16, FL - 14, 32, 2, '#c45f1e');
      g.fillStyle = '#5a3a1c'; g.beginPath(); g.ellipse(s.px, FL - 40 + (1 - lv) * 4, 18, 2.5 + lv * 1.5, 0, 0, 7); g.fill();   /* what's in it */
      R(s.px + 24, FL - 40, 5, 40, 'rgba(0,0,0,.5)'); R(s.px + 24, FL - 40 * lv, 5, 40 * lv, col);   /* the fill gauge */
      if (s.fill >= 100) T('FULL! SWAP!', s.px, FL - 54, '#e9665a', 8, 'center'); else if (s.fill > 80) T('ALMOST FULL', s.px, FL - 54, '#f7c418', 6, 'center'); }
    else T('SWAP...', s.px, FL - 30, '#f7c418', 8, 'center');
    HUD(s, 'OVERFLOW CONTROL', s.DUR - s.t);
    BAR(6, 30, 120, 8, s.mess / 75, s.mess > 50 ? '#e9665a' : '#f7c418', 'FLOOR MESS');
  },
});

// =====================================================================
// TUNNEL — the shared 3D pipe view (Sewer Camera, Snake the Line, Jetter Pulse, Thaw It Out).
// One ray per pixel into a round pipe of radius 1; the camera sits at (ox, oy) inside it looking down the pipe.
// Distances are in feet ahead; a thing f ft ahead is at ray depth f + 2.6. Things that fill the pipe (ice, a clog face)
// are "plugs" with a hole that opens as you clear them. Dithered and posterized to read as pixel art.
const TUNNEL = {
  BW: 300, BH: 180, BF: 450, F: 900, NEAR: 2.6,
  init() {
    if (this.DX) return; const { BW, BH, BF } = this, n = BW * BH; this.DX = new Float32Array(n); this.DY = new Float32Array(n); this.A = new Float32Array(n);
    for (let py = 0; py < BH; py++) for (let px = 0; px < BW; px++) { const k = py * BW + px, dx = (px + 0.5 - BW / 2) / BF, dy = (py + 0.5 - BH / 2) / BF; this.DX[k] = dx; this.DY[k] = dy; this.A[k] = dx * dx + dy * dy; }
    this.buf = document.createElement('canvas'); this.buf.width = BW; this.buf.height = BH; this.bx = this.buf.getContext('2d'); this.img = this.bx.createImageData(BW, BH);
  },
  proj(f, X, Y, ox, oy) {   /* a point in the pipe (X, Y in radii) f ft ahead -> screen (game px, before roll/sway), and the pipe's radius there */
    const zz = f + this.NEAR; return [240 + ((X || 0) - ox) * this.F / zz, 132 + ((Y || 0) - oy) * this.F / zz, this.F / zz];
  },
  hash(a, b) { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; },
  // o: { D, t, pvc, ox, oy, defs (camera-style list with d in ft), frost 0..1, plugs [{ f, hole, kind: 'ice'|'litter'|'beads'|'debris'|'grease', seed }], flow: +1 away / -1 toward you, water: base half-width (radians), light }
  paint(o) {
    this.init(); const { DX, DY, A, img, BW, BH } = this, d = img.data, hash = this.hash, HALF = Math.PI / 2;
    const D = o.D, t = o.t, PVC = o.pvc, ox = o.ox || 0, oy = o.oy == null ? 0.38 : o.oy, frost = o.frost || 0, flow = o.flow || 1, LT = o.light || 1;
    const defs = (o.defs || []).filter(q => q.d - D > -2 && q.d - D < 34);
    const cracks = defs.filter(q => q.kind === 'crack'), bellies = defs.filter(q => q.kind === 'belly'), greases = defs.filter(q => q.kind === 'grease' && q.ang <= 3), offs = defs.filter(q => q.kind === 'offset');
    const plugs = (o.plugs || []).filter(q => q.hole < 0.995).map(q => ({ ...q, z: q.f + this.NEAR })).sort((a, b) => a.z - b.z);
    const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], c0 = ox * ox + oy * oy - 1, wbase = o.water == null ? 0.32 : o.water;
    for (let k = 0, n = BW * BH; k < n; k++) {
      const dx = DX[k], dy = DY[k], a = A[k], b = 2 * (ox * dx + oy * dy), z = (-b + Math.sqrt(b * b - 4 * a * c0)) / (2 * a), hx = ox + z * dx, hy = oy + z * dy;
      let r, g_, bl, shine = 0, L, faced = false;
      // a plug in the way? (the first one whose face is nearer than the wall, unless the ray goes through its hole)
      for (const q of plugs) { if (q.z >= z) break; const px_ = ox + dx * q.z, py_ = oy + dy * q.z, rr = Math.sqrt(px_ * px_ + py_ * py_); if (rr < q.hole * 0.92) continue;
        const u = Math.floor((px_ + 1) * 14), v = Math.floor((py_ + 1) * 14), h1 = hash(u + q.seed * 31, v), h2 = hash(Math.floor((px_ + 1) * 40) + q.seed, Math.floor((py_ + 1) * 40)), rim = rr < q.hole * 0.92 + 0.08;
        if (q.kind === 'ice') { r = 118 + h1 * 30; g_ = 168 + h1 * 26; bl = 206 + h1 * 20; if (h2 > 0.95) { r = 230; g_ = 244; bl = 255; }   /* clear ice with trapped bubbles */
          const cr1 = Math.sin(px_ * 4.3 + py_ * 1.7 + q.seed) + 0.35 * Math.sin(py_ * 11 + q.seed), cr2 = Math.sin(py_ * 3.7 - px_ * 2.9 + q.seed * 2) + 0.35 * Math.sin(px_ * 13); if (Math.abs(cr1) < 0.05 || Math.abs(cr2) < 0.04) { r += 60; g_ += 50; bl += 40; } }   /* white fracture lines */
        else if (q.kind === 'litter') { r = 150 + h2 * 50; g_ = 140 + h2 * 44; bl = 118 + h2 * 34; if (h1 > 0.8) { r -= 40; g_ -= 40; bl -= 34; } }   /* packed clumping litter */
        else if (q.kind === 'beads') { const hb = hash(Math.floor((px_ + 1) * 9) + q.seed, Math.floor((py_ + 1) * 9)), cx = ((px_ + 1) * 9) % 1 - 0.5, cy = ((py_ + 1) * 9) % 1 - 0.5, inb = cx * cx + cy * cy < 0.2;
          const pal = [[120, 200, 255], [255, 140, 190], [150, 240, 160], [255, 220, 120], [200, 160, 255]][Math.floor(hb * 5)]; if (inb) { r = pal[0]; g_ = pal[1]; bl = pal[2]; if (cx < -0.1 && cy < -0.1) shine = 1; } else { r = pal[0] * 0.45; g_ = pal[1] * 0.45; bl = pal[2] * 0.45; } }   /* swollen water beads */
        else if (q.kind === 'grease') { r = 200 + h1 * 30; g_ = 180 + h1 * 26; bl = 110 + h1 * 20; if (h2 > 0.88) shine = 1; }
        else { r = 96 + h1 * 60; g_ = 60 + h1 * 40; bl = 28 + h1 * 22; if (h2 > 0.9) { r = 232; g_ = 230; bl = 222; } }   /* debris, a wipe here and there */
        if (rim && q.hole > 0.02) { r *= 0.55; g_ *= 0.55; bl *= 0.55; }   /* the edge of the hole you've cut */
        L = Math.min(q.kind === 'ice' ? 0.95 : 1.15, 1.25 / (1 + (q.z / 13) * (q.z / 13))) * (1 - 0.25 * rr) * LT; faced = true; break; }
      if (!faced) {
        const th = Math.atan2(hy, hx), w = D + z - this.NEAR;
        if (PVC) { r = 226; g_ = 223; bl = 212; const mt = hash(Math.floor(th * 9), Math.floor(w * 3)); r -= mt * 8; g_ -= mt * 8; bl -= mt * 8; if (Math.abs(th + HALF) < 0.05 && (Math.floor(w * 1.5) % 3)) { r -= 60; g_ -= 66; bl -= 40; } }
        else { const m = hash(Math.floor(th * 7), Math.floor(w * 2.2)), m2 = hash(Math.floor(th * 15) + 7, Math.floor(w * 5)); r = 104 + m * 26; g_ = 86 + m * 18; bl = 70 + m * 10; if (m2 > 0.86) { r += 46; g_ += 18; bl -= 10; } if (m2 < 0.08) { r -= 30; g_ -= 26; bl -= 22; } }
        const jf = w / 4 - Math.floor(w / 4), jw = 0.012 + 0.04 / z;
        if (jf < jw) { if (PVC) { r *= 0.72; g_ *= 0.72; bl *= 0.70; } else { r *= 0.45; g_ *= 0.42; bl *= 0.40; } } else if (jf < jw * 2.4 && !PVC) { r *= 1.15; g_ *= 1.1; bl *= 1.05; }
        for (const q of offs) { const dw = w - q.d; if (dw > -0.12 && dw < 1.5) { const c = Math.cos(th - q.ang), wid = 0.16 + 1.25 * Math.abs(c);   /* big, easy-to-read step */
          if (dw < 0.05) { r = 6; g_ = 5; bl = 4; } else   /* the whole joint steps: next pipe shifted toward q.ang */
          if (c > 0.05 && dw < wid) { r = 14; g_ = 12; bl = 10; }   /* the gap where the next pipe dropped away */
          else if (c < -0.05 && dw < wid) { r = PVC ? 240 : 196; g_ = PVC ? 236 : 150; bl = PVC ? 220 : 96; shine = dw < 0.15 ? 1 : 0; }   /* the lip of the next pipe, sticking into the flow, facing you */
          else if (Math.abs(c) <= 0.1 && dw < 0.05) { r *= 0.4; g_ *= 0.4; bl *= 0.4; } } }
        for (const q of cracks) { const dw = w - q.d; if (Math.abs(dw) < 1.3) { let da = th - q.ang; da = Math.atan2(Math.sin(da), Math.cos(da));
          if (q.ang > 4.5) { if (Math.abs(dw) < 0.55 && Math.abs(da) < 0.5 - 0.25 * hash(Math.floor(dw * 9), Math.floor(da * 9))) { r = 8; g_ = 6; bl = 5; } }
          else { const jag = Math.sin(dw * 11 + q.ang * 3) * 0.07 + Math.sin(dw * 29) * 0.03; if (Math.abs(da - jag) < 0.038 + 0.02 / z) { r *= 0.15; g_ *= 0.13; bl *= 0.12; } } } }
        for (const q of greases) { const dw = w - q.d; if (Math.abs(dw) < 2.2 && th < 0.3) { const blob = hash(Math.floor(th * 5 + 40), Math.floor(w * 1.6)) + hash(Math.floor(th * 2.5 + 9), Math.floor(w * 0.8)) * 0.7; if (blob > 1.0 + Math.abs(dw) * 0.15) { r = 214; g_ = 190; bl = 112; if (hash(Math.floor(th * 30), Math.floor(w * 12)) > 0.8) shine = 1; } } }
        if (frost > 0) { const fr = hash(Math.floor(th * 40), Math.floor(w * 14)), fz = frost * (0.45 + 0.55 * hash(Math.floor(th * 6) + 3, Math.floor(w * 2)));   /* frost feathering the walls */
          if (fr < fz) { r = r * 0.35 + 210; g_ = g_ * 0.3 + 226; bl = bl * 0.2 + 240; if (fr < fz * 0.15) shine = 1; } }
        let wh = wbase; for (const q of bellies) { const dw = Math.abs(w - q.d); if (dw < 3.2) wh = Math.max(wh, 1.15 * (1 - dw / 3.2) + wbase); }
        const fb = Math.abs(th - HALF);
        if (fb < wh) { const deep = 1 - fb / wh; r = r * 0.25 + 52 * (1 - deep * 0.4); g_ = g_ * 0.25 + 74 * (1 - deep * 0.3); bl = bl * 0.25 + 70; if (Math.sin(w * 4 - flow * t * 5) * Math.sin(th * 16 + w * 2.5) > 0.72) shine = 1; }
        const ix = hx * dx + hy * dy, inc = Math.max(0.15, ix / Math.sqrt(a + 1));
        L = (0.3 + 0.7 * Math.sqrt(inc)) / (1 + (z / 13) * (z / 13)) * 1.3 * LT;
      }
      if (shine) L = Math.max(L, 0.9 / (1 + (faced ? 0 : z * z / 220)));
      const px = k % BW, py = (k / BW) | 0; L = Math.max(0, Math.min(1.25, Math.round((L + (BAY[(py & 3) * 4 + (px & 3)] / 16 - 0.5) / 9) * 6) / 6));
      const o4 = k * 4, sh = shine ? 40 * L : 0; d[o4] = Math.min(255, r * L + sh); d[o4 + 1] = Math.min(255, g_ * L + sh); d[o4 + 2] = Math.min(255, bl * L + sh * 0.75); d[o4 + 3] = 255;
    }
    this.bx.putImageData(img, 0, 0); return this.buf;
  },
  // draw the view: rolled by `roll` radians about the centre, shifted sideways by `sway` px (the pipe bending away)
  draw(o, roll, sway) { const buf = this.paint(o); g.save(); g.translate(240, 132); g.rotate(roll || 0); g.translate(-240, -132); g.imageSmoothingEnabled = false; g.drawImage(buf, 240 - this.BW + (sway || 0), 132 - this.BH, this.BW * 2, this.BH * 2); g.restore(); },
  vignette(a) { const vg = g.createRadialGradient(240, 132, 140, 240, 132, 300); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${a == null ? 0.6 : a})`); g.fillStyle = vg; g.fillRect(0, 0, W, H); },
};

// =====================================================================
// 6. SEWER CAMERA — you're looking at the camera monitor, straight down the pipe. Push it, tag what's wrong, pick the right branch, find the clog.
GAMES.push({
  id: 'camera', name: 'SEWER CAMERA', tag: 'Scope the line · tag the problems · find the clog',
  how: ['This is the camera monitor: you are looking down the pipe. Push the camera with ▲ (▼ backs up). Watch the footage counter.', 'The head rolls and wanders as it goes. Keep it LEVEL with ◀ ▶ or the picture tumbles and you lose time.', 'Offset joints catch the head: keep pushing ▲ hard to pop it over the lip.', 'Tag every problem with SPACE when it is in the yellow box. Most of the line is GOOD pipe: tagging good pipe counts against you. Find the clog.'],
  dpad: 'omni',
  ctl: '▲ PUSH · ▼ BACK · ◀ ▶ KEEP LEVEL · SPACE = TAG',
  act: 'TAG',
  init(s) {
    s.TIME = [120, 110, 100][s.diff]; s.d = 0; s.v = 0; s.FORK = 1e9; s.CLOG = 420 + s.rnd() * 140; s.FT = (70 + s.rnd() * 50) / s.CLOG;   /* the run is long to PLAY, but the counter reads real-world feet: the clog sits at 70-120 ft */   /* a long run: mostly good pipe, so you learn what NOT to tag */ s.CAP = 1e9; s.lvl = 0; s.lvlV = 0; s.push = 0; s.tumble = 0;   // one straight run of pipe, no branches
    s.good = s.rnd() < 0.5 ? -1 : 1; s.choice = 0; s.branch = 0; s.snag = 0; s.snags = 0; s.wrong = 0; s.misses = 0; s.msg = ''; s.msgT = 0; s.flash = 0;
    s.PVC = s.rnd() < 0.5;   // white plastic or old cast iron
    const kinds = ['roots', 'crack', 'offset', 'belly', 'grease', 'roots', 'offset'];
    s.def = []; const add = (a, b, n) => { for (let i = 0; i < n; i++) s.def.push({ d: a + (b - a) * (i + 0.3 + s.rnd() * 0.4) / n, kind: kinds[Math.floor(s.rnd() * kinds.length)], ang: s.rnd() * 6.28, br: a >= s.FORK ? 1 : 0, tagged: false }); };
    add(14, s.CLOG - 10, [7, 8, 9][s.diff]); s.def.forEach(o => { o.br = 0; if (o.kind === 'offset') o.ang = s.rnd() < 0.75 ? (s.rnd() < 0.5 ? -Math.PI / 2 : Math.PI / 2) : (s.rnd() < 0.5 ? 0 : Math.PI); });   /* offsets: mostly the pipe dropped or lifted, sometimes shoved sideways */
    s.def.push({ d: s.CLOG, kind: 'clog', ang: 0, br: 0, tagged: false });
  },
  bend(s, z) { return 46 * Math.sin(z / 40) + 20 * Math.sin(z / 17 + 1); },
  update(s, dt, I) {
    s.t += dt; FX(s, dt); s.msgT = Math.max(0, s.msgT - dt); s.flash = Math.max(0, s.flash - dt); s.branch = 0;
    const say = (m, t = 1.2) => { s.msg = m; s.msgT = t; };
    const pd = I.ptr.down, px = I.ptr.x, py = I.ptr.y;
    const up = I.U || (pd && py < 90), dn = I.D || (pd && py > 210);
    const lft = I.L || (pd && py >= 90 && py <= 210 && px < 150), rgt = I.R || (pd && py >= 90 && py <= 210 && px > 330);
    // keeping it level: the head rolls with the pipe's bends and wanders on its own; you steer against it
    const bendK = (this.bend(s, s.d + 1) - this.bend(s, s.d)) / 30;
    s.lvlV += ((bendK * s.v * 0.9) + Math.sin(s.t * 1.7 + s.d * 0.3) * 0.5 * s.k + (lft ? 1.9 : 0) - (rgt ? 1.9 : 0) - s.lvl * 0.6) * dt;
    s.lvlV *= Math.pow(0.35, dt); s.lvl = clamp(s.lvl + s.lvlV * dt, -1.3, 1.3);
    if (s.tumble > 0) { s.tumble -= dt; s.v = 0; if (s.tumble <= 0) { s.lvl = 0; s.lvlV = 0; say('BACK UPRIGHT.', 0.8); } return; }
    if (Math.abs(s.lvl) > 1.15) { s.tumble = 1.6; s.shake = 0.4; SFX('clog', { vol: 0.5 }); say('THE HEAD FLIPPED OVER! WAIT FOR IT...', 1.6); return; }
    // pushing: creeps on its own, ▲ pushes, ▼ backs up; crooked = slow
    let want = 5; if (up) want = 19 * HERO(s).spd; if (dn) want = -10;
    want *= Math.abs(s.lvl) > 0.6 ? 0.45 : 1;
    if (s.snag > 0) {   // stuck on an offset: shove it over the lip
      want = Math.min(0, want); if (I.Up || (I.ptr.clicked && py < 90)) s.push += 0.34; if (up) s.push += dt * 0.55; s.push = Math.max(0, s.push - dt * 0.25);
      if (s.push >= 1) { s.snag = 0; s.push = 0; s.d += 1.4; s.v = 3; s.shake = 0.25; SFX('clog', { vol: 0.6 }); say('POPPED OVER THE LIP.', 1); }
      if (dn) { s.snag = 0; s.push = 0; }
    }
    s.v += (want - s.v) * Math.min(1, dt * 4);
    const before = s.d; s.d = Math.max(0, s.d + s.v * dt); if (s.d > s.CLOG - 1.2) { s.d = s.CLOG - 1.2; if (s.v > 2 && !s.wall) { s.shake = 0.25; say('HEAD IS UP AGAINST IT. TAG IT!', 1.4); } s.wall = 1; s.v = Math.min(s.v, 0); } else s.wall = 0;   /* the clog is a wall: you can't push past it */
    for (const o of s.def) if (o.kind === 'offset' && before < o.d - 0.8 && s.d >= o.d - 0.8 && !o.popped) {   // every offset joint catches the head
      o.popped = true; s.d = o.d - 0.85; s.v = 0; s.snag = 1; s.push = 0; s.snags++; s.shake = 0.3; SFX('clog', { vol: 0.5 }); say('OFFSET JOINT! PUSH HARD (TAP ▲ ▲ ▲)', 1.8); }
    // TAG
    if (I.Ap || (I.ptr.clicked && py >= 90 && py <= 210 && px >= 150 && px <= 330)) {
      const inBox = s.def.filter(o => !o.tagged && o.d - s.d > 0.4 && o.d - s.d < 6.5);
      if (inBox.length) { const o = inBox[0]; o.tagged = true; s.flash = 0.25; SFX('ui_select'); POP(s, 240, 120, `TAGGED: ${this.label(o.kind)} @ ${(o.d * s.FT).toFixed(1)} FT`, '#7dffb0');
        if (o.kind === 'clog') { SFX('drain'); const all = s.def.filter(x => x.kind !== 'clog'), got = all.filter(x => x.tagged).length;
          s.end = { win: true, stars: stars3(got === all.length && s.misses <= 2, got >= all.length / 2 && s.misses <= 5), line: `Found the clog at ${(o.d * s.FT).toFixed(0)} feet. Tagged ${got} of ${all.length} problems${s.misses ? `, ${s.misses} false tag${s.misses > 1 ? 's' : ''}` : ''}.` }; } }
      else { s.misses++; SFX('click', { vol: 0.3 }); say('NOTHING IN THE BOX', 0.7); }
    }
    if (s.t >= s.TIME) s.end = { win: false, stars: 0, line: "Ran out of time. Customer's watching the clock. No report." };
  },
  label(k) { return { roots: 'ROOTS', crack: 'CRACK', offset: 'OFFSET JOINT', belly: 'BELLY (STANDING WATER)', grease: 'GREASE', clog: 'THE CLOG' }[k]; },
  OY: 0.38,
  proj(z) { const [x, y, r] = TUNNEL.proj(z, 0, 0, 0, this.OY); return [x, y, r]; },
  paint(s) { return TUNNEL.paint({ D: s.d, t: s.t, pvc: s.PVC, ox: 0, oy: this.OY, defs: s.def }); },
  draw(s) {
    const t = s.t, D = s.d, CX = 240, CY = 132;
    R(0, 0, W, H, '#050605');
    g.save(); g.translate(CX, CY); g.rotate(s.lvl * 0.75 + (s.tumble > 0 ? s.t * 9 : 0)); g.translate(-CX, -CY);   // the picture rolls when the head rolls
    const sway = (this.bend(s, D + 3) - this.bend(s, D)) * 0.35;   /* the view drifts as the pipe wanders */
    { const buf = this.paint(s); g.imageSmoothingEnabled = false; g.drawImage(buf, CX - TUNNEL.BW + sway, CY - TUNNEL.BH, TUNNEL.BW * 2, TUNNEL.BH * 2); }
    const path = z => { const [x, y] = this.proj(z); return [x + sway, y]; }, rad = z => this.proj(z)[2];
    const zEnd = 30;
    // the problems, far to near
    const vis = s.def.filter(o => o.d - D > 0.4 && o.d - D < 28).sort((a, b) => b.d - a.d);
    for (const o of vis) {
      const z = o.d - D; let [x, y] = path(z); const r = rad(z), a = o.ang;
      if (o.kind === 'crack' || o.kind === 'belly' || o.kind === 'offset' || (o.kind === 'grease' && o.ang <= 3)) { if (o.tagged) T('TAG', x + r * 0.6, y - r * 0.6, '#7dffb0', 6, 'center'); continue; }   /* painted on the pipe wall */
      const wx = x + Math.cos(a) * r * 0.82, wy = y + Math.sin(a) * r * 0.82, k = Math.max(0.4, r / 60);
      { const im = null;
        if (im) { g.save(); g.beginPath(); g.arc(x, y, r * 1.02, 0, 7); g.clip(); g.drawImage(im, x - r * 1.08, y - r * 1.08, r * 2.16, r * 2.16); g.restore(); if (o.tagged) T('TAG', x + r * 0.6, y - r * 0.6, '#7dffb0', 6, 'center'); continue; } }   // the drawn camera views
      if (o.kind === 'roots') {   // a curtain of roots hanging through a joint: thick at the top, thin and swaying at the tips, with hairs
        for (let i = 0; i < 14; i++) { const ax = -0.85 + i * 0.13, sx = x + ax * r, sy = y - Math.sqrt(Math.max(0, 1 - ax * ax)) * r * 0.97, len = r * (0.45 + ((i * 37) % 10) / 14), sw = Math.sin(t * 1.6 + i * 1.3) * r * 0.06;
          let px0 = sx, py0 = sy; for (let k = 1; k <= 6; k++) { const f = k / 6, nx = sx + sw * f * f * 2 + Math.sin(i * 2.1 + k) * r * 0.02, ny = sy + len * f;
            g.strokeStyle = k < 3 ? '#7a5a32' : '#a4825a'; g.lineWidth = Math.max(0.6, (1 - f * 0.8) * r * 0.045); g.beginPath(); g.moveTo(px0, py0); g.lineTo(nx, ny); g.stroke();
            if (k > 2 && (i + k) % 2) { g.lineWidth = Math.max(0.5, r * 0.01); g.beginPath(); g.moveTo(nx, ny); g.lineTo(nx + ((k % 2) ? 1 : -1) * r * 0.05, ny + r * 0.04); g.stroke(); }   // root hairs
            px0 = nx; py0 = ny; } } }
      else if (o.kind === 'crack') { g.strokeStyle = '#1a1612'; g.lineWidth = Math.max(1, k * 0.8); g.beginPath(); g.moveTo(wx, wy - r * 0.3); for (let i = 1; i < 6; i++) g.lineTo(wx + (i % 2 ? 1 : -1) * r * 0.06, wy - r * 0.3 + i * r * 0.12); g.stroke(); }
      else if (o.kind === 'offset') { g.fillStyle = s.PVC ? 'rgba(120,118,108,.9)' : 'rgba(20,18,16,.95)'; g.beginPath(); g.arc(x, y, r * 0.98, Math.PI * 0.85, Math.PI * 2.15); g.arc(x + r * 0.3, y + r * 0.24, r * 0.76, Math.PI * 2.15, Math.PI * 0.85, true); g.fill();   // the lip where one pipe sits lower than the next
        g.strokeStyle = s.PVC ? '#9a968a' : '#1a1612'; g.lineWidth = Math.max(2, r * 0.12); g.beginPath(); g.arc(x + r * 0.12, y + r * 0.08, r * 0.95, 0, 7); g.stroke(); g.strokeStyle = 'rgba(232,130,42,.9)'; g.lineWidth = Math.max(2, r * 0.07); g.beginPath(); g.arc(x + r * 0.12, y + r * 0.08, r * 0.9, -0.7, 1.1); g.stroke(); }   // the lip of the shifted pipe catches the light
      else if (o.kind === 'belly') { g.fillStyle = 'rgba(70,110,140,.75)'; g.beginPath(); g.ellipse(x, y + r * 0.62, r * 0.75, r * 0.3, 0, 0, Math.PI); g.fill(); R(x - r * 0.5, y + r * 0.6 + Math.sin(t * 2) * k, r, Math.max(1, k), 'rgba(200,230,255,.5)'); }
      else if (o.kind === 'grease') { for (let i = 0; i < 6; i++) { const bx = x + (i - 2.5) * r * 0.16 + Math.sin(i * 3.1) * r * 0.04, by = y + r * (0.32 + (i % 2) * 0.06) + Math.sin(t * 2 + i) * r * 0.015, br = r * (0.07 + (i % 3) * 0.025);   /* grease balls bobbing on the water */
        g.fillStyle = '#b89a50'; g.beginPath(); g.arc(bx, by + r * 0.5, br, 0, 7); g.fill(); g.fillStyle = '#e2cc86'; g.beginPath(); g.arc(bx - br * 0.3, by + r * 0.5 - br * 0.3, br * 0.45, 0, 7); g.fill(); } }
      else if (o.kind === 'clog') {   /* a wall of debris filling the pipe: lumps lit by the camera, darker toward the rim, wipes and paper caught in it */
        const kit = s.room === 'kitchen', lit = Math.max(0.25, 1 / (1 + (z / 13) * (z / 13))), C3 = kit ? [[40, 36, 30], [66, 60, 48], [96, 88, 70]] : [[84, 52, 24], [122, 80, 38], [160, 112, 58]];
        const col = (c, f) => `rgb(${c.map(v => Math.round(v * f * lit)).join(',')})`, px2 = Math.max(1, r / 22);
        g.save(); g.beginPath(); g.arc(x, y, r * 0.97, 0, 7); g.clip();
        g.fillStyle = col(C3[0], 0.8); g.fillRect(x - r, y - r * 0.55, r * 2, r * 2);   /* the mass, from just above the middle down */
        for (let i = 0; i < 70; i++) { const h1 = Math.sin(i * 12.9898 + o.d) * 43758.5453, u = h1 - Math.floor(h1), h2 = Math.sin(i * 78.233 + o.d) * 12543.17, v = h2 - Math.floor(h2);
          const bx = x + (u * 2 - 1) * r * 0.95, by = y - r * 0.5 + v * r * 1.5, rr = r * (0.05 + ((i * 7) % 5) * 0.025), sh = 0.75 + 0.5 * (1 - Math.hypot(bx - x, by - y) / r);
          g.fillStyle = col(C3[i % 3], sh); g.fillRect(Math.round(bx - rr), Math.round(by - rr), Math.round(rr * 2), Math.round(rr * 1.6));
          g.fillStyle = col([220, 200, 160], sh * 0.6); g.fillRect(Math.round(bx - rr * 0.6), Math.round(by - rr * 0.8), Math.round(px2 * 2), Math.round(px2)); }   /* wet highlights */
        for (let i = 0; i < 3; i++) { const wx2 = x + (i - 1) * r * 0.42, wy2 = y - r * 0.25 + (i % 2) * r * 0.3; g.fillStyle = col([238, 236, 228], 1); g.fillRect(Math.round(wx2 - r * 0.17), Math.round(wy2), Math.round(r * 0.34), Math.round(r * 0.13)); g.fillStyle = col([200, 196, 186], 1); g.fillRect(Math.round(wx2 - r * 0.17), Math.round(wy2 + r * 0.1), Math.round(r * 0.34), Math.round(px2)); }   /* wipes */
        g.restore(); }
      if (o.tagged) T('TAG', x + r * 0.6, y - r * 0.6, '#7dffb0', 6, 'center');
    }
    g.restore();
    // the camera's own light falling off, and a vignette like a real monitor
    const vg = g.createRadialGradient(CX, CY, 140, CX, CY, 300); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.6)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    // the TAG box: things between 1 and 6.5 feet ahead
    const [bx, by] = path(4.6), br = rad(4.6) * 0.8; g.strokeStyle = 'rgba(247,196,24,.75)'; g.lineWidth = 2; const bs = br * 1.15;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.beginPath(); g.moveTo(bx + sx * bs, by + sy * bs * 0.6); g.lineTo(bx + sx * bs, by + sy * bs); g.lineTo(bx + sx * bs * 0.6, by + sy * bs); g.stroke(); }
    // monitor overlay: footage counter, REC, scanlines
    for (let y = 16; y < H; y += 3) R(0, y, W, 1, 'rgba(0,0,0,.18)');
    R(8, 20, 92, 20, 'rgba(0,0,0,.55)'); T(`${(s.d * s.FT).toFixed(1).padStart(5, '0')} FT`, 14, 30, '#7dffb0', 10);   // footage counter
    { const gx = 240, gy = 252; R(gx - 60, gy - 5, 120, 10, 'rgba(0,0,0,.6)'); R(gx - 14, gy - 5, 28, 10, 'rgba(125,255,176,.25)'); R(gx - 2 + clamp(s.lvl, -1.2, 1.2) * 50, gy - 6, 4, 12, Math.abs(s.lvl) > 0.6 ? '#e9665a' : '#7dffb0'); T('LEVEL', gx - 66, gy, '#7dffb0', 5, 'right'); } T(s.PVC ? 'PVC 4"' : 'CAST IRON 4"', 12, 44, '#7dffb0', 5);
    if (Math.floor(t * 2) % 2) { C(W - 70, 28, 3, '#e9665a'); } T('REC', W - 62, 28, '#e9665a', 6);
    const tagged = s.def.filter(o => o.tagged && o.kind !== 'clog').length; T(`TAGS ${tagged}`, W - 12, 44, '#f7c418', 6, 'right');
    if (s.flash > 0) { g.globalAlpha = s.flash * 2; R(0, 16, W, H, '#fff'); g.globalAlpha = 1; }
    if (s.msgT > 0) T(s.msg, 240, 236, '#f7c418', 7, 'center');
    if (s.snag > 0) { T('SNAGGED · PUSH!', 240, 206, '#e9665a', 9, 'center'); R(190, 214, 100, 6, 'rgba(0,0,0,.6)'); R(190, 214, 100 * Math.min(1, s.push), 6, '#f7c418'); }
    DRAWFX(s); HUD(s, 'SEWER CAMERA', s.TIME - s.t);
  },
});

// =====================================================================
// 7. GAG METER — Fishy Pissy. Turn the cap in the stink; step back to fresh air to recover.
GAMES.push({
  id: 'gag', name: 'FISHY PISSY', tag: 'The worst smell in the North Country',
  how: ['The cap is on the cleanout (right). Tap SPACE there to turn it. Every turn lets more stink out.', 'Hold ▼ to hold your breath before you walk into the cloud. Cranking the cap burns through your breath fast.', 'You can only get your breath back in the FRESH AIR by the door (left). Run out of breath in the cloud and you gag.', 'Every few turns the cap sticks: HOLD SPACE to crank it loose. Gag out 3 times and you lose.'],
  dpad: 'omni',
  act2: 'HOLD BREATH',
  ctl: '◀ ▶ WALK  ·  SPACE = TURN CAP (HOLD WHEN STUCK)  ·  HOLD ▼ / SHIFT = HOLD BREATH',
  act: 'TURN',
  init(s) { s.TIME = [55, 64, 72][s.diff]; s.px = 70; s.turns = 0; s.NEED = [14, 18, 22][s.diff]; s.gag = 0; s.lungs = 100; s.strikes = 0; s.stun = 0; s.cd = 0; s.gasp = 0; s.stuck = 0; s.crank = 0; },
  update(s, dt, I) {
    s.t += dt; FX(s, dt);
    const S = s.turns / s.NEED, H = HERO(s);
    s.cloudX = 380 - (s.turns ? 90 + 190 * S : 0);
    if (s.stun > 0) { s.stun -= dt; }
    else mover1D(s, I, dt, 150 * H.spd, 40, 400);
    const atCap = s.px > 350, inCloud = s.turns > 0 && s.px > s.cloudX, fresh = s.px < 80;
    s.hold = s.stun <= 0 && (I.D || I.B) && s.lungs > 0;   /* ▼, or the HOLD BREATH button on the left */
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
    s.grace = Math.max(0, (s.grace || 0) - dt); if (!inCloud && s.grace > 0) s.grace = Math.min(s.grace, 0.3);   /* after a gag you get a moment to walk out before it builds again */
    if (inCloud && !s.hold && !(s.grace > 0)) {   // breathing the cloud
      s.gag += 34 * (0.55 + S) * s.k / H.grip * dt;
      if (s.wasHold && s.lungs <= 0.5) { s.gag += 30; s.gasp = 0.8; POP(s, s.px, 150, '*GASP*', '#e9665a'); }
    }
    s.lungs = Math.max(0, s.lungs);
    s.wasHold = s.hold;
    if (!inCloud) s.gag = Math.max(0, s.gag - 30 * dt);
    s.gasp = Math.max(0, s.gasp - dt);
    if (s.gag >= 100) { s.strikes++; s.gag = 0; s.stun = 1.1; s.grace = 4; SFX('squish'); }   /* one gag, then walk out of it */
    if (s.turns >= s.NEED) s.end = { win: true, stars: stars3(s.strikes === 0, s.strikes <= 1), line: s.strikes ? `Cap's off. You gagged ${s.strikes}x.` : 'Cap off without a single gag. Iron stomach.' };
    else if (s.strikes >= 3) s.end = { win: false, stars: 0, line: 'You gagged out. Rod finishes it.' };
    else if (s.t >= s.TIME) s.end = { win: false, stars: 0, line: 'Too slow. The cap is still on.' };
  },
  draw(s) {
    const room = BGI('bg_laundry'), FY = room ? 252 : 214, CX = room ? 390 : 386, CY = room ? 157 : 163;
    if (room) { T('FRESH AIR', 34, 58, '#7bd65b', 6, 'center'); }
    else { R(0, 0, W, H, '#3d3a35'); R(0, 214, W, 56, '#6f6a62');
    R(14, 110, 40, 104, '#2b2016'); R(18, 114, 32, 100, '#cfe8f5');                  // open door
    T('FRESH', 34, 92, '#7bd65b', 6, 'center'); T('AIR', 34, 101, '#7bd65b', 6, 'center');
    R(388, 150, 70, 26, '#d6d6d6'); R(380, 156, 14, 14, '#bbb'); }
    if (!room) { g.save(); g.translate(CX, CY); g.rotate(s.turns * Math.PI / 2 / 4); R(-4, -4, 8, 8, '#e8e4d8'); R(-1, -4, 2, 8, '#b9b4a8'); g.restore(); }   /* the drawn room already has the cap */
    if (s.turns) { const S = s.turns / s.NEED; g.fillStyle = 'rgba(120,160,60,' + (0.42 + 0.33 * S) + ')'; g.fillRect(s.cloudX, 40, W - s.cloudX, 192);   /* a thick, sickly cloud you can't see through */
      for (let i = 0; i < 14; i++) C(s.cloudX + ((i * 47 + s.t * 20) % (W - s.cloudX)), 60 + (i * 29) % 160, 14 + i % 3 * 6, 'rgba(150,190,80,.55)');
      g.fillStyle = 'rgba(150,190,80,.6)'; for (let y = 40; y < 232; y += 12) { g.beginPath(); g.arc(s.cloudX + Math.sin(y * 0.3 + s.t * 2) * 4, y, 9, 0, 7); g.fill(); } }   /* a soft, billowing front edge */
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
    const bathBg = BGI('bg_bath');
    if (!bathBg) { BATHFLOOR(150);
    { const gr = g.createLinearGradient(190, 0, 290, 0); gr.addColorStop(0, '#dfe1dd'); gr.addColorStop(0.3, '#ffffff'); gr.addColorStop(1, '#cfd3cf'); g.fillStyle = gr; g.fillRect(194, 92, 92, 76); R(190, 86, 100, 9, '#f4f5f2'); R(190, 94, 100, 2, '#b9beba'); R(272, 104, 10, 4, '#c9ced6'); R(280, 103, 3, 6, '#aab0b8'); }   // the tank, with its lid and handle
    BOWL(240, 200, 122, 48, s.t); }
    /* the line can only swing as far as the inside walls of the bowl */
    const WX = 240, WY = bathBg ? 197 : 200, half = bathBg ? 15 : 60, wob = clamp(s.sw * half + (s.tug > 0 ? Math.sin(s.t * 40) * 3 : 0) + (s.warn > 0 ? Math.sin(s.t * 30) * 1.2 : 0), -half, half);
    const hx = WX + wob, hy = WY - s.prog / 100 * 120, px = bathBg ? 372 : 404, handX = bathBg ? 342 : 382, handY = bathBg ? 170 : 200, shake = s.tug > 0 ? Math.sin(s.t * 50) * 2 : 0;
    // the hair: one long, wet, matted rope coming up out of the water to the hook, longer the more you've reeled
    if (s.prog > 1) { const n = 9, len = WY - hy;
      for (let k = 0; k < n; k++) { const off = (k - n / 2) * 0.9, col = k % 3 === 0 ? '#5a4030' : k % 3 === 1 ? '#3a2a1e' : '#2a1d14';
        g.strokeStyle = col; g.lineWidth = 1.2; g.beginPath(); g.moveTo(WX + wob * 0.15 + off * 1.6, WY + 1);
        for (let q = 1; q <= 10; q++) { const u = q / 10, yy = WY - len * u, xx = lerp(WX + wob * 0.15, hx, u) + off * (1.6 - u * 0.9) + Math.sin(u * 9 + k + s.t * 3) * 1.6 * (1 - u * 0.5); g.lineTo(xx, yy); } g.stroke(); }
      g.fillStyle = '#2a1d14'; g.beginPath(); g.ellipse(hx, hy + 4, 4 + s.prog / 30, 5 + s.prog / 25, 0, 0, 7); g.fill(); R(hx - 2, hy + 1, 2, 2, '#8a6a50');   /* the clump on the hook, with a wet shine */
      for (let k = 0; k < 6; k++) { g.strokeStyle = '#3a2a1e'; g.lineWidth = 1; g.beginPath(); g.moveTo(hx + (k - 3) * 1.5, hy + 8); g.quadraticCurveTo(hx + (k - 3) * 3, hy + 16, hx + (k - 3) * 4 + Math.sin(s.t * 4 + k) * 2, hy + 22 + (k % 2) * 4); g.stroke(); }   /* strands hanging off it */
      g.fillStyle = 'rgba(160,210,240,.7)'; g.beginPath(); g.ellipse(WX + wob * 0.15, WY + 1, 6, 1.5, 0, 0, 7); g.fill(); }   /* ripples where it leaves the water */
    g.strokeStyle = s.ten > 70 ? '#e9665a' : '#555'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(handX + shake, handY); g.quadraticCurveTo((handX + hx) / 2, Math.min(handY, hy) - 20, hx, hy); g.stroke();
    R(hx - 1, hy - 3, 3, 5, '#9aa0a8');   /* the hook */
    SPR(s.hero || 'matt', 8, px + shake, bathBg ? 268 : 262, false, bathBg ? 5.2 : 2.3);   /* side profile, facing the toilet */
    const by = hy;
    if (s.warn > 0) T('!', hx, by - 16, '#e9665a', 14, 'center');
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
    s.cx = 240; s.cy = 140; if (MG('claw_toilet') && MG('claw_water')) { s.cx = 31 + 280; s.cy = 26 + 125; s.RX = 82; s.RY = 58; s.T3D = 1; }   /* the 3D-rendered toilet: swirl sized to its bowl */
    s.rad = 1; s.boost = 0; s.DROP = 0.65; s.GRAB = 9 * Math.sqrt(HERO(s).steady); s.SINK = [0.028, 0.036, 0.045][s.diff];
    s.wads = []; for (let i = 0; i < [1, 2, 3][s.diff]; i++) s.wads.push({ ang: s.rnd() * 6, r: 0.45 + s.rnd() * 0.5, w: (0.6 + s.rnd() * 0.6) * (s.rnd() < 0.5 ? 1 : -1) });
  },
  pos(s, a, r) { r = r == null ? s.rad : r; return [s.cx + Math.cos(a) * (s.RX || 100) * r, s.cy + Math.sin(a) * (s.RY || 58) * r]; },
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
    if (s.T3D) {   /* the 3D model, rendered top-down into pixel art, with live water in its bowl */
      BATHFLOOR(0); g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(31 + 212, 26 + 128, 214, 118, 0, 0, 7); g.fill();
      g.drawImage(MG('claw_toilet'), 31, 26);
      const WC = this._wc || (this._wc = (() => { const c = document.createElement('canvas'), m = MG('claw_water'); c.width = m.width; c.height = m.height; const k = c.getContext('2d'); k.drawImage(m, 0, 0); k.globalCompositeOperation = 'source-in';
        const gr = k.createRadialGradient(280, 125, 4, 280, 125, 100); gr.addColorStop(0, '#2a6a8c'); gr.addColorStop(0.6, '#5aa0c4'); gr.addColorStop(1, '#9fd0e4'); k.fillStyle = gr; k.fillRect(0, 0, c.width, c.height); return c; })());
      g.drawImage(WC, 31, 26);
      g.save(); g.beginPath(); g.ellipse(s.cx, s.cy, s.RX + 8, s.RY + 8, 0, 0, 7); g.clip(); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) { const a = s.t * (1.1 + i * 0.3) + i * 2; g.beginPath(); g.ellipse(s.cx, s.cy, 20 + i * 20, 14 + i * 14, 0, a, a + 1.2); g.stroke(); }
      const gr2 = g.createRadialGradient(s.cx, s.cy, 1, s.cx, s.cy, 16); gr2.addColorStop(0, '#0d1c26'); gr2.addColorStop(1, 'rgba(20,50,66,0)'); g.fillStyle = gr2; g.beginPath(); g.ellipse(s.cx, s.cy, 18, 12, 0, 0, 7); g.fill(); g.restore(); }
    const bowlBg = s.T3D ? null : MG('bg_bowl');
    if (bowlBg) { g.drawImage(bowlBg, 240 - 234.5 * 1.07, 140 - 148 * 1.07, W * 1.07, H * 1.07);   /* water centred on the swirl */
      g.save(); g.beginPath(); g.ellipse(s.cx, s.cy + 2, 100, 64, 0, 0, 7); g.clip(); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) { const a = s.t * (1.1 + i * 0.3) + i * 2; g.beginPath(); g.ellipse(s.cx, s.cy, 30 + i * 24, 18 + i * 15, 0, a, a + 1.2); g.stroke(); } g.restore(); }
    else if (!s.T3D) BATHFLOOR(0), BOWL(s.cx, s.cy, 152, 106, s.t);
    if (!bowlBg && !s.T3D) { const gr = g.createRadialGradient(s.cx, s.cy, 1, s.cx, s.cy, 18); gr.addColorStop(0, '#0d1c26'); gr.addColorStop(1, 'rgba(20,50,66,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(s.cx, s.cy, 20, 13, 0, 0, 7); g.fill(); }   // the drain, waiting
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
  dpad: false,
  ctl: 'TAP A PIECE TO SPIN IT (KEYBOARD: ARROWS + SPACE)',
  act: null, phone: 'tap a pipe piece to spin it.',
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
    s.wait = ([16, 13, 11][s.diff] + 35) * HERO(s).steady;   /* +35s to plan the route before the water comes */
    s.flow = null; s.SPEED = [1.6, 1.4, 1.2][s.diff] * HERO(s).steady;   /* seconds per pipe: slow enough to keep fixing ahead of the water */
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
    if (!f.run) { const sd = this.sides(p); f.run = { a: f.from, b: p.t === 'X' ? (f.from + 2) % 4 : sd.find(x => x !== f.from), w: 0 }; (p.flows = p.flows || []).push(f.run); }   /* which way the water runs through this piece */
    f.k += dt / (s.done ? 0.12 : s.SPEED); p.wet = Math.min(1, f.k); f.run.w = p.wet;
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
    { const DRY = MG('pd_dry'), WET = MG('pd_wet'), sy = s.oy + s.src * s.Z;
      if (DRY && WET) {   /* PVC stubs in and out: the supply comes in on the left (always full), the drop to the bucket on the right */
        g.drawImage(DRY, 28, 0, 29, 57, s.ox - s.Z / 2, sy, s.Z / 2, s.Z); g.drawImage(WET, 7 * 57 + 28, 0, 29, 57, s.ox - s.Z / 2, sy, s.Z / 2, s.Z);
        R(s.ox - s.Z / 2 - 9, sy + 11, 10, 16, '#b08a3a'); R(s.ox - s.Z / 2 - 9, sy + 11, 10, 2, '#d8b45a'); R(s.ox - s.Z / 2 - 7, sy + 5, 6, 7, '#c0392b'); R(s.ox - s.Z / 2 - 9, sy + 4, 10, 3, '#e04a3a');   /* the brass spigot with its red handle */
        const dy2 = s.oy + s.dst * s.Z; g.drawImage(DRY, 0, 0, 29, 57, s.ox + s.C * s.Z, dy2, s.Z / 2, s.Z); if (s.end && s.end.win) g.drawImage(WET, 7 * 57, 0, 29, 57, s.ox + s.C * s.Z, dy2, s.Z / 2, s.Z);
      } else { R(s.ox - 26, sy + 12, 22, 14, '#9a9a96'); R(s.ox - 8, sy + 15, 8, 8, '#5fa8e0'); } }
    const ty = s.oy + s.dst * s.Z, bx = s.ox + s.C * s.Z + 4 + (MG('pd_dry') ? s.Z / 2 - 4 : 0); if (!SPI('bucket', bx + 12, ty + 36, 0.9)) { R(bx, ty + 8, 24, 26, '#e8822a'); R(bx - 2, ty + 6, 28, 4, '#c96a1a'); R(bx + 2, ty + 14, 20, 6, '#f4f4f2'); g.strokeStyle = '#999'; g.lineWidth = 1; g.beginPath(); g.arc(bx + 12, ty + 6, 12, Math.PI, 0); g.stroke(); }
    for (let r = 0; r < s.Rw; r++) for (let c = 0; c < s.C; c++) {
      const p = s.grid[r][c], x = s.ox + c * s.Z, y = s.oy + r * s.Z;
      { const DRY = MG('pd_dry'), WET = MG('pd_wet');   /* the 3D-rendered PVC tiles: dry piece, then the water inside it, filling from the side it came in */
        if (DRY && WET) { const sd = this.sides(p), key = p.t === 'X' ? 'X' : ['T', 'R', 'B', 'L'].filter((_, i) => sd.includes(i)).join(''), di = { RL: 0, TB: 1, TR: 2, RB: 3, BL: 4, TL: 5, X: 6 }[key];
          g.drawImage(DRY, di * 57, 0, 57, 57, x, y, s.Z, s.Z);
          for (const fl of p.flows || []) if (fl.w > 0) { const row = ['31', '13', '02', '20', '01', '10', '12', '21', '23', '32', '30', '03'].indexOf('' + fl.a + fl.b), lv = Math.min(7, Math.ceil(fl.w * 8) - 1); if (row >= 0) g.drawImage(WET, lv * 57, row * 57, 57, 57, x, y, s.Z, s.Z); }
          continue; } }
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
  init(s) { s.TIME = 38; s.p = 0; s.prog = 0; s.red = 0; s.packs = 0; s.beads = s.rnd() < 0.5; s.LO = 30; s.HI = 75 + 8 * (HERO(s).grip - 1) * 4; s.aim = 0.5; s.spot = 0.5; s.sv = 0.25; },
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
  draw(s) {   /* behind the jetter nozzle, looking at the clog face */
    const oy = 0.22, f = 4.2 + s.prog / 100 * 1.6, hole = Math.min(0.92, s.prog / 100 * 0.95), kind = s.beads ? 'beads' : 'litter';
    R(0, 0, W, H, '#050605');
    TUNNEL.draw({ D: 0, t: s.t, pvc: false, ox: 0, oy, plugs: [{ f, hole, kind, seed: 9 }], water: 0.26, flow: -1, light: s.flash > 0 ? 0.8 : 1 }, 0, 0);
    const Y = v => -0.62 + v * 1.24, [sx, sy, sr] = TUNNEL.proj(f, 0, Y(s.spot), 0, oy), [ax, ay] = TUNNEL.proj(f, 0, Y(s.aim), 0, oy);
    // the soft spot: a wet, darker patch that glistens
    const pul = 0.7 + 0.3 * Math.sin(s.t * 6); g.fillStyle = `rgba(247,196,24,${0.35 * pul})`; g.beginPath(); g.ellipse(sx, sy, sr * 0.28, sr * 0.16, 0, 0, 7); g.fill();
    g.strokeStyle = `rgba(255,236,150,${0.8 * pul})`; g.lineWidth = 2; g.beginPath(); g.ellipse(sx, sy, sr * 0.28, sr * 0.16, 0, 0, 7); g.stroke();
    TUNNEL.vignette(0.5);
    // the nozzle and its jets
    const nx = 240, ny = 226, red = s.p > s.HI, on = s.p > 5;
    g.strokeStyle = '#1e1e22'; g.lineWidth = 14; g.beginPath(); g.moveTo(240, H + 10); g.lineTo(nx, ny + 8); g.stroke();
    R(nx - 9, ny - 6, 18, 14, '#b8862e'); R(nx - 9, ny - 6, 18, 3, '#e0b45a'); R(nx - 5, ny - 11, 10, 6, '#9a6e22');   /* brass nozzle */
    if (on) { const n = 3 + Math.floor(s.p / 20), col = red ? '232,110,96' : '170,215,255';
      for (let i2 = 0; i2 < n; i2++) { const jx = ax + (Math.random() - 0.5) * sr * 0.25, jy = ay + (Math.random() - 0.5) * sr * 0.15;
        g.strokeStyle = `rgba(${col},${0.35 + Math.random() * 0.4})`; g.lineWidth = 1 + Math.random() * 2.5; g.beginPath(); g.moveTo(nx + (Math.random() - 0.5) * 6, ny - 10); g.lineTo(jx, jy); g.stroke(); }
      for (let i2 = 0; i2 < 10; i2++) { const a = Math.random() * 6.28, rr = Math.random() * sr * 0.3 * (s.p / 100); R(ax + Math.cos(a) * rr, ay + Math.sin(a) * rr * 0.6, 2, 2, red ? '#ffb0a0' : '#e8f6ff'); } }   /* spray off the face */
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(ax - 8, ay); g.lineTo(ax + 8, ay); g.moveTo(ax, ay - 6); g.lineTo(ax, ay + 6); g.stroke();   /* where you're aiming */
    if (s.flash > 0) T('PACKED!', 240, 70, '#e9665a', 12, 'center');
    HUD(s, 'JETTER PULSE', s.TIME - s.t);
    const gx = 40, gw = 400; R(gx, 200 + 30, gw, 10, '#2c3326'); R(gx + s.LO / 100 * gw, 230, (s.HI - s.LO) / 100 * gw, 10, '#3f8f2e'); R(gx + s.HI / 100 * gw, 230, (100 - s.HI) / 100 * gw, 10, '#7a2a24');
    R(gx + s.p / 100 * gw - 3, 226, 6, 18, '#fff'); T('PRESSURE', gx, 222, '#fff', 6);
    BAR(gx, 252, gw, 6, s.prog / 100, '#f7c418', 'CLOG CLEARED');
  },
});
// =====================================================================
// 13. STAIRS OF DEATH — a Donkey Kong homage, upside down. Haul the jetter DOWN the zig-zag stairs while junk rolls after you.
GAMES.push({
  id: 'stairs', name: 'STAIRS OF DEATH', tag: 'The jetter vs. the basement stairs',
  how: ['Carry the jetter down four flights of cluttered basement stairs.', 'Walk with ◀ ▶. Paint cans and laundry baskets come rolling down after you.', 'Press SPACE to hop over a can, or over a CRACKED board (the dark ones).', 'Every hit or bad board costs a pair of pants. Reach the basement floor.'],
  ctl: '◀ ▶ = WALK  ·  SPACE = HOP',
  act: 'HOP', phone: 'hold left or right of you to walk, tap HOP to jump.', dpad: 'omni',
  init(s) {
    // four flights, zig-zagging down. each: x from a→b, y from ya→yb
    const bg = !!MG('bg_stairs'), y0 = bg ? 110 : 72, dy = bg ? 42 : 48;   // with the basement art: the first flight leaves from the landing by the door
    s.fl = []; for (let i = 0; i < 4; i++) { const r = i % 2 === 0; s.fl.push({ a: r ? 110 : 380, b: r ? 380 : 110, ya: y0 + i * dy, yb: y0 + i * dy + 18 }); }
    s.f = 0; s.x = 110; s.jump = 0; s.jy = 0; s.pantsMax = s.pants = [5, 4, 3][s.diff]; s.inv = 0; s.hits = 0; s.cans = []; s.next = 1.5; s.score = 0; s.facing = 1;
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
    s.x = clamp(s.x + mv * 55 * HERO(s).spd * dt, Math.min(F.a, F.b), Math.max(F.a, F.b));
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
    s.next -= dt; if (s.next <= 0) { s.cans.push({ f: 0, x: 110, k: s.rnd() < 0.7 ? 'can' : 'basket', v: (150 + s.rnd() * 40) * [0.9, 1, 1.1][s.diff], spin: 0, scored: false }); s.next = [3.2, 2.5, 1.9][s.diff] * (0.7 + s.rnd() * 0.6); }
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
    if (s.inv <= 0 || Math.floor(s.t * 10) % 2) { SPR(s.hero || 'matt', WALK(s.hero || 'matt', s.t, s.facing > 0 ? 6 : 8), s.x, py, s.facing < 0 && !!IMG[(s.hero || 'matt') + '_more'], 0.7); if (!SPI('jetter', s.x - 8 * s.facing, py - 5, 0.21, s.facing < 0)) { R(s.x - 12 * s.facing - 7, py - 22, 14, 12, '#e8822a'); R(s.x - 12 * s.facing - 5, py - 26, 10, 4, '#333'); } }   // carrying the jetter
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
    const P = s.pen; R(P.x - 6, P.y - 34, 70, P.h + 68, '#f2c21a'); R(P.x - 6, P.y - 34, 70, 16, '#2c4f9c'); R(P.x - 6, P.y + P.h + 20, 70, 14, '#2c4f9c'); R(P.x - 2, P.y - 16, 62, 10, '#9fd1ff'); R(P.x, P.y, P.w, P.h, '#3b3d44'); R(P.x, P.y, P.w, 3, '#22242a');   // the van from above: yellow body, blue ends, open side door
    for (let i = 0; i < 2; i++) { R(P.x - 10, P.y - 24 + i * (P.h + 36), 5, 14, '#111'); }
    T('VAN', P.x + 28, P.y - 26, '#fff', 6, 'center');
    R(200, 200, 26, 26, '#555'); C(213, 213, 9, '#222');                         // the inspection hole
    s.dogs.forEach((d, i) => { if (SPI((i % 2 ? 'lab_' : 'dog_') + (Math.floor(s.t * 8 + i) % 2), d.x, d.y + 6, 0.6, d.vx < 0)) return; R(d.x - 6, d.y - 4, 12, 8, d.col); R(d.x + (d.vx >= 0 ? 4 : -8), d.y - 6, 4, 4, d.col); R(d.x + (d.vx >= 0 ? -8 : 6), d.y - 3, 3, 2, d.col); });
    HERO_AT(s, s.px, s.py + 12, 1.35, { face: 'U' });
    HUD(s, 'DOG ROUNDUP', s.TIME - s.t); T('IN VAN ' + (s.n || 0) + '/5', 6, 28, '#fff', 8);
  },
});

// =====================================================================
// 15. UNDER THE TRAILER — an old-school first-person crawl. Feel your way through the piers and the muck,
// follow your nose to the broken joint, and fight off the rats the old-fashioned way: turn-based.
const TRL = { RW: 480, RH: 270, T: 32, T2: 128 };   /* the view is drawn at 480x270, the walls/floor/ceiling with 128px textures so they stay sharp */
TRL.rgb = (r, gg, b) => (255 << 24) | (Math.max(0, Math.min(255, b)) << 16) | (Math.max(0, Math.min(255, gg)) << 8) | Math.max(0, Math.min(255, r));
TRL.tex = (() => {   // little 32x32 textures, painted once
  const N = TRL.T, mk = f => { const a = new Uint32Array(N * N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) a[y * N + x] = f(x, y); return a; };
  let seed = 7; const rn = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const n2 = Array.from({ length: N * N }, rn);
  const block = mk((x, y) => { const row = y >> 4, jx = (x + (row ? 16 : 0)) % 32, mortar = (y & 15) < 2 || jx < 2, v = n2[y * N + x] * 22;   // cinder block piers
    if (mortar) return TRL.rgb(70 + v / 2, 68 + v / 2, 64 + v / 2); const stain = y > 22 ? (y - 22) * 3 : 0; return TRL.rgb(118 + v - stain, 116 + v - stain * 1.2, 110 + v - stain * 1.6); });
  const skirt = mk((x, y) => { const v = n2[y * N + x] * 14, seam = x % 8 === 0, crack = (x === 13 || x === 14) && y > 4 && y < 9;   // vinyl skirting, a crack of daylight
    if (crack) return TRL.rgb(250, 240, 200); if (seam) return TRL.rgb(120 + v, 112 + v, 96 + v); const dirt = y > 20 ? (y - 20) * 5 : 0; return TRL.rgb(176 + v - dirt, 166 + v - dirt, 140 + v - dirt * 1.3); });
  const dirt = mk((x, y) => { const v = n2[y * N + x], d = Math.hypot(x - 20, y - 11);   // muck, with a wet spot
    if (v > 0.93) return TRL.rgb(130, 120, 100); if (d < 6) return TRL.rgb(48 + v * 10, 40 + v * 10, 28 + v * 8); return TRL.rgb(92 + v * 26, 72 + v * 20, 48 + v * 14); });
  const ceil = mk((x, y) => { const v = n2[y * N + x] * 20, j = x % 16 < 5;   // floor joists with pink insulation sagging between
    if (j) return TRL.rgb(120 + v, 86 + v * 0.8, 54 + v * 0.5); if (v > 18) return TRL.rgb(200, 150, 160); return TRL.rgb(214 + v, 132 + v, 150 + v); });
  // the broken joint: PVC coming down out of the floor, snapped off short of the run, dripping
  const pipe = f => mk((x, y) => { const pv = x >= 13 && x <= 18, top = y < 13, run = y >= 23 && y <= 27 && x >= 19, end = run && x <= 20;
    if (pv && top) return x === 14 ? TRL.rgb(255, 255, 250) : x === 18 ? TRL.rgb(170, 166, 156) : TRL.rgb(226, 222, 210);   /* white PVC coming down from the floor */
    if (pv && y === 13) return TRL.rgb(120, 110, 96);   /* snapped-off end */
    if (end) return TRL.rgb(40, 30, 20);   /* the open end of the run, lying in the muck */
    if (run) return y === 23 ? TRL.rgb(250, 250, 244) : y === 27 ? TRL.rgb(150, 146, 136) : TRL.rgb(222, 218, 206);
    const dy = 16 + ((f * 9 + 0) % 14); if (x >= 15 && x <= 16 && y >= dy && y <= dy + 2) return TRL.rgb(120, 86, 40);   // the drip
    if (y >= 28 && Math.abs(x - 16) < 7 - (31 - y)) return TRL.rgb(96, 70, 34);   // puddle
    return 0; });
  const hobo = f => mk((x, y) => {
    const fl = f ? 1 : 0;
    if (x >= 25 && x <= 26 && y >= 25 && y <= 30) return TRL.rgb(236, 230, 210);   /* candle stub */
    if (x >= 25 && x <= 26 && y >= 21 - fl && y <= 24) return y < 23 - fl ? TRL.rgb(255, 240, 150) : TRL.rgb(255, 160, 40);   /* flame */
    if (y >= 4 && y <= 8 && x >= 11 && x <= 20 && !(y === 4 && (x < 13 || x > 18))) return y === 8 ? TRL.rgb(150, 30, 30) : TRL.rgb(190, 44, 40);   /* red beanie */
    if (y >= 9 && y <= 15 && x >= 12 && x <= 19) { if (y >= 12) return TRL.rgb(170 + (x % 2) * 20, 166 + (x % 2) * 20, 156); if (y === 10 && (x === 14 || x === 17)) return TRL.rgb(30, 24, 20); if (y === 11 && x >= 13 && x <= 18) return TRL.rgb(200, 120, 100); return TRL.rgb(214, 160, 120); }   /* face, big grey beard */
    if (y >= 16 && y <= 17 && x >= 14 && x <= 17) return TRL.rgb(170, 166, 156);
    if (y >= 16 && y <= 30 && x >= 6 && x <= 23 && Math.abs(x - 14.5) <= 5 + (y - 16) * 0.6) { const plaid = ((x >> 1) + (y >> 1)) % 2; return plaid ? TRL.rgb(70, 96, 60) : TRL.rgb(54, 76, 46); }   /* wrapped in a green blanket */
    if (y === 31 && x >= 4 && x <= 27) return TRL.rgb(40, 32, 22);
    if (x >= 1 && x <= 4 && y >= 22 && y <= 30) return x === 1 || y === 22 ? TRL.rgb(140, 110, 70) : TRL.rgb(110, 84, 50);   /* his crate */
    return 0; });
  const trap = mk((x, y) => {   /* a wooden snap trap on the dirt, a little cracker on the trigger */
    if (y >= 27 && y <= 30 && x >= 7 && x <= 24) return y === 27 ? TRL.rgb(214, 170, 110) : TRL.rgb(176, 132, 80);
    if (y === 26 && x >= 9 && x <= 22 && (x === 9 || x === 22 || y === 26)) return TRL.rgb(170, 170, 176);   /* the bail */
    if (y >= 22 && y <= 25 && x >= 13 && x <= 18) { if ((x + y) % 3 === 0) return TRL.rgb(120, 70, 30); return y === 22 ? TRL.rgb(236, 170, 80) : TRL.rgb(214, 140, 60); }   /* cracker */
    if (y >= 24 && y <= 26 && x >= 16 && x <= 20 && y === 26) return TRL.rgb(150, 150, 156);
    return 0; });
  const M = TRL.T2, up = (src, smooth, grain) => { const o = new Uint32Array(M * M), f = N / M; let sd = 99;
    const rnd2 = () => ((sd = (sd * 16807) % 2147483647) / 2147483647), ch = (c, k) => (c >> (k * 8)) & 255;
    for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) { const u = (x + 0.5) * f - 0.5, v = (y + 0.5) * f - 0.5;
      let c; const n0 = src[(((y * f) | 0) % N) * N + (((x * f) | 0) % N)];
      if (!smooth || (n0 & 0xffffff) === 0xc8f0fa) c = n0;   /* the daylight crack stays exact */
      else { const x0 = Math.floor(u), y0 = Math.floor(v), ax = u - x0, ay = v - y0, P = (xx, yy) => src[((yy + N) % N) * N + ((xx + N) % N)];
        const a = P(x0, y0), b = P(x0 + 1, y0), cc = P(x0, y0 + 1), d = P(x0 + 1, y0 + 1), mix = k => Math.round((ch(a, k) * (1 - ax) + ch(b, k) * ax) * (1 - ay) + (ch(cc, k) * (1 - ax) + ch(d, k) * ax) * ay);
        c = (255 << 24) | (mix(2) << 16) | (mix(1) << 8) | mix(0); }
      const gr = (rnd2() - 0.5) * grain; o[y * M + x] = (c & 0xffffff) === 0xc8f0fa ? c : TRL.rgb(ch(c, 0) + gr, ch(c, 1) + gr, ch(c, 2) + gr); }
    return o; };
  return { block, skirt, dirt, ceil, pipe: [pipe(0), pipe(1)], hobo: [hobo(0), hobo(1)], trap, hi: { block: up(block, false, 14), skirt: up(skirt, false, 10), dirt: up(dirt, true, 18), ceil: up(ceil, true, 12) } };
})();
TRL.faces = {};
TRL.faceN = n => { const F = TRL.faces; if (F[n] === undefined) { F[n] = null; const im = new Image(); im.onload = () => F[n] = im; im.onerror = () => { F[n] = false; }; im.src = '../assets/' + n + '.png'; } return F[n] || null; };
TRL.face = (who, hp) => { const F = TRL.faces, ld = n => { if (F[n] === undefined) { F[n] = null; const im = new Image(); im.onload = () => F[n] = im; im.onerror = () => { F[n] = false; }; im.src = '../assets/' + n + '.png'; } };
  const n = who + (hp > 0.5 ? '_normal' : hp > 0.25 ? '_tired' : '_panic'); ld(who + '_normal');   /* the hero's real face, looking worse as he gets bitten */
  if (F[n] === undefined) { F[n] = null; const im = new Image(); im.onload = () => F[n] = im; im.onerror = () => { F[n] = false; }; im.src = '../assets/' + n + '.png'; }
  return F[n] || F[who + '_normal'] || null; };
TRL.FOES = [   /* spr: 8-frame strip (0 idle 1 sniff 2 stalk 3 run 4 rear up 5 attack 6 hurt 7 down) · z: how deep before it shows up */
  { name: 'SEWER RAT', spr: 'ut_rat', snd: 'rat_screech', hp: [7, 10], atk: [2, 4], w: 6, sc: 0.7, pts: 20, z: 0 },
  { name: 'POSSUM', spr: 'ut_possum', snd: 'possum_hiss', hp: [12, 15], atk: [3, 5], w: 3, sc: 1.05, pts: 35, possum: true, z: 0.2 },
  { name: 'BIG BUFF RAT', spr: 'ut_buffrat', snd: 'rat_screech', hp: [16, 20], atk: [4, 6], w: 3, sc: 1.05, pts: 45, z: 0.3 },
  { name: 'RACCOON', spr: 'ut_raccoon', snd: 'raccoon', off: 2.5, hp: [20, 24], atk: [5, 7], w: 3, sc: 1.05, pts: 60, thief: true, z: 0.5 },
  { name: 'BROWN RECLUSE', spr: 'ut_spider', snd: 'spider', hp: [12, 15], atk: [4, 6], w: 2, sc: 0.8, pts: 55, venom: true, z: 0.65 },
  { name: 'THE POSSUM PRINCESS', spr: 'ut_princess', snd: 'possum_hiss', hp: [18, 22], atk: [3, 5], w: 0.5, sc: 1.05, pts: 80, possum: true, princess: true, z: 0.25, once: true },
  { name: 'GARY', spr: 'ut_raccoon', snd: 'raccoon', off: 2.5, hp: [24, 28], atk: [5, 8], w: 0.5, sc: 1.1, pts: 90, thief: true, gary: true, z: 0.55, once: true },
  { name: 'THE RAT KING', spr: 'ut_ratking', snd: 'rat_screech', hp: [80, 80], atk: [7, 11], w: 0, sc: 1.35, king: true, pts: 400, z: 9 },
];
TRL.cry = (F, long) => SFX(F.snd, { offset: F.off || 0, dur: long ? 1.6 : 1.0 });   /* each critter's own noise */
TRL.UTS = (n, f, cx, by, h, flip, a) => { const im = MG(n); if (!im) return false; const cw = im.width / 8, w = h * cw / im.height;   /* one frame of a creature strip */
  g.save(); if (a != null) g.globalAlpha = a; g.imageSmoothingEnabled = false; g.translate(cx, by); if (flip) g.scale(-1, 1); g.drawImage(im, f * cw, 0, cw, im.height, -w / 2, -h, w, h); g.restore(); return true; };
TRL.hands = (s, VX, VY, VW, VH, t) => {
  const G2 = s.gear, wpn = G2.includes('cutter') ? 'cutter' : G2.includes('wrench') ? 'monkey' : G2.includes('pipewrench') ? 'pipe' : 'fist', lid = G2.includes('lid');
  const bob = s.mv > 0 ? Math.sin(t * 16) * 4 : Math.sin(t * 2) * 1, sw = s.swing > 0 ? Math.sin((1 - s.swing / 0.35) * Math.PI) : 0, by = VY + VH, D = 3.6;
  const L = MG(lid ? (s.guard > 0 ? 'ut_h_lidup' : 'ut_h_lid') : s.lights > 0 ? 'ut_h_lighton' : 'ut_h_lightoff'), Rt = MG('ut_h_' + wpn);
  if (L && Rt) {   /* the painted hands: big, drawn smooth (not chunky) so you can tell what you're holding */
    const D2 = 3, arm = (im, x, y, w, h) => {   /* the arm keeps going down past the bottom of the picture, so it never looks cut off */
      const sy = im.height - 3; g.drawImage(im, 0, sy, im.width, 3, x, y + h - 2, w, 400); g.drawImage(im, x, y, w, h); };
    s.hu = (s.hu || 0) + ((s.battle || s.guard > 0 || s.swing > 0 ? 1 : 0) - (s.hu || 0)) * 0.12;   /* walking: hands hang low, just peeking up and bobbing; a fight brings them up */
    const low = (1 - s.hu) * VH * 0.58;
    g.save(); g.translate(0, low); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    { const w = L.width / D2, h = L.height / D2, gu = s.guard > 0 ? Math.sin(Math.min(1, (0.6 - s.guard) / 0.12) * Math.PI / 2) * 16 : 0; arm(L, VX - w * 0.22, by - h * (L === MG('ut_h_lidup') ? 0.66 : 0.6) + bob * 1.5 - gu, w, h); }
    { const w = Rt.width / D2, h = Rt.height / D2, x = VX + VW - w * 0.8, y = by - h * (wpn === 'fist' ? 0.6 : 0.7) + bob * 1.5 - sw * 14;
      g.translate(x + w * 0.55, y + h * 0.9); g.rotate(-0.5 * sw); arm(Rt, -w * 0.55, -h * 0.9, w, h); }
    g.restore(); return; }
  const glove = (x, y, w, h) => { R(x, y, w, h, '#8a5a2e'); R(x, y, w, 2, '#b07a44'); R(x + 2, y + 3, w - 4, 1, '#6a4422'); for (let i = 1; i < 4; i++) R(x + (w / 4) * i, y, 1, 4, '#5a3a1c'); };   /* leather work gloves */
  // left: the flashlight, or the trash can lid strapped on
  { const x = VX + 40, y = by - 46 + bob;
    if (lid) { C(x + 14, y + 8, 34, '#7c8288'); C(x + 14, y + 8, 30, '#9aa1a8'); for (let i = 0; i < 4; i++) { g.strokeStyle = '#7c8288'; g.lineWidth = 1; g.beginPath(); g.arc(x + 14, y + 8, 8 + i * 6, 0, 7); g.stroke(); } R(x + 6, y + 4, 16, 6, '#5a5f66'); C(x + 2, y - 6, 6, 'rgba(255,255,255,.35)'); }
    else { R(x + 10, y - 2, 14, 30, '#2a2a2a'); R(x + 8, y - 8, 18, 8, '#3a3a3a'); R(x + 10, y - 7, 14, 4, '#fff6c0'); glove(x + 4, y + 8, 26, 16); } }
  // right: fists, pipe wrench, monkey wrench, or pipe cutter, swinging up when you hit
  { const x = VX + VW - 90, y = by - 40 + bob - sw * 40; g.save(); g.translate(x + 30, y + 30); g.rotate(-0.5 * sw - 0.15); g.translate(-30, -30);
    if (wpn === 'fist') { glove(14, 10, 34, 26); R(14, 6, 34, 6, '#8a5a2e'); for (let i = 0; i < 4; i++) R(16 + i * 8, 6, 6, 4, '#a06a38'); }
    else if (wpn === 'pipe') { R(24, -36, 9, 56, '#c0392b'); R(24, -36, 2, 56, '#e05a4a'); R(16, -50, 24, 10, '#9aa1a8'); R(16, -42, 8, 10, '#9aa1a8'); R(22, -48, 2, 6, '#5a5f66'); glove(12, 14, 34, 22); }
    else if (wpn === 'monkey') { R(24, -42, 10, 62, '#9aa1a8'); R(24, -42, 3, 62, '#d0d6dc'); R(14, -58, 30, 12, '#b8bec4'); R(14, -48, 10, 12, '#b8bec4'); R(26, -36, 6, 4, '#5a5f66'); glove(12, 14, 36, 22); }
    else { R(22, -30, 12, 50, '#e07a1c'); R(22, -30, 3, 50, '#f2a04a'); C(28, -38, 11, '#c9ced6'); C(28, -38, 5, '#5a5f66'); R(16, -50, 24, 6, '#e07a1c'); glove(12, 14, 34, 22); }
    g.restore(); }
};
TRL.icon = (s, id, cx, cy, sz) => {   /* the pictures on the fight / bag buttons */
  const G2 = s.gear, wpn = G2.includes('cutter') ? 'cutter' : G2.includes('wrench') ? 'monkey' : G2.includes('pipewrench') ? 'pipe' : 'fist';
  const n = id === 'whack' ? 'ut_h_' + wpn : id === 'light' ? (s.lights > 0 ? 'ut_h_lighton' : 'ut_h_lightoff') : id === 'pb' ? 'ut_crackers' : (id === 'item' || id === 'run') ? 'ut_icon_' + (id === 'item' ? 'bag' : 'run') : null, im = n && MG(n);
  g.save(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  if (im) { const k = sz / Math.max(im.width, im.height), w = im.width * k, h = im.height * k; g.drawImage(im, cx - w / 2, cy - h / 2, w, h); }
  else if (id === 'item') {   /* a beat-up canvas backpack (until there's art for it) */
    const u = sz / 32; g.translate(cx, cy); g.scale(u, u);
    g.fillStyle = '#4a3218'; g.fillRect(-11, -12, 3, 8); g.fillRect(8, -12, 3, 8);   // straps
    g.fillStyle = '#7a5428'; g.beginPath(); g.roundRect(-12, -9, 24, 23, 5); g.fill();
    g.fillStyle = '#5e3e1c'; g.beginPath(); g.roundRect(-12, -9, 24, 10, [5, 5, 2, 2]); g.fill();   // flap
    g.fillStyle = '#8a6430'; g.beginPath(); g.roundRect(-7, 3, 14, 8, 2); g.fill();   // pocket
    g.fillStyle = '#c9a24a'; g.fillRect(-1.5, -1, 3, 4);   // buckle
    g.strokeStyle = '#3a2610'; g.lineWidth = 1; g.beginPath(); g.moveTo(-6, -14); g.quadraticCurveTo(0, -19, 6, -14); g.stroke(); }
  else if (id === 'run') {   /* the way out: a lit crack, an arrow pointing at it */
    const u = sz / 32; g.translate(cx, cy); g.scale(u, u);
    g.fillStyle = '#2a2018'; g.fillRect(2, -13, 12, 26); g.fillStyle = '#f7e2a0'; g.fillRect(4, -11, 8, 22);
    g.fillStyle = '#e8dcc0'; g.beginPath(); g.moveTo(-14, -3); g.lineTo(-4, -3); g.lineTo(-4, -8); g.lineTo(4, 0); g.lineTo(-4, 8); g.lineTo(-4, 3); g.lineTo(-14, 3); g.fill(); }
  g.restore(); };
TRL.imgTex = (n, w) => {   /* turn a sprite into a 32x32 billboard texture, sitting on the floor */
  const im = MG(n); if (!im) return null; const N = TRL.T, c = document.createElement('canvas'); c.width = c.height = N; const k = c.getContext('2d'); k.imageSmoothingEnabled = false;
  const h = Math.round(w * im.height / im.width); k.drawImage(im, Math.round((N - w) / 2), N - h, w, h);
  const d = new Uint32Array(k.getImageData(0, 0, N, N).data.buffer).slice(); for (let i = 0; i < d.length; i++) if ((d[i] >>> 24) < 128) d[i] = 0; else d[i] = d[i] | 0xff000000; return d; };
TRL.music = { h: null, tick: 0, amb: null, atick: 0 };
TRL.bgm = (on, king) => { const M = TRL.music;   /* the Rat King fights to his own song: UNDER THE TRAILER */
  if (on && king && !M.h) { const a = new Audio('../assets/music/under_the_trailer.mp3'); a.loop = true; a.volume = 0.55; let mute = false; try { mute = localStorage.getItem('ddt_sfx_mute') === '1' || localStorage.getItem('ddt_mute') === '1'; } catch (e) {} a.muted = mute; a.play().catch(() => {}); M.h = { stop() { a.pause(); a.src = ''; } }; }
  else if (on && !M.h && typeof DDTSfx !== 'undefined') M.h = DDTSfx.loop('ut_battle');
  if (!on && M.h) { M.h.stop(); M.h = null; } };
TRL.amb = on => { const M = TRL.music; if (on && !M.amb && typeof DDTSfx !== 'undefined') M.amb = [DDTSfx.loop('ut_amb_a'), DDTSfx.loop('ut_amb_b')]; if (!on && M.amb) { M.amb.forEach(h => h.stop()); M.amb = null; } };   /* the two crawlspace tracks, layered */
TRL.CARL = [['carl_laugh', [0, 6.57, 13.86], 3.6], ['carl_sigh', [0, 3.21, 6.89, 10.26, 13.09, 16.33], 1.9], ['carl_cough', [0], 3.3], ['carl_scream', [0], 1.9]];   /* Carl's noises: one random slice at a time */
TRL.carl = (s, chance) => { const n = performance.now(); if (n - (TRL.carlT || 0) < 6000 || Math.random() > (chance == null ? 1 : chance)) return; TRL.carlT = n;
  const C2 = TRL.CARL[Math.random() < 0.12 ? 3 : Math.floor(Math.random() * 3)], off = C2[1][Math.floor(Math.random() * C2[1].length)]; SFX(C2[0], { offset: off, dur: C2[2] }); };
TRL.hold = txt => 3.5 + String(txt || '').length * 0.07;   /* how long a line stays up before it moves on by itself: long lines get time to be read (tap skips) */
TRL.wedM = on => { const M = TRL.music; if (on && !M.wed && typeof DDTSfx !== 'undefined') M.wed = DDTSfx.loop('ut_wedding'); if (!on && M.wed) { M.wed.stop(); M.wed = null; } };
setInterval(() => { const M = TRL.music, n = performance.now(); if (M.h && n - M.tick > 400) TRL.bgm(false); if (M.amb && n - M.atick > 400) TRL.amb(false); if (M.wed && n - (M.wtick || 0) > 400) TRL.wedM(false); }, 300);   /* game paused, quit or over: the battle music stops */

GAMES.push({
  id: 'crawl', noReady: true, name: 'UNDER THE TRAILER', tag: 'A long crawl · rats, possums, a King · Crawlspace Carl',
  how: ['Somewhere under this huge trailer the sewer pipe came apart. Crawl through the dark and find it. Follow the STINK. This is a LONG job.', 'Near the hatch it is just rats. Deeper in: possums, buff rats, raccoons, brown recluses... and THE RAT KING guards the drip.', 'Grab peanut butter crackers off the rat traps and from critters you beat. Crawlspace Carl LOVES them. He lives down here in three places: listen for him, then trade for gear, beans and his special tonic.', 'In a fight: WHACK hits it. FLASHLIGHT blinds it so it loses its next 2 attacks (uses a battery). CRACKER: toss one and sneak away. RUN: might work. BAG: use an item.', 'Win fights to level up. Hurt? Open the BAG to use items or REST: you sleep a whole day down there. Want more fights? BANG ON PIPE in the bag.', 'Carl sells a napkin map to his next hiding spot. Tap your map to see it big and scribble notes on it.'],
  dpad: 'omni',
  ctl: '▲ ▼ CRAWL · ◀ ▶ TURN · SPACE = PICK · SHIFT = BAG',
  act: 'PICK', act2: 'BAG', phone: 'd-pad to crawl and turn (or tap the view), PICK in fights, BAG for items and resting.',
  init(s) {
    const [w, h] = [[17, 12], [19, 13], [21, 14]][s.diff], C = w * 2 + 1, R_ = h * 2 + 1;   /* a BIG crawlspace: this is a long job */
    const m = Array.from({ length: R_ }, (_, r) => Array.from({ length: C }, (_, c) => (r === 0 || c === 0 || r === R_ - 1 || c === C - 1) ? 'S' : '#'));
    /* FOUR ZONES, left to right. Each is its own little maze, and there's exactly ONE gap into the next one, so you go through every zone in order: the drip is in zone 4. */
    const band = c => Math.min(3, Math.floor(((c - 1) >> 1) * 4 / w)); s.W4 = w;
    for (let z = 0; z < 4; z++) { const c0 = 1 + 2 * Math.ceil(z * w / 4), st = [[c0, 1]]; m[1][c0] = '.';
      while (st.length) { const [c, r] = st[st.length - 1], nb = [[2, 0], [-2, 0], [0, 2], [0, -2]].map(([dx, dy]) => [c + dx, r + dy, dx, dy]).filter(([x, y]) => x > 0 && y > 0 && x < C - 1 && y < R_ - 1 && m[y][x] === '#' && band(x) === z);
        if (!nb.length) { st.pop(); continue; } const [x, y, dx, dy] = nb[Math.floor(s.rnd() * nb.length)]; m[r + dy / 2][c + dx / 2] = '.'; m[y][x] = '.'; st.push([x, y]); } }
    for (let i = 0; i < w * h * 0.35; i++) { const c = 1 + Math.floor(s.rnd() * (C - 2)), r = 1 + Math.floor(s.rnd() * (R_ - 2));   // a few loops inside each zone, so it isn't one long hallway
      if (m[r][c] === '#' && (c % 2) !== (r % 2) && (c % 2 === 1 || band(c - 1) === band(c + 1))) m[r][c] = '.'; }
    s.gates = []; for (let z = 0; z < 3; z++) { const cw = 2 * Math.ceil((z + 1) * w / 4), r = 1 + 2 * Math.floor(s.rnd() * h); m[r][cw] = '.'; s.gates.push({ c: cw, r }); }   /* the one way through */
    s.band = band;
    s.map = m; s.C = C; s.R = R_;
    // the broken joint: the farthest spot from the access hatch
    const dist = (c0, r0) => { const D = Array.from({ length: R_ }, () => Array(C).fill(-1)), q = [[c0, r0]]; D[r0][c0] = 0;
      while (q.length) { const [c, r] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = c + dx, y = r + dy; if (m[y][x] === '.' && D[y][x] < 0) { D[y][x] = D[r][c] + 1; q.push([x, y]); } } } return D; };
    const D0 = dist(1, 1); let best = [1, 1]; for (let r = 0; r < R_; r++) for (let c = 0; c < C; c++) if (D0[r][c] > D0[best[1]][best[0]]) best = [c, r];
    s.goal = { c: best[0], r: best[1] }; s.gd = dist(best[0], best[1]); s.gmax = s.gd[1][1];
    s.d0 = D0; s.dmax = D0[best[1]][best[0]];
    { const deadAt = (z, ft, taken) => { let pickC = null, bd = 1e9, lo = 1e9, hi = -1;   /* Carl lives in a dead end in each of the first three zones */
        for (let r = 1; r < R_ - 1; r++) for (let c = 1; c < C - 1; c++) if (m[r][c] === '.' && band(c) === z && c % 2) { lo = Math.min(lo, D0[r][c]); hi = Math.max(hi, D0[r][c]); }
        for (let r = 1; r < R_ - 1; r++) for (let c = 1; c < C - 1; c++) { if (m[r][c] !== '.' || c % 2 === 0 || band(c) !== z || (c === best[0] && r === best[1]) || (c === 1 && r === 1) || taken.some(q => q.c === c && q.r === r)) continue;
          if ([[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b2]) => m[r + b2][c + a] === '.').length !== 1) continue;
          const dd = Math.abs(D0[r][c] - (lo + ft * (hi - lo))); if (dd < bd) { bd = dd; pickC = { c, r }; } } return pickC; };
      s.carls = []; [[0, 0.25, 1], [1, 0.6, 2], [2, 0.75, 3]].forEach(([z, ft, tier]) => { const q = deadAt(z, ft, s.carls); if (q) s.carls.push({ ...q, tier, met: false }); });
      s.kingdom = deadAt(1, 0.3, s.carls); }
    if ((s.carls.length < 3 || !s.kingdom) && (s.regen = (s.regen || 0) + 1) < 12) return this.init(s);   /* not enough nooks for Carl: roll a new crawlspace */
    s.hobo = s.carls[0];
    s.shop = null; s.maps = [false, false, false]; s.scrib = []; s.big = null;
    { const free = []; for (let r = 1; r < R_ - 1; r++) for (let c = 1; c < C - 1; c++) if (m[r][c] === '.' && !(c === 1 && r === 1) && !(c === best[0] && r === best[1]) && !s.carls.some(q => q.c === c && q.r === r) && !(s.kingdom && s.kingdom.c === c && s.kingdom.r === r)) free.push([c, r]);
      s.traps = []; for (let i = 0; i < [14, 13, 12][s.diff] && free.length; i++) { const [c, r] = free.splice(Math.floor(s.rnd() * free.length), 1)[0]; s.traps.push({ c, r }); } s.gloves = []; for (let i = 0; i < 3 && free.length; i++) { const [c, r] = free.splice(Math.floor(s.rnd() * free.length), 1)[0]; s.gloves.push({ c, r }); } }   /* rat traps, baited with the good crackers */
    s.pc = 1; s.pr = 1; s.dir = m[1][2] === '.' ? 0 : 1; s.vx = 1.5; s.vy = 1.5; s.va = s.dir * Math.PI / 2; s.mv = 0;
    s.seen = new Set([101]); s.steps = 0; s.since = 0;
    const H = HERO(s), rod = H.name === 'ROD';
    s.hpMax = s.hp = rod ? 36 : 28; s.dmg = rod ? [3, 6] : [4, 7]; s.runOdds = rod ? 0.5 : 0.7;
    s.lives = 3; s.lvl = 1; s.xp = 0; s.atkB = -1; s.def = 0; s.swing = 0; s.gear = []; s.items = { aid: 1, beans: 0, tonic: 0, poison: 0 }; s.restMin = 0; s.days = 0; s.bag = null; s.kingDone = false;
    s.lights = 3; s.crk = 2; s.score = 0; s.fights = 0; s.won = 0; s.hits = 0; s.battle = null; s.flash = 0; s.fixT = 0;
    s.cv = document.createElement('canvas'); s.cv.width = TRL.RW; s.cv.height = TRL.RH; s.cx = s.cv.getContext('2d'); s.img = s.cx.createImageData(TRL.RW, TRL.RH); s.buf = new Uint32Array(s.img.data.buffer); s.zb = new Float32Array(TRL.RW);
  },
  open(s, c, r) { return s.map[r] && s.map[r][c] === '.'; },
  update(s, dt, I) {
    s.t += dt; FX(s, dt); s.flash = Math.max(0, s.flash - dt); s.shake = Math.max(0, (s.shake || 0) - dt); s.swing = Math.max(0, (s.swing || 0) - dt); s.guard = Math.max(0, (s.guard || 0) - dt); if (s.lvlUp && (s.lvlUp.t += dt) > 3.2) s.lvlUp = null;
    if (s.fixT) { s.fixT += dt;
      if (s.fixT > 4.0) { s.epiT += dt; const L = s.epi[Math.min(s.epiI, s.epi.length - 1)]; if ((s.epiT > 0.4 && (I.Ap || I.ptr.clicked)) || s.epiT > TRL.hold(L[1])) { s.epiI++; s.epiT = 0; SFX(s.epi[Math.min(s.epiI, s.epi.length - 1)][0] === HERO(s).name ? 'ui_tap' : 'ui_select', { vol: 0.5 });
        if (s.epiI >= s.epi.length) { s.epiI = s.epi.length - 1; const f = s.hp / s.hpMax; return (s.end = { win: true, stars: stars3(f >= 0.6 && s.days === 0, f >= 0.3), line: `Pipe fixed. Everybody believes THAT part.${s.days ? ` (${s.days} day${s.days > 1 ? 's' : ''} under the trailer.)` : ''}`, extraTime: 0 }); } } }
      return; }
    if (s.wed) { TRL.music.wtick = performance.now(); TRL.wedM(true); TRL.amb(false); } else { TRL.wedM(false); if (!s.battle) { TRL.music.atick = performance.now(); TRL.amb(true); } else TRL.amb(false); }   /* the wedding gets its own music */
    if (s.talk) { const K = s.talk; K.t += dt; if ((K.t > 0.4 && (I.Ap || I.ptr.clicked)) || K.t > TRL.hold(K.lines[Math.min(K.i, K.lines.length - 1)][1])) { K.i++; K.t = 0; if (K.i >= K.lines.length) { const me = HERO(s).name, them = me === 'ROD' ? 'Matt' : 'Rod'; s.talk.i = K.lines.length - 1; s.end = { win: true, stars: 1, carl: true, extraTime: 0, line: `${them} fixed it. ${me === 'ROD' ? 'Rod' : 'Matt'} is still talking about Carl.` }; } } return; }
    if (s.wake) return this.wakeStep(s, dt, I);
    if (s.wed) return this.wedStep(s, dt, I);
    if (s.bag) return this.bagging(s, dt, I);
    if (s.shop) return this.shopping(s, dt, I);
    if (s.battle) return this.fight(s, dt, I);
    if (s.big) return this.bigStep(s, dt, I);
    if (!s.restTip && s.hp > 0 && s.hp < 15) { s.restTip = true; s.bagPulse = true; (s.log = s.log || []).push('Seems like you need to rest. Tap your BAG and REST for a day.'); SFX('ui_tap'); }   /* told once, the first time you get low */
    if (I.ptr.clicked && I.ptr.x > 338 && I.ptr.x < 472 && I.ptr.y > 10 && I.ptr.y < 92) { s.big = { stroke: null }; I.ptr.clicked = false; SFX('ui_tap'); return; }   /* tap the little map: the big one */
    { const [x, y, w, h] = this.bagBtn(), tap = I.ptr.clicked && I.ptr.x > x && I.ptr.x < x + w && I.ptr.y > y && I.ptr.y < y + h; if (I.Bp || tap) { s.bagQ = true; I.ptr.clicked = false; }   /* asked for the bag while crawling: it opens the moment you stop */
      if (s.bagQ && !(s.mv > 0)) { s.bagQ = false; s.bagPulse = false; s.bag = { sel: 0, battle: false }; SFX('ui_tap'); return; } }
    const H = HERO(s), dur = 0.5;   /* one square every half second, even holding the stick */
    if (s.mv > 0) {   // gliding to the next square / turning
      s.mv -= dt; const k = 1 - Math.max(0, s.mv) / s.mvD;
      s.vx = lerp(s.fx0, s.pc + 0.5, k); s.vy = lerp(s.fy0, s.pr + 0.5, k); s.va = lerp(s.fa0, s.ta, k);
      if (s.mv <= 0) { s.va = s.ta = ((s.ta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); s.vx = s.pc + 0.5; s.vy = s.pr + 0.5; if (s.arrived) { s.arrived = false; this.arrive(s); } }
      return;
    }
    let cmd = null;
    if (I.U || I.Up) cmd = 'F'; else if (I.D || I.Dp) cmd = 'B'; else if (I.Lp || I.L) cmd = 'L'; else if (I.Rp || I.R) cmd = 'R';
    if (!cmd && I.ptr.clicked && I.ptr.x < 336 && I.ptr.y < 192) { const x = (I.ptr.x - 10) / 316; cmd = x < 0.3 ? 'L' : x > 0.7 ? 'R' : 'F'; }   /* tap the view: left third turns left, right third turns right, middle crawls */
    if (!cmd) return;
    s.fx0 = s.vx; s.fy0 = s.vy; s.fa0 = s.va; s.ta = s.va; s.mvD = dur;
    if (cmd === 'L' || cmd === 'R') { s.ta = s.va + (cmd === 'L' ? -1 : 1) * Math.PI / 2; s.dir = (s.dir + (cmd === 'L' ? 3 : 1)) % 4; s.mv = s.mvD = 0.3; return; }
    const v = [[1, 0], [0, 1], [-1, 0], [0, -1]][s.dir], sg = cmd === 'F' ? 1 : -1, nc = s.pc + v[0] * sg, nr = s.pr + v[1] * sg;
    if (s.escort && !s.married && s.kingdom && nc === s.kingdom.c && nr === s.kingdom.r && cmd === 'F') { this.wedding(s); return; }   /* you brought her home */
    const carlHere = s.carls.find(q => q.c === nc && q.r === nr);
    if (carlHere && cmd === 'F') { this.openShop(s, carlHere); return; }   /* crawl up to Carl: he's sitting right there */
    if (!this.open(s, nc, nr) || carlHere || (s.kingdom && nc === s.kingdom.c && nr === s.kingdom.r)) { s.shake = 0.15; return; }   /* bumping a pier: just a shake, no sound */
    s.pc = nc; s.pr = nr; s.mv = s.mvD = cmd === 'B' ? dur * 1.2 : dur; s.arrived = true; { const n = performance.now(); if (n - (TRL.crawlT || 0) > 9000 && Math.random() < 0.18) { TRL.crawlT = n; SFX('ut_crawl', { rate: 0.92 + Math.random() * 0.16 }); } }   /* the knee-shuffle, now and then */
  },
  arrive(s) {
    const fresh = !s.seen.has(s.pr * 100 + s.pc); s.seen.add(s.pr * 100 + s.pc); s.steps++; s.since++;
    { const gl = (s.gloves || []).find(q => !q.got && q.c === s.pc && q.r === s.pr); if (gl) { gl.got = true; (s.log = s.log || []).push(['A muddy work glove. ...Carl\'s? It\'s warm.', 'Somebody\'s glove. Blue. Crunchy.', 'A glove. You do not put it on.'][Math.floor(s.rnd() * 3)]); } }
    { const k = (s.traps || []).findIndex(q => !q.got && q.c === s.pc && q.r === s.pr); if (k >= 0) { s.traps[k].got = true; s.crk++; s.shake = 0.15; SFX('ut_trap_snap'); SFX('ut_get', { vol: 0.6 }); (s.log = s.log || []).push(['You slide a peanut butter cracker off a rat trap... SNAP! Missed your fingers.', 'A rat trap with a little cracker on it. Mine now.', 'Peanut butter cracker off a trap. Slightly chewed.'][Math.floor(s.rnd() * 3)]); } }
    if (s.venom > 0) { s.venom--; if (s.hp > 1) { s.hp--; (s.log = s.log || []).push('The spider bite itches. -1 HP'); } }
    if (s.pc === s.goal.c && s.pr === s.goal.r) { s.fixT = 0.01; s.score += 500; TRL.amb(false); SFX('ut_win', { vol: 0.6 });
      const met = s.met || [], big = ['THE RAT KING', 'BROWN RECLUSE', 'RACCOON', 'BIG BUFF RAT', 'POSSUM', 'SEWER RAT'].find(n => met.includes(n));   /* ...and then nobody believes you */
      const brag = s.married ? 'I got married down there. To a possum. Then I left on a quest.' : !met.length ? 'Just a drip. Easy one.' : big === 'THE RAT KING' ? 'There was a RAT KING down there. With a CROWN.' : big === 'BROWN RECLUSE' ? 'I fought a brown recluse. Hand to hand.' : big === 'RACCOON' ? 'A raccoon jumped me. We went three rounds.' : met.length > 2 ? `I fought ${met.length} things down there.` : `I had to fight a ${big.toLowerCase()} down there.`;
      const nope = s.married ? ['...Congratulations?', 'Does she know where you live?', 'Are you paying child support to a possum?', 'You were under there for an hour.'] : !met.length ? ["That's what I like to hear.", 'Good. Now get in the van.'] : ['Sure you did, bud.', 'Uh huh. Get in the van.', "You were under there twenty minutes. Fixing a Fernco.", 'Was it the same raccoon as last time?', "Sure. And I'm the Rat King.", "You smell like you did, I'll give you that.", "Nobody's gonna believe that.", "Don't tell the customer that."];
      { const me = HERO(s).name, them = me === 'ROD' ? 'MATT' : 'ROD', d = s.days, story = s.married ? 'There were rats. A guy named Carl. I married a possum princess and fought the RAT KING.' : met.includes('THE RAT KING') ? 'There were rats. A guy named Carl. And a RAT KING. With a CROWN.' : brag;   /* you crawl out... and the van is gone */
        s.epi = [[me, 'Done. Pipe fixed.'], [me, "Where'd you go?? Where's the VAN?"], [me, 'Hey. What the hell? You LEFT me?'],
          [them, d >= 2 ? `Where the HELL have you been?! It's been ${d} DAYS!` : d === 1 ? 'Where the HELL have you been?! You were gone ALL NIGHT!' : "Where the hell have you been? I've been at Dunkin' for three hours!"],
          [me, 'Under the trailer. ' + story], ...(s.carls.every(c => c.met) ? [[them, "...Is that whose blue Econoline is out front? It's been there fifteen years."]] : []),
          [them, 'Right....'], [them, 'You good now, though?'], [them, 'I think we should go get you a drug test.'], [them, "You sure something didn't poke you down there?"],
          [me, s.married ? "...Something might've married me." : '...Carl said his hands were warm.'], ...(me === 'ROD' ? [[them, 'NEXT THING YOU WILL be telling me about is ALIENS...']] : [])]; s.epiI = 0; s.epiT = 0; } return; }
    if (s.gd[s.pr][s.pc] === 1 && !s.kingDone) { this.ambush(s, TRL.FOES.find(f => f.king)); return; }   /* he guards the drip */
    this.carlHint(s);
    const chance = [0.09, 0.105, 0.12][s.diff] * (fresh ? 1 : 0.7);   /* fewer fights, and backtracking through places you've cleared is calmer */
    if (s.since > 4 && s.gd[s.pr][s.pc] > 2 && s.rnd() < chance) this.ambush(s);
  },
  zone(s) { return s.d0[s.pr][s.pc] / s.dmax; },
  carlHint(s) {   // close to a Carl you haven't met: you hear him, and which way
    const D = Array.from({ length: s.R }, () => Array(s.C).fill(-1)), q = [[s.pc, s.pr]]; D[s.pr][s.pc] = 0;
    while (q.length) { const [c, r] = q.shift(); if (D[r][c] > 7) continue; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = c + dx, y = r + dy; if ((s.map[y][x] === '.') && D[y][x] < 0) { D[y][x] = D[r][c] + 1; q.push([x, y]); } } }
    for (const cl of s.carls) { if (cl.met || D[cl.r][cl.c] < 0) continue; const d = D[cl.r][cl.c]; if (cl.heard && s.t - cl.heard < 12) continue; cl.heard = s.t;
      let c = cl.c, r = cl.r; while (D[r][c] > 1) { for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = c + dx, y = r + dy; if (D[y] && D[y][x] === D[r][c] - 1) { c = x; r = y; break; } } }   /* walk back to the first step from you */
      const step = [[1, 0], [0, 1], [-1, 0], [0, -1]].findIndex(([dx, dy]) => s.pc + dx === c && s.pr + dy === r), rel = ['AHEAD', 'to your RIGHT', 'BEHIND you', 'to your LEFT'][((step - s.dir) % 4 + 4) % 4];
      const lines = { 1: [`Somebody is humming... "little crackers, little crackers..." It's coming from ${rel}.`, `You smell candle wax and peanut butter. ${rel}.`], 2: [`"...is that you? Did you bring the LITTLE ones?" A voice, ${rel}.`, `Candlelight flickers ${rel}. Someone giggles.`], 3: [`"Psst. PSST. Before you go in there... come see Carl." ${rel}.`, `A voice: "The King's just past here. Come get ready." ${rel}.`] }[cl.tier];
      (s.log = s.log || []).push(lines[Math.floor(s.rnd() * lines.length)] + (d <= 2 ? ' VERY close.' : '')); s.hintT = 4; break; } },
  ambush(s, force) {
    const z = this.zone(s), pool = TRL.FOES.filter(f => !f.king && f.z <= z && !(f.once && (s.met || []).includes(f.name)));
    let r = s.rnd() * pool.reduce((a, f) => a + f.w, 0), F = force || pool[0]; if (!force) for (const f of pool) { if ((r -= f.w) <= 0) { F = f; break; } }
    if (F.king) s.kingSeen = true;
    const kingTalk = F.king ? ["Welcome... to my KINGDOM, plumber.", "For three hundred generations of rats, my family has ruled this drip.", s.married ? "And you ABANDONED my cousin, the Possum Princess. She cried for DAYS." : "Carl told me you were coming. Carl tells me EVERYTHING.", "You came to fix the pipe? The pipe is MINE. The drip is MINE.", "Too bad you won't make it out alive."] : null;   /* the boss speech: about 10 seconds, tap to hurry it */
    const hp = Math.round((F.hp[0] + Math.floor(s.rnd() * (F.hp[1] - F.hp[0] + 1))) * (F.king ? [1.1, 1.3, 1.55][s.diff] : 1.5 + this.zone(s) * 0.6));   /* deeper ones are tougher */
    s.battle = { F, hp, max: hp, sel: 4, q: [], stun: 0, open: 0.6, blink: 0, dmgT: 0, pose: 2, poseT: 0.8, out: 0, talk: kingTalk && { i: 0, t: 0, L: kingTalk } }; s.since = 0; s.fights++; s.flash = 0.6; (s.met = s.met || []).push(F.name); TRL.bgm(true, F.king); TRL.cry(F, true);
    this.say(s, F.princess ? 'THE POSSUM PRINCESS blocks your way. She expects tribute.' : F.gary ? 'It is GARY. Gary is a raccoon in a tiny vest. Gary has done this before.' : F.king ? 'THE RAT KING rises from the muck, cape and all!' : F.name === 'BIG BUFF RAT' ? 'A BIG BUFF RAT flexes at you. It has been working out.' : F.venom ? 'A BROWN RECLUSE drops down from a joist!' : F.thief ? 'A RACCOON was already down here. It is not happy.' : F.possum ? 'A POSSUM hisses at you from behind a pier!' : `A ${F.name} jumps out of the dark!`);
    if (!s.tipped && !F.princess) { s.tipped = true; this.say(s, 'TIP: WHACK hits it. FLASHLIGHT blinds it for 2 turns. CRACKER lets you sneak away.'); this.say(s, 'TIP: BAG has your band-aids. RUN might work... might not.'); }   /* explained once, in the first fight */
  },
  // CRAWLSPACE CARL: lives down here. Has for years. Sells what he's got.
  HOBO_HI: ["Do you have... the crackers? The little ones? With the peanut butter? The LITTLE ones?", "Shhh. Don't move. I can smell them on you. Peanut butter crackers.", "Oh. Oh, hello. Nobody comes down here. Did you bring the little crackers?", "The little orange ones. Six to a pack. Do you understand me? Do you UNDERSTAND me?", "I'll trade you anything. ANYTHING. For the little crackers.", "You crawled all this way. For me? With crackers? Nobody's ever crawled for me with crackers."],
  HOBO_FIRST: "Nobody EVER comes down here. ...Do you have the little crackers? The peanut butter ones? I LOVE the little crackers. Anything. For the little crackers.",
  HOBO_BUY: ["Ooooh. You chose that. You CHOSE that.", "Take it. Take it and think of Carl.", "I'll treasure your crackers. I'm gonna keep 'em in my mouth. For later.", "That's my favorite one. I'll miss it. Goodbye, little friend.", "We're business partners now. That's practically married."],
  HOBO_BYE: ["Don't go. ...Okay, go. But come back. Promise me.", "I'll be right here. I'm always right here.", "You'll dream about Carl tonight. Everybody does.", "Wave at me! ...You waved. I'll remember that forever.", "Mind the spider. Her name's Linda. She's spoken for."],
  HOBO_BROKE: ["No crackers? ...No crackers. That's okay. I'll love you anyway.", "Come back when you have the little ones.", "You don't have enough. That's okay. I'll love you anyway.", "Short? Stay a while. We could just... sit.", "I can't take IOUs. Not since the last one broke my heart."],
  wares(s) { const t = (s.shop && s.shop.tier) || 1, I2 = s.items, gear = (id, label, price, k, v, line) => ({ id, label, price, go: () => { s.gear.push(id); if (k === 'def') s.def += v; else if (k === 'atk') s.atkB += v; else { s.hpMax += v; s.hp += v; } }, line, off: s.gear.includes(id) });
    const L = [{ id: 'bat', label: 'BATTERIES', price: 1, go: () => s.lights++, line: 'Flashlight +1' }, { id: 'aid', label: 'BAND-AIDS', price: 1, go: () => I2.aid++, line: 'Into the bag. +12 HP when you use them.' }];
    if (t === 1) L.push(gear('pipewrench', 'PIPE WRENCH', 3, 'atk', 3, 'ATK +3. Finally, a weapon.'), gear('lid', 'TRASH CAN LID', 3, 'def', 2, 'DEF +2. Strapped to your arm. Smells.'), gear('pads', 'KNEE PADS', 2, 'def', 1, 'DEF +1. Still warm.'));
    if (t >= 2) L.push({ id: 'beans', label: 'COLD BEANS', price: 2, go: () => I2.beans++, line: '+25 HP. He warmed them in his armpit.' }, gear(t === 2 ? 'hat' : 'waders', t === 2 ? 'HARD HAT' : 'CHEST WADERS', t === 2 ? 5 : 7, 'def', t === 2 ? 2 : 3, t === 2 ? "DEF +2. It's his old one." : 'DEF +3. Mostly waterproof.'), gear(t === 2 ? 'wrench' : 'cutter', t === 2 ? 'MONKEY WRENCH' : 'PIPE CUTTER', t === 2 ? 6 : 8, 'atk', t === 2 ? 2 : 3, t === 2 ? 'ATK +2. 24 inches of truth.' : 'ATK +3. Do not ask what else he cut with it.'));
    L.push({ id: 'map', label: t < 3 ? 'NAPKIN MAP' : 'MAP TO THE DRIP', price: t < 3 ? 2 : 3, go: () => { s.maps[t - 1] = true; }, line: t < 3 ? "An X on a napkin: Carl's next hidey-hole. Tap your map to look." : 'An X on a napkin marks the DRIP. Tap your map to look.', off: s.maps[t - 1] });   /* each Carl sells the way to the next one; the last one sells the way to the drip */
    if (t === 3) L.push({ id: 'tonic', label: "CARL'S TONIC", price: 3, go: () => I2.tonic++, line: 'Full health. Smells like gasoline and Carl.' }, { id: 'life', label: 'EXTRA LIFE', price: 20, go: () => { s.lives++; }, line: 'One more life. If you go down, Carl will find you. Carl ALWAYS finds you.' }, { id: 'poison', label: 'RAT POISON', price: 4, go: () => I2.poison++, line: '25 damage to anything with a tail. Including Kings.' });
    return [...L, { id: 'bye', label: 'LEAVE', price: 0 } ]; },
  xs(s) { const M = s.maps || []; return [M[0] && s.carls[1], M[1] && s.carls[2], M[2] && s.goal].filter(Boolean); },   /* where Carl's napkin maps point */
  bigBox() { return { x: 14, y: 26, w: 384, h: 236 }; },
  bigBtns() { return [['CLOSE', 406, 30], ['UNDO', 406, 74], ['CLEAR', 406, 118]].map(([l, x, y]) => ({ l, x, y, w: 64, h: 34 })); },
  bigStep(s, dt, I) {   /* the big map: look at it, and scribble on it in brown */
    const B = s.big, bx = this.bigBox(), Z = Math.min(bx.w / s.C, (bx.h - 10) / s.R), ox = bx.x + (bx.w - s.C * Z) / 2, oy = bx.y + (bx.h - 10 - s.R * Z) / 2, P = I.ptr;
    if (I.Ap || I.Bp) { s.big = null; SFX('ui_tap'); return; }
    if (P.clicked) for (const b of this.bigBtns()) if (P.x > b.x && P.x < b.x + b.w && P.y > b.y && P.y < b.y + b.h) {
      SFX('ui_tap'); if (b.l === 'CLOSE') s.big = null; else if (b.l === 'UNDO') s.scrib.pop(); else s.scrib = []; B.stroke = null; return; }
    const inside = P.x > ox && P.x < ox + s.C * Z && P.y > oy && P.y < oy + s.R * Z;
    if (P.down && inside) { const pt = [+((P.x - ox) / Z).toFixed(2), +((P.y - oy) / Z).toFixed(2)];
      if (!B.stroke) { B.stroke = [pt]; s.scrib.push(B.stroke); } else { const l = B.stroke[B.stroke.length - 1]; if (Math.hypot(pt[0] - l[0], pt[1] - l[1]) > 0.15) B.stroke.push(pt); } }
    else B.stroke = null; },
  drawBig(s, t) {
    const bx = this.bigBox(), Z = Math.min(bx.w / s.C, (bx.h - 10) / s.R), ox = bx.x + (bx.w - s.C * Z) / 2, oy = bx.y + (bx.h - 10 - s.R * Z) / 2;
    R(0, 0, W, H, 'rgba(8,6,4,.92)'); R(bx.x - 4, bx.y - 4, bx.w + 8, bx.h + 8, '#cdb88c'); R(bx.x, bx.y, bx.w, bx.h, '#e6d6ae');   /* a greasy napkin */
    T("CARL'S NAPKIN  ·  DRAW ON IT WITH YOUR FINGER", bx.x + bx.w / 2, 14, '#e8c86a', 6, 'center');
    for (const k of s.seen) { const c = k % 100, r = Math.floor(k / 100); R(ox + c * Z, oy + r * Z, Z + 0.4, Z + 0.4, '#b8a074');   /* +0.4: no hairline seams between squares */
      for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (s.map[r + ddy][c + ddx] !== '.') R(ox + (c + ddx) * Z, oy + (r + ddy) * Z, Z + 0.4, Z + 0.4, '#6e5a3c'); }
    for (let z = 0; z < 4; z++) { const x0 = ox + (2 * Math.ceil(z * s.W4 / 4)) * Z + Z / 2, x1 = z < 3 ? ox + (2 * Math.ceil((z + 1) * s.W4 / 4)) * Z + Z / 2 : ox + (s.C - 1) * Z;   /* the four zones */
      if (z) { g.strokeStyle = 'rgba(200,60,40,.55)'; g.setLineDash([4, 3]); g.lineWidth = 1; g.beginPath(); g.moveTo(x0, oy); g.lineTo(x0, oy + s.R * Z); g.stroke(); g.setLineDash([]); }
      R((x0 + x1) / 2 - 20, oy + s.R * Z + 1, 40, 8, '#cdb88c'); T('ZONE ' + (z + 1), (x0 + x1) / 2, oy + s.R * Z + 5, '#6e5a3c', 5, 'center'); }
    s.carls.forEach((cl, i) => { if (cl.met || s.seen.has(cl.r * 100 + cl.c)) { R(ox + cl.c * Z, oy + cl.r * Z, Z, Z, '#4aa83a'); T('CARL', ox + cl.c * Z + Z / 2, oy + cl.r * Z - 4, '#2e6a24', 4, 'center'); } });
    if (s.escort && s.kingdom) { const kx = ox + s.kingdom.c * Z + Z / 2, ky = oy + s.kingdom.r * Z + Z / 2; C(kx, ky, 9 + Math.sin(t * 5), 'rgba(247,212,74,.35)'); T('♛', kx, ky, '#a07800', 12, 'center'); T('HER KINGDOM', kx, ky - 12, '#8a6400', 5, 'center'); }
    this.xs(s).forEach(q => { const on = Math.floor(t * 3) % 2; T('X', ox + q.c * Z + Z / 2, oy + q.r * Z + Z / 2, on ? '#c0392b' : '#8a2a1e', 9, 'center'); });
    g.strokeStyle = '#6b3f1d'; g.lineWidth = 2; g.lineCap = g.lineJoin = 'round'; for (const st of s.scrib) { g.beginPath(); st.forEach(([x, y], i) => i ? g.lineTo(ox + x * Z, oy + y * Z) : g.moveTo(ox + x * Z, oy + y * Z)); if (st.length === 1) g.lineTo(ox + st[0][0] * Z + 0.5, oy + st[0][1] * Z); g.stroke(); }
    const cx = ox + s.vx * Z, cy = oy + s.vy * Z, a = s.va, k2 = Math.max(4, Z * 0.8); g.fillStyle = '#d4402a'; g.beginPath(); g.moveTo(cx + Math.cos(a) * k2, cy + Math.sin(a) * k2); g.lineTo(cx + Math.cos(a + 2.4) * k2 * 0.7, cy + Math.sin(a + 2.4) * k2 * 0.7); g.lineTo(cx + Math.cos(a - 2.4) * k2 * 0.7, cy + Math.sin(a - 2.4) * k2 * 0.7); g.fill();
    T('YOU', cx, cy - k2 - 4, '#d4402a', 4, 'center');
    this.bigBtns().forEach(b => { R(b.x, b.y, b.w, b.h, '#241c13'); R(b.x, b.y, b.w, 1, '#8a6a30'); T(b.l, b.x + b.w / 2, b.y + b.h / 2 + 1, '#e8dcc0', 6, 'center'); });
    [['X = GO HERE', '#e9665a'], ['GREEN = CARL', '#4aa83a'], ['BROWN =', '#a07040'], ['YOUR NOTES', '#a07040']].forEach(([l, c], i) => T(l, 438, 172 + i * 11, c, 5, 'center')); },
  mood(s, list) { const S = s.shop; if (!S) return; S.face = list[Math.floor(s.rnd() * list.length)]; S.flip = s.rnd() < 0.35 ? [5, 1, 7, 3][Math.floor(s.rnd() * 4)] : null; S.t = 0; },   /* ...and sometimes he flips mid-sentence */
  HOBO_T2: "YOU! You came back! ...Different Carl? There's only one Carl. I get around. Crackers?",
  HOBO_T3: "Shhh. He's right through there. The KING. You're gonna want everything Carl's got. Everything. For the little crackers.",
  openShop(s, cl) { cl = cl || s.carls[0]; if (!cl.found) { cl.found = true; SFX('ut_carl_find'); }   /* found Creepy Carl: the creepy sting, once per Carl */ s.hobo = cl; s.shop = { q: [], sel: 0, tier: cl.tier, say: this.HOBO_HI[Math.floor(s.rnd() * this.HOBO_HI.length)], t: 0, buyT: 0 }; s.metHobo = true; TRL.carl(s); this.mood(s, [0, 6, 4]);
    if (!cl.met) { cl.met = true; s.shop.say = cl.tier === 1 ? this.HOBO_FIRST : cl.tier === 2 ? this.HOBO_T2 : this.HOBO_T3; s.shop.q = this.CARL_STORY[cl.tier].slice(); } },
  CARL_STORY: {
    1: ["I came down here to fix a P-trap. 2009. Nice lady. Doris. ...Or Dot.", "Somebody put the skirting back on while I was under here. With SCREWS. Four of 'em.", "Been living off the little crackers ever since. Somebody keeps baiting the rat traps with 'em. Bless 'em."],
    2: ["I was a handyman. Thirty-one years. Faucets. Furnaces. The occasional possum.", "I could fix that drip, you know. I've been MEANING to. Fifteen years.", "Is there a blue Econoline parked out front? ...No. Don't tell me. I don't want to know."],
    3: ["The King took my good wrench. And my tool belt. And my dignity.", "When you fix that drip... tell 'em upstairs Carl says hi. Tell 'em I'm fine.", "Don't feel bad for me. I got crackers. I got candles. I got a skull. What more does a man need?"] },
  shopping(s, dt, I) {
    const S = s.shop, W2 = this.wares(s); S.t += dt; S.buyT = Math.max(0, S.buyT - dt);
    if (S.q && S.q.length && S.t > TRL.hold(S.say)) { S.say = S.q.shift(); S.t = 0; this.mood(s, [0, 4, 7, 6]); S.t = 0; }   /* he keeps talking while you shop */
    if (I.Up || I.Lp) S.sel = (S.sel + W2.length - 1) % W2.length; if (I.Dp || I.Rp) S.sel = (S.sel + 1) % W2.length;
    let pick = I.Ap ? S.sel : null;
    if (I.ptr.clicked) for (let i = 0; i < W2.length; i++) { const [x, y, w, h] = this.optBox(i, W2.length); if (I.ptr.x > x && I.ptr.x < x + w && I.ptr.y > y && I.ptr.y < y + h) { S.sel = i; pick = i; } }
    if (I.D && !I.Dp && false) {}
    if (pick === null) return;
    const it = W2[pick];
    if (it.id === 'bye') { (s.log = s.log || []).push('CARL: ' + this.HOBO_BYE[Math.floor(s.rnd() * this.HOBO_BYE.length)]); if (!s.iga) { s.iga = true; s.log.push('(Could have bought out his whole store with three bucks of crackers from IGA.)'); } s.shop = null; SFX('ui_select'); return; }
    if (it.off) { S.say = "You already have it. Do you not like it? ...You don't like it."; this.mood(s, [3]); S.flip = 5; SFX('click'); return; }
    if (s.crk < it.price) { S.say = this.HOBO_BROKE[Math.floor(s.rnd() * this.HOBO_BROKE.length)]; this.mood(s, [2, 5]); SFX('click'); return; }
    s.crk -= it.price; it.go(); TRL.carl(s, 0.3); S.say = it.id === 'tonic' ? "Oh yes. You'll like this. It's full of gasoline and my LOVE. And remember... Carl's hands are always warm.  (" + it.line + ')' : this.HOBO_BUY[Math.floor(s.rnd() * this.HOBO_BUY.length)] + '  (' + it.line + ')'; this.mood(s, [1, 6]); S.buyT = 1.2; SFX('ut_buy', { vol: 0.7 });
  },
  // knocked out of the crawlspace: he tells the other guy everything. The other guy doesn't buy a word of it, goes down, and fixes it.
  defeated(s) {
    const me = HERO(s).name, them = me === 'ROD' ? 'MATT' : 'ROD', met = s.met || [], pick = a => a[Math.floor(s.rnd() * a.length)], L = [];
    const SEEN = { 'SEWER RAT': 'Rats. A LOT of rats.', 'BIG BUFF RAT': "One of the rats was JACKED. Like it LIFTS.", 'POSSUM': 'A possum faked its own death at me. Then it got back UP.', 'RACCOON': 'A raccoon took my peanut butter. Right out of my hand.', 'BROWN RECLUSE': 'A brown recluse came down on a string. I can still feel it.', 'THE POSSUM PRINCESS': 'A possum PRINCESS knighted me. With a twig. I am a knight now.', 'GARY': 'A raccoon named Gary robbed me. He had a VEST.', 'THE RAT KING': 'There is a KING down there. A RAT king. He had a CAPE.' };
    L.push([me, pick(["I'm out. I'm not going back down there.", "Don't. Don't go under there.", "I need a minute. Maybe a week."])]);
    [...new Set(met)].slice(-3).forEach(n => L.push([me, SEEN[n]]));
    if (s.married) L.push([me, "Also I'm married now. To a possum princess. I said I was going on a quest."]);
    if (s.metHobo) L.push([me, pick(["And a guy named Carl lives down there! He sold me beans!", "There's a man down there. Carl. He wears a hard hat. He LOVES me.", "Carl. His name is Carl. He warmed beans in his armpit."])]);
    L.push([them, pick(['Uh huh.', 'Sure, bud.', 'Right.', "You've been under a trailer for twenty minutes."])]);
    L.push([them, pick(["I'll just go do it then, scaredy cat.", "Gimme the Fernco. I'll do it, scaredy cat.", "Move. I'll go do it, scaredy cat."])]);
    L.push(['', '* TWENTY MINUTES LATER *']);
    L.push([them, pick(['Done. Pipe was right there.', 'Fernco on, clamps tight. Easy.', "Took five minutes. Didn't even get dirty."])]);
    L.push([me, pick(['...Did you see them?', '...And the rats?', '...Did you see the KING?'])]);
    L.push([them, s.metHobo ? pick(["There's no Carl. There's nobody down there.", 'Who is Carl.', "There's a candle. And a can of beans. That's it."]) : pick(['What rats?', 'I saw a spider web.', 'There was a candle down there, weird. That was it.'])]);
    L.push([me, s.metHobo ? "...He's real." : '...They were THERE.']);
    L.push([them, pick(['Get in the van.', "Don't tell the customer.", 'I am never letting you live this down.'])]);
    s.talk = { lines: L, i: 0, t: 0 };
  },
  weapon(s) { const G2 = s.gear; return G2.includes('cutter') ? 'pipe cutter' : G2.includes('wrench') ? 'monkey wrench' : G2.includes('pipewrench') ? 'pipe wrench' : 'fists'; },
  gainXP(s, n) { s.xp += n; while (s.xp >= s.lvl * 60) { s.xp -= s.lvl * 60; s.lvl++; SFX('ut_levelup'); s.lvlUp = { t: 0, lvl: s.lvl }; s.hpMax += 5; s.hp = Math.min(s.hpMax, s.hp + Math.round(s.hpMax * 0.4)); (s.log = s.log || []).push(`LEVEL ${s.lvl}! Max HP +5, hits harder. You feel more... crawly.`); SFX('ui_select'); } },
  // the bag: stats, items, and resting. B opens it. In a fight, using something takes your turn.
  bagList(s) { const I2 = s.items, inB = s.bag && s.bag.battle; const L = [
      { id: 'aid', label: `BAND-AIDS x${I2.aid}`, off: !I2.aid }, { id: 'beans', label: `COLD BEANS x${I2.beans}`, off: !I2.beans }, { id: 'tonic', label: `CARL'S TONIC x${I2.tonic}`, off: !I2.tonic } ];
    if (inB) L.push({ id: 'poison', label: `RAT POISON x${I2.poison}`, off: !I2.poison });
    else L.push({ id: 'rest', label: 'REST A DAY', off: s.hp >= s.hpMax }, { id: 'bang', label: 'BANG ON PIPE', off: s.gd[s.pr][s.pc] <= 2 });   /* call a critter over: fight on purpose */
    L.push({ id: 'close', label: 'CLOSE' }); return L; },
  bagging(s, dt, I) {
    const B = s.bag, L = this.bagList(s);
    { const [x, y, w, h] = this.bagBtn(), tap = I.ptr.clicked && I.ptr.x > x && I.ptr.x < x + w && I.ptr.y > y && I.ptr.y < y + h;   /* tap the backpack again (or B) to close it */
      if (tap || (I.Bp && !B.battle)) { s.bag = null; if (B.battle) s.battle.sel = 4; SFX('ui_tap'); I.ptr.clicked = false; return; } }
    if (I.Up || I.Lp) B.sel = (B.sel + L.length - 1) % L.length; if (I.Dp || I.Rp) B.sel = (B.sel + 1) % L.length;
    let pick = I.Ap ? B.sel : null;
    if (I.ptr.clicked) for (let i = 0; i < L.length; i++) { const [x, y, w, h] = this.bagBox(i); if (I.ptr.x > x && I.ptr.x < x + w && I.ptr.y > y && I.ptr.y < y + h) { B.sel = i; pick = i; } }
    if (pick === null) return; const it = L[pick];
    if (it.id === 'close') { s.bag = null; if (B.battle) s.battle.sel = 4; SFX('ui_tap'); return; }
    if (it.off) { SFX('click'); return; } SFX('ui_select');
    const heal = n => { const h0 = s.hp; s.hp = Math.min(s.hpMax, s.hp + n); return s.hp - h0; };
    let msg = '';
    if (it.id === 'aid') { s.items.aid--; msg = `Band-aids. +${heal(12)} HP.`; s.venom = 0; }
    if (it.id === 'beans') { s.items.beans--; msg = `Cold beans. +${heal(25)} HP. Armpit-warm.`; }
    if (it.id === 'tonic') { s.items.tonic--; msg = `Carl's Tonic. +${heal(999)} HP. Your eyes water. You feel AMAZING.`; s.venom = 0; }
    if (it.id === 'poison') { s.items.poison--; const b = s.battle; msg = `You fling the rat poison. 25 damage!`; b.hp -= 25; b.blink = 0.4; b.dmgT = 0.7; b.dmg = 25; b.pose = 6; b.poseT = 0.6; }
    if (it.id === 'bang') { s.restMin += 5; s.bag = null; (s.log = s.log || []).push((L => L[Math.floor(s.rnd() * L.length)])(['You bang on the pipe. CLANG CLANG CLANG. Something heard that.', 'You whack a joist. The dark goes quiet... then it scurries.', 'You yell "HERE RATTY RATTY." You regret it immediately.'])); this.ambush(s); return; }
    if (it.id === 'rest') { s.days++; if (s.rnd() < 0.3) { msg = `You lie down in the dirt... something is chewing your boot.`; s.bag = null; (s.log = s.log || []).push(msg); this.ambush(s); return; }
      msg = `You curl up in the muck and sleep. A whole day goes by. +${heal(Math.round(s.hpMax * 0.6))} HP. (Day ${s.days + 1} under the trailer.)`; }
    s.bag = null; (s.log = s.log || []).push(msg);
    if (B.battle) { const b = s.battle; this.say(s, msg); b.after = () => { if (b.hp <= 0) b.wonFn(); else b.foeTurnFn(); }; } },
  bagBox(i) { return [178, 30 + i * 22, 140, 18]; },
  // THE POSSUM KINGDOM: you brought the Princess home. Her family has expectations.
  wedding(s) { const me = HERO(s).name;
    for (let k = 0; k < 3; k++) setTimeout(() => SFX('ut_mystery'), k * 3400);   /* the wedding begins: the mystery sting, three times */
    s.wed = { i: 0, t: 0, sel: 0, lines: [
      ['', 'THE POSSUM KINGDOM'],
      ['POSSUM KING', 'You. Human. You have returned our daughter.'],
      ['POSSUM QUEEN', 'And she says you gave her a CRACKER.'],
      ['POSSUM KING', 'In the Possum Kingdom, a cracker is a proposal.'],
      [me, '...It is NOT a proposal.', ['NO. ABSOLUTELY NOT.', 'I GAVE HER A CRACKER.', 'I AM HERE TO FIX A PIPE.']],
      ['POSSUM QUEEN', 'He said yes.'],
      ['POSSUM KING', 'He said yes!'],
      [me, 'I did NOT say yes.', ['NO.', 'NO!', 'I SAID NO.']],
      ['', 'The possums do not accept "no." Several of them are already crying.'],
      ['POSSUM KING', 'Dearly beloved. We are gathered here in the dirt...'],
      ['THE PRINCESS', '*hisses lovingly*'],
      ['POSSUM KING', 'You may now kiss the possum.'],
      [me, '...', ['*kiss the possum*', '*kiss the possum, crying*', '*shake her paw firmly*']],
      ['', 'You are married. The possums play dead in celebration.'],
      ['POSSUM QUEEN', 'Will you stay, son? Forever? In the dirt?'],
      [me, 'Honey... I have to go on a quest. A very long quest.', ['I WILL RETURN.', 'I WILL... RETURN.', 'DO NOT WAIT UP.']],
      ['THE PRINCESS', '*plays dead out of sadness*'],
      ['', 'You crawl away. You will never return. You keep the dowry.'],
    ] }; SFX('ui_select'); },
  wedStep(s, dt, I) { const W2 = s.wed, L = W2.lines[W2.i], ch = L[2]; W2.t += dt;
    if (ch) { if (I.Up || I.Lp) W2.sel = (W2.sel + ch.length - 1) % ch.length; if (I.Dp || I.Rp) W2.sel = (W2.sel + 1) % ch.length;
      let pick = I.Ap ? W2.sel : null; if (I.ptr.clicked) ch.forEach((_, i) => { const [x, y, w, h] = this.optBox(i, ch.length); if (I.ptr.x > x && I.ptr.x < x + w && I.ptr.y > y && I.ptr.y < y + h) pick = i; });
      if (pick === null || W2.t < 0.4) return; SFX('ui_select'); }
    else if (!((W2.t > 0.4 && (I.Ap || I.ptr.clicked)) || W2.t > TRL.hold(L[1]))) return;
    W2.i++; W2.t = 0; W2.sel = 0;
    if (W2.i >= W2.lines.length) { s.wed = null; s.escort = false; s.married = true; s.crk += 5; s.items.tonic += 2; s.gear.push('crown'); s.def += 2; this.gainXP(s, 150);
      (s.log = s.log || []).push('THE DOWRY: 8 crackers, 2 Carl\'s Tonics, and a tiny POSSUM CROWN (DEF +2).'); SFX('ui_select'); } },
  respawn(s) {   // knocked out: you come to back at the last Carl you visited (or the hatch), patched up
    s.lives--; const back = [...s.carls].reverse().find(c => c.met), spot = back ? [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [back.c + dx, back.r + dy]).find(([c, r]) => s.map[r][c] === '.') : [1, 1];
    s.pc = spot[0]; s.pr = spot[1]; s.vx = s.pc + 0.5; s.vy = s.pr + 0.5; s.mv = 0; s.hp = s.hpMax; s.venom = 0; s.since = 0; s.flash = 1; s.days++; SFX('ut_wake', { vol: 0.5 });
    if (back) { const d = [[1, 0], [0, 1], [-1, 0], [0, -1]].findIndex(([dx, dy]) => s.pc + dx === back.c && s.pr + dy === back.r); s.dir = d; s.va = s.ta = d * Math.PI / 2; }
    const left = `(${s.lives} ${s.lives === 1 ? 'life' : 'lives'} left)`;
    if (!back) { (s.log = s.log || []).push(`You wake up by the hatch. Everything hurts. ${left}`); return; }
    const me = HERO(s).name, pick = a => a[Math.floor(s.rnd() * a.length)], first = !s.rubbed; s.rubbed = (s.rubbed || 0) + 1;
    TRL.carl(s); s.wake = { i: 0, t: 0, lines: first ? [
      ['CARL', 6, "Shhh. Shhhh. You're awake. Carl found you."],
      ['CARL', 0, "You were face down in the muck. So Carl dragged you back to Carl's special place."],
      ['CARL', 4, "By the ankles. Took a while. You're heavier than you look."],
      ['CARL', 6, "Then Carl rubbed you. And rubbed you. Until you were all better."],
      ['CARL', 1, "Magic hands. Carl's got MAGIC hands. Thirty-one years of handyman hands."],
      [me, 'gross', '...Where. Where did you rub.'],
      ['CARL', 0, 'Everywhere that hurt.'],
      [me, 'gross', pick(["Nothing hurt THAT much.", "I'm going to need a minute.", "I'm gonna go stand in the rain for a while."])],
      ['CARL', 6, "Come back anytime. Carl's hands are always warm."],
      ['', 0, `Full health. Lingering discomfort. ${left}`] ] : [
      ['CARL', 6, pick(["You came back to Carl. You WANTED the hands.", "Back so soon? Carl warmed his hands up just in case.", "Again? Carl's starting to think you're doing it on purpose."])],
      ['CARL', 4, pick(["Same as last time. Ankles, then the rubbing.", "Carl did the special technique this time. You'll know it when you feel it.", "Don't look at your back. Just trust Carl."])],
      [me, 'gross', pick(["I want to go home.", "Please stop saying 'the rubbing.'", "Why is my shirt on backwards.", me === 'ROD' ? "I'm never telling Matt about this." : "I'm never telling Rod about this."])],
      ['', 0, `Full health. Your soul, less so. ${left}`] ] }; },
  wakeStep(s, dt, I) { const W2 = s.wake; W2.t += dt; if (!((W2.t > 0.4 && (I.Ap || I.ptr.clicked)) || W2.t > TRL.hold(W2.lines[W2.i][2]))) return; W2.i++; W2.t = 0; if (W2.i >= W2.lines.length) { (s.log = s.log || []).push(W2.lines[W2.lines.length - 1][2]); s.wake = null; } },
  endFight(s) { s.battle = null; TRL.bgm(false); },
  say(s, text, fx) { s.battle.q.push({ text, fx, t: 0 }); },
  // turn-based: messages play one at a time (tap / PICK to hurry them), then the menu comes back
  fight(s, dt, I) {
    const b = s.battle, tap = I.Ap || I.ptr.clicked; TRL.music.tick = performance.now();
    b.poseT = Math.max(0, b.poseT - dt); if (b.poseT <= 0 && b.pose !== 7) b.pose = null; if (b.out) b.out += dt;
    if (b.open > 0) { b.open -= dt; return; }
    if (b.talk) { const K = b.talk; K.t += dt; if (K.i === 0 && K.t < dt * 1.5) { TRL.cry(b.F, true); s.shake = 0.3; }
      if ((K.t > 0.4 && tap) || K.t > (K.i === K.L.length - 1 ? 2.8 : 2.1)) { K.i++; K.t = 0; b.pose = K.i === K.L.length - 1 ? 4 : 2; b.poseT = 0.8; if (K.i === K.L.length - 1) { TRL.cry(b.F, true); s.shake = 0.4; } if (K.i >= K.L.length) b.talk = null; } return; }
    b.blink = Math.max(0, b.blink - dt); b.dmgT = Math.max(0, b.dmgT - dt);
    if (b.q.length) { const m = b.q[0]; if (!m.t && m.fx) m.fx(); m.t += dt; if ((m.t > 0.25 && tap) || m.t > 1.6) { (s.log = s.log || []).push(m.text.length > 52 ? m.text.slice(0, 51) + '…' : m.text); b.q.shift(); if (!b.q.length && b.after) { const a = b.after; b.after = null; a(); } } return; }
    const OPTS = this.opts(s);
    if (I.Up || I.Lp) b.sel = (b.sel + OPTS.length - 1) % OPTS.length; if (I.Dp || I.Rp) b.sel = (b.sel + 1) % OPTS.length;
    let pick = I.Ap ? b.sel : null;
    if (I.ptr.clicked) for (let i = 0; i < OPTS.length; i++) { const [x, y, w, h] = this.btnBox(i, OPTS.length); if (I.ptr.x > x && I.ptr.x < x + w && I.ptr.y > y && I.ptr.y < y + h) { b.sel = i; pick = i; } }
    if (pick === null) return;
    const o = OPTS[pick]; if (o.off) { SFX('click'); return; } SFX('ui_select');
    const foeTurn = () => {
      if (b.F.king && !b.ph2 && b.hp < b.max / 2) { b.ph2 = true; b.guards = 2;   /* PHASE 2: he calls his royal guard and gets mad */
        this.say(s, 'THE RAT KING lets out a royal SCREECH!', () => { b.pose = 4; b.poseT = 1.2; s.shake = 0.5; TRL.cry(b.F, true); });
        this.say(s, 'Two ROYAL GUARD RATS jump in!', () => { b.gIn = 0.01; SFX('rat_screech', { vol: 0.6, dur: 0.8 }); });
        this.say(s, "He's FURIOUS. His claws hit harder now."); return; }
      if (b.stun > 0) { b.stun--; this.say(s, `The ${b.F.name} is still seeing spots.`); return; }
      if (b.faking) { b.faking = false; this.say(s, `...The POSSUM gets right back up. It was faking!`, () => { b.pose = 4; b.poseT = 0.6; TRL.cry(b.F); }); return; }
      if (s.rnd() < 0.12) { this.say(s, `The ${b.F.name} lunges... and misses!`, () => { b.pose = 3; b.poseT = 0.5; }); return; }
      if (b.F.thief && s.crk > 0 && s.rnd() < 0.35) { const n2 = b.F.gary ? Math.min(2, s.crk) : 1; this.say(s, b.F.gary ? `GARY pockets ${n2} of your crackers. In his VEST.` : 'The RACCOON snatches one of your crackers!', () => { s.crk -= n2; b.stolen = (b.stolen || 0) + n2; b.pose = 5; b.poseT = 0.6; TRL.cry(b.F); }); return; }
      const gn = b.guards > 0 ? b.guards : 0;   /* each guard gets a nip in */
      const d = Math.max(1, Math.round((b.F.atk[0] + s.rnd() * (b.F.atk[1] - b.F.atk[0])) * (s.k || 1) * (b.ph2 ? 1.15 : 1) * (1 + (b.F.king ? 0 : this.zone(s) * 0.25))) - s.def) + gn;   /* your gear soaks some of it */
      this.say(s, b.F.king ? (gn ? `The King AND his guards get you! -${d} HP` : b.ph2 ? `THE FURIOUS RAT KING mauls you! -${d} HP` : `THE RAT KING rakes you with royal claws! -${d} HP`) : b.F.venom ? `The BROWN RECLUSE bites! -${d} HP. That's gonna itch.` : b.F.thief ? `The RACCOON claws you! -${d} HP` : `The ${b.F.name} bites! -${d} HP`,
        () => { s.hp -= d; s.hits++; s.shake = 0.35; s.guard = 0.6; SFX('ut_umph', { rate: 0.92 + Math.random() * 0.16 }); b.pose = 5; b.poseT = 0.6; TRL.cry(b.F); if (b.F.venom) s.venom = 6; });
      b.after = () => { if (s.hp <= 0) { s.hp = 0; TRL.bgm(false); s.battle = null; if (s.lives > 0) this.respawn(s); else this.defeated(s); } };
    };
    const won = () => {
      if (b.F.princess) {   /* beat her in a fair fight and she's smitten anyway: the escort (and the wedding) still happen */
        this.say(s, 'THE POSSUM PRINCESS stops. She has never lost before.', () => { b.pose = 4; b.poseT = 1.2; });
        this.say(s, 'She is... impressed. She bats her eyes at you.');
        this.say(s, 'She takes your hand. She would like to go HOME now. (A crown on your map marks her kingdom.)', () => { this.gainXP(s, Math.round(b.F.pts * 1.35)); s.score += b.F.pts; s.won++; s.escort = true; b.out = 0.01; });
        b.after = () => this.endFight(s); return; } this.say(s, b.F.venom ? `You squash the BROWN RECLUSE. +${b.F.pts} PTS` : b.F.possum ? `The POSSUM waddles off, offended. +${b.F.pts} PTS` : `The ${b.F.name} runs off! +${b.F.pts} PTS`, () => { const loot = b.F.king ? 4 : b.F.gary ? 3 : s.rnd() < [0.7, 0.63, 0.56][s.diff] ? 1 : 0;   /* most critters aren't carrying crackers */ s.crk += loot + (b.stolen || 0); if (b.stolen) (s.log = s.log || []).push(`You get your ${b.stolen} stolen cracker${b.stolen > 1 ? 's' : ''} back, too.`); this.gainXP(s, Math.round(b.F.pts * 1.35)); if (b.F.king) { s.kingDone = true; try { if (window.DDT_SONGS && DDT_SONGS.unlock('under_the_trailer.mp3')) s.songU = { t: 0 }; } catch (e) {} }   /* beat him: his song unlocks */ if (loot) (s.log = s.log || []).push(`It dropped ${loot} peanut butter cracker${loot > 1 ? 's' : ''}. Where was it keeping those.`); s.score += b.F.pts; s.won++; b.pose = b.F.venom ? 7 : 3; b.poseT = 9; b.out = b.F.venom ? 0 : 0.01; TRL.cry(b.F); }); b.after = () => this.endFight(s); };
    b.wonFn = won; b.foeTurnFn = foeTurn;
    if (o.id === 'item') { s.bag = { sel: 0, battle: true }; return; }
    if (o.id === 'whack' && b.guards > 0) {   /* the guards are in the way: you have to get through them first */
      this.say(s, b.guards === 2 ? 'You knock a guard rat flying!' : 'The last guard flees. Get the King!', () => { s.swing = 0.35; b.guards--; s.shake = 0.12; SFX('wrench_hit'); });
      b.after = () => foeTurn();
    } else if (o.id === 'whack') {
      if (s.rnd() < 0.1) this.say(s, this.weapon(s) === 'fists' ? 'You swing... and punch a pier. OW.' : `You swing the ${this.weapon(s)}... and hit a pier. CLANG.`, () => { s.swing = 0.35; SFX('click'); });
      else { const crit = s.rnd() < 0.12, d = Math.round((s.dmg[0] + s.rnd() * (s.dmg[1] - s.dmg[0]) + s.atkB + (s.lvl - 1)) * (crit ? 2 : 1));
        this.say(s, crit ? `CRITICAL ${this.weapon(s) === 'fists' ? 'PUNCH' : 'WHACK'}! ${d} damage!` : this.weapon(s) === 'fists' ? `You punch it! ${d} damage.` : `You whack it with the ${this.weapon(s)}! ${d} damage.`, () => { s.swing = 0.35; b.hp -= d; b.blink = 0.4; b.dmgT = 0.7; b.dmg = d; s.shake = 0.12; b.pose = 6; b.poseT = 0.6; b.faking = false; SFX('wrench_hit'); }); }
      b.after = () => { if (b.hp <= 0) won(); else if (b.F.possum && !b.played && b.hp < b.max / 2) { b.played = b.faking = true; this.say(s, 'The POSSUM keels over. ...Is it dead?', () => { b.pose = 7; b.poseT = 99; }); } else foeTurn(); };
    } else if (o.id === 'light') {
      s.lights--; this.say(s, 'You blast it with the flashlight!', () => { s.flash = 0.35; SFX('click'); });
      if (b.guards > 0) this.say(s, 'The guard rats scatter from the light!', () => { b.guards = 0; });
      if (s.rnd() < (b.F.king ? 0.4 : 0.85)) { b.stun = b.F.king ? 1 : 2; this.say(s, b.F.king ? 'THE RAT KING is blinded! He loses his next attack.' : `The ${b.F.name} is blinded! It loses its next 2 attacks.`); } else this.say(s, 'It just squints at you.');
      b.after = () => foeTurn();
    } else if (o.id === 'pb') {
      if (b.F.princess) { s.crk--; this.say(s, 'You offer the Princess a peanut butter cracker...'); this.say(s, 'She accepts. She knights you with a twig. DEF +1!', () => { SFX('ut_knight', { vol: 0.7 }); s.def++; b.pose = 4; b.poseT = 1; }); this.say(s, 'She takes your hand. She would like to go HOME now. (A crown on your map marks her kingdom.)', () => { this.gainXP(s, Math.round(b.F.pts * 1.35)); s.escort = true; b.out = 0.01; }); b.after = () => this.endFight(s); return; }
      s.crk--; this.say(s, 'You flick a peanut butter cracker down the row...'); this.say(s, `The ${b.F.name} goes for it. You crawl away.`, () => { b.pose = 3; b.poseT = 9; b.out = 0.01; }); b.after = () => this.endFight(s);
    } else if (o.id === 'run') {
      if (s.rnd() < s.runOdds * (b.F.king ? 0.5 : 1)) { this.say(s, 'You scramble away through the muck!', () => SFX('ut_flee', { vol: 0.6 })); b.after = () => this.endFight(s); }
      else { this.say(s, "You're stuck in the muck!"); b.after = () => foeTurn(); }
    }
  },
  opts(s) { const K = s.battle && s.battle.F.king; return [{ id: 'light', label: `FLASHLIGHT x${s.lights}`, off: s.lights <= 0 }, { id: 'run', label: 'RUN', off: K }, { id: 'pb', label: `TOSS A CRACKER x${s.crk}`, off: s.crk <= 0 || K }, { id: 'item', label: 'BAG' }, { id: 'whack', label: this.weapon(s) === 'fists' ? 'PUNCH' : 'WHACK' }]; },   /* flashlight | run / cracker | bag / big WHACK across the bottom */
  optBox(i, n = 4) { const gap = Math.min(34, Math.floor(164 / n)), h = gap - 3; return [342, 26 + i * gap, 126, h]; },   /* list buttons, down the whole right-hand column */
  btnBox(i, n) { const W3 = 61, H3 = 49; if (i === 4 && n === 5) return [342, 26 + 2 * (H3 + 4), 126, H3]; return [342 + (i % 2) * (W3 + 4), 26 + Math.floor(i / 2) * (H3 + 4), W3, H3]; },   /* fight buttons: a 2x2 grid + one wide one */
  bagBtn() { return [424, 132, 44, 50]; },
  tile(s, o, [x, y, w, h], on, dim) {   /* a big tappable picture button */
    R(x, y, w, h, on ? '#5a4420' : '#241c13'); R(x, y, w, 1, on ? '#f7c418' : '#8a6a30'); R(x, y + h - 1, w, 1, '#120e09'); if (on) { R(x, y, 1, h, '#f7c418'); R(x + w - 1, y, 1, h, '#f7c418'); }
    g.save(); if (dim) g.globalAlpha = 0.38; const cx = x + w / 2, cy = y + (h - 12) / 2 + 1, sz = Math.min(w, h - 12) - 4; TRL.icon(s, o.id, cx, cy, sz);
    const lab = o.id === 'whack' ? (this.weapon(s) === 'fists' ? 'PUNCH' : 'WHACK') : o.id === 'light' ? 'FLASHLIGHT' : o.id === 'item' ? 'BAG' : o.id === 'pb' ? 'CRACKER' : o.id === 'run' ? 'RUN' : o.label;
    T(lab, cx, y + h - 7, on ? '#f7c418' : '#e8dcc0', 5, 'center');
    const n2 = o.id === 'light' ? s.lights : o.id === 'pb' ? s.crk : null; if (n2 != null) { R(x + w - 15, y + 3, 12, 10, '#0a0806'); T(String(n2), x + w - 9, y + 8.5, n2 ? '#7bd65b' : '#8a5a50', 5, 'center'); }
    g.restore(); },
  render(s) {   // the 3D view: raycast walls, cast floor + ceiling, then the broken joint as a sprite
    const { RW, RH, T: N, T2: M } = TRL, buf = s.buf, zb = s.zb, tx = TRL.tex, HI = tx.hi;
    const dx = Math.cos(s.va), dy = Math.sin(s.va), pl = 0.66, plx = -dy * pl, ply = dx * pl, px = s.vx, py = s.vy;
    const lightCol = new Float32Array(RW); for (let x = 0; x < RW; x++) { const u = (x / RW - 0.5) * 2; lightCol[x] = 1 - 0.7 * u * u; }   // the headlamp beam
    const shade = (col, k) => { if (k >= 1) return col; const r = (col & 255) * k, gg = ((col >> 8) & 255) * k, b2 = ((col >> 16) & 255) * k; return (255 << 24) | (b2 << 16) | (gg << 8) | r; };
    const lit = d => Math.min(1, 0.95 / (0.45 + d * d * 0.85)) + 0.02;   /* it's DARK under there: just your headlamp */
    // floor & ceiling
    const r0x = dx - plx, r0y = dy - ply, r1x = dx + plx, r1y = dy + ply, half = RH / 2;
    for (let y = Math.floor(half) + 1; y < RH; y++) {
      const rd = half / (y - half), sx = rd * (r1x - r0x) / RW, sy = rd * (r1y - r0y) / RW; let fx = px + rd * r0x, fy = py + rd * r0y; const L = lit(rd);
      const yc = RH - 1 - y;
      for (let x = 0; x < RW; x++) { const tX = ((fx - Math.floor(fx)) * M) | 0, tY = ((fy - Math.floor(fy)) * M) | 0, k = L * lightCol[x];
        buf[y * RW + x] = shade(HI.dirt[tY * M + tX], k); buf[yc * RW + x] = shade(HI.ceil[tY * M + tX], k * 0.9); fx += sx; fy += sy; }
    }
    // walls
    for (let x = 0; x < RW; x++) {
      const cam = 2 * x / RW - 1, rx = dx + plx * cam, ry = dy + ply * cam;
      let mx = Math.floor(px), my = Math.floor(py); const ddx = Math.abs(1 / rx), ddy = Math.abs(1 / ry), stx = rx < 0 ? -1 : 1, sty = ry < 0 ? -1 : 1;
      let sdx = (rx < 0 ? px - mx : mx + 1 - px) * ddx, sdy = (ry < 0 ? py - my : my + 1 - py) * ddy, side = 0, cell = '.';
      for (let i = 0; i < 64; i++) { if (sdx < sdy) { sdx += ddx; mx += stx; side = 0; } else { sdy += ddy; my += sty; side = 1; } cell = (s.map[my] || [])[mx]; if (cell !== '.') break; }
      const perp = Math.max(0.05, side ? sdy - ddy : sdx - ddx); zb[x] = perp;
      const lh = RH / perp, top = Math.max(0, Math.floor(half - lh / 2)), bot = Math.min(RH, Math.ceil(half + lh / 2));
      let wx = side ? px + perp * rx : py + perp * ry; wx -= Math.floor(wx); const tX = Math.min(M - 1, (wx * M) | 0), T2 = cell === 'S' ? HI.skirt : HI.block, k = lit(perp) * lightCol[x] * (side ? 0.78 : 1);
      for (let y = top; y < bot; y++) { const tY = Math.min(M - 1, ((y - half + lh / 2) * M / lh) | 0), c = T2[tY * M + tX]; buf[y * RW + x] = (c & 0xffffff) === 0xc8f0fa /* the daylight crack doesn't dim */ ? c : shade(c, k); }
    }
    // the broken joint (a billboard)
    if (!tx.trapI && MG('ut_trap')) { tx.trapI = TRL.imgTex('ut_trap', 12); tx.snapI = TRL.imgTex('ut_trap_snap', 13); tx.gloveI = TRL.imgTex('ut_glove', 11); }
    const art = !!MG('ut_trap');   /* with the painted finds loaded, traps and gloves get drawn smooth on top of the view (see draw), not as chunky blocks */
    s.props = [];
    if (art) for (const [q, n, w] of [...(s.traps || []).map(q => [q, q.got ? 'ut_trap_snap' : 'ut_trap', q.got ? 13 : 12]), ...(s.gloves || []).filter(q => !q.got).map(q => [q, 'ut_glove', 11])]) {
      const sx = q.c + 0.5 - px, sy = q.r + 0.5 - py, inv = 1 / (plx * dy - dx * ply), tX = inv * (dy * sx - dx * sy), tY = inv * (-ply * sx + plx * sy); if (tY <= 0.15 || tY > 9) continue;
      const scx = (RW / 2) * (1 + tX / tY), hw = (w / N) * (RH / tY) / 2; let a = 1e9, b2 = -1e9;
      for (let x = Math.max(0, Math.floor(scx - hw)); x < Math.min(RW, Math.ceil(scx + hw)); x++) if (tY < zb[x]) { a = Math.min(a, x); b2 = Math.max(b2, x + 1); }
      if (b2 > a) s.props.push({ n, w: w / N, x: scx / RW, z: tY, a: a / RW, b: b2 / RW, k: Math.min(1, lit(tY) * 1.2 * lightCol[Math.max(0, Math.min(RW - 1, Math.round(scx)))]) }); }
    s.props.sort((p1, p2) => p2.z - p1.z);
    const BB = [[s.goal, tx.pipe[Math.floor(s.t * 3) % 2]], ...(art ? [] : (s.traps || []).map(q => [q, tx.trap]))].map(([o, P]) => { const sx = o.c + 0.5 - px, sy = o.r + 0.5 - py; return { o, P, d: sx * sx + sy * sy }; }).sort((a, b2) => b2.d - a.d);
    for (const { o, P: PP } of BB) { const sx = o.c + 0.5 - px, sy = o.r + 0.5 - py, inv = 1 / (plx * dy - dx * ply), tX = inv * (dy * sx - dx * sy), tY = inv * (-ply * sx + plx * sy);
      if (tY > 0.1) { const scx = (RW / 2) * (1 + tX / tY), sh = Math.abs(RH / tY), x0 = Math.floor(scx - sh / 2), y0 = Math.floor(half - sh / 2), P = PP, k = lit(tY) * 1.2 + (PP === tx.hobo[0] || PP === tx.hobo[1] ? 0.4 : 0);
        for (let x = Math.max(0, x0); x < Math.min(RW, x0 + sh); x++) { if (tY >= zb[x]) continue; const u = Math.min(N - 1, ((x - x0) * N / sh) | 0);
          for (let y = Math.max(0, y0); y < Math.min(RH, y0 + sh); y++) { const c = P[Math.min(N - 1, ((y - y0) * N / sh) | 0) * N + u]; if (c) buf[y * RW + x] = shade(c, Math.min(1, k * lightCol[x])); } } } }
    s.carlScr = null;   /* Carl is drawn from his own sprite on top of the view, hidden behind any wall that's closer */
    for (const cl of s.carls) { const sx = cl.c + 0.5 - px, sy = cl.r + 0.5 - py, inv = 1 / (plx * dy - dx * ply), tX = inv * (dy * sx - dx * sy), tY = inv * (-ply * sx + plx * sy);
      if (tY > 0.2 && tY < 9) { const scx = (RW / 2) * (1 + tX / tY), col = Math.max(0, Math.min(RW - 1, Math.round(scx))); if (tY < zb[col] + 0.05 && (!s.carlScr || 1 / tY > s.carlScr.h)) s.carlScr = { x: scx / RW, h: 1 / tY, k: Math.min(1, lit(tY) * 1.6) }; } }
    s.cx.putImageData(s.img, 0, 0);
  },
  // Might & Magic style: the 3D view sits in a carved frame, with a side panel, the hero's portrait and a message scroll
  frame() {
    const st = (x, y, w, h) => { R(x, y, w, h, '#3b2f22'); for (let k = 0; k < 40; k++) R(x + (k * 53 % w), y + (k * 29 % h), 3, 2, k % 2 ? '#463829' : '#30261b'); };
    const bevel = (x, y, w, h) => { R(x - 3, y - 3, w + 6, h + 6, '#c9a24a'); R(x - 2, y - 2, w + 4, h + 4, '#5a4420'); R(x - 1, y - 1, w + 2, h + 2, '#e8c86a'); R(x, y, w, h, '#0a0806');
      for (const [cx, cy] of [[x - 3, y - 3], [x + w + 1, y - 3], [x - 3, y + h + 1], [x + w + 1, y + h + 1]]) { R(cx - 1, cy - 1, 4, 4, '#e8c86a'); R(cx, cy, 2, 2, '#7a5a20'); } };
    st(0, 0, W, H); return bevel;
  },
  draw(s) {
    this.render(s);
    const bevel = this.frame(), VX = 10, VY = 10, VW = 316, VH = 178, b = s.battle, t = s.t;
    bevel(VX, VY, VW, VH);
    const sh = s.shake > 0 ? (Math.random() - 0.5) * 6 * s.shake * 3 : 0;
    g.save(); g.beginPath(); g.rect(VX, VY, VW, VH); g.clip();
    g.imageSmoothingEnabled = false; g.drawImage(s.cv, VX + sh, VY, VW, VH);
    for (const P of s.props || []) { const im = MG(P.n); if (!im) continue; const sz = VH / P.z, w = P.w * sz, h = w * im.height / im.width, cx = VX + sh + P.x * VW, fy = VY + VH / 2 + sz / 2;
      g.save(); g.beginPath(); g.rect(VX + sh + P.a * VW, VY, (P.b - P.a) * VW, VH); g.clip(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.filter = `brightness(${Math.max(0.08, P.k).toFixed(2)})`;
      g.drawImage(im, cx - w / 2, fy - h, w, h); g.restore(); }
    if (s.carlScr && MG('ut_carl') && !(b && b.open <= 0)) { const C2 = s.carlScr, im = MG('ut_carl'), cw = im.width / 4, h = VH * C2.h * 0.82, w = h * cw / im.height, fx = VX + sh + C2.x * VW, fy = VY + VH / 2 + VH * C2.h / 2;
      const S2 = s.shop, f = S2 && S2.buyT > 0 ? 3 : S2 && S2.t < 1.6 ? 2 : Math.floor(t * 2.2) % 2;   /* candle flicker · talking · handing it over */
      g.save(); g.filter = `brightness(${C2.k.toFixed(2)})`; g.imageSmoothingEnabled = false; g.drawImage(im, f * cw, 0, cw, im.height, fx - w / 2, fy - h, w, h); g.restore(); }
    if (b && b.open <= 0) {   // the rats stand right there in the corridor, like the old games
      const cx = VX + VW / 2, by = VY + VH - 14 + Math.sin(t * 3) * 1.5, blinkOff = b.blink > 0 && Math.floor(t * 20) % 2;
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(cx, by + 2, 70 * b.F.sc, 9, 0, 0, 7); g.fill();
      if (!blinkOff && (b.hp > 0 || b.q.length || b.pose === 7)) {
        const idle = [0, 0, 1, 0, 2][Math.floor(t / 0.6) % 5], f = b.pose != null ? b.pose : idle, ox = b.out ? b.out * 420 : 0, a = b.out ? Math.max(0, 1 - b.out * 1.5) : 1, h = 120 * b.F.sc;
        if (!TRL.UTS(b.F.spr, f, cx + ox, by, h, false, a)) R(cx - 30, by - 30, 60, 30, '#6a5a4c');
        if (b.guards > 0) { b.gIn = Math.min(1, (b.gIn || 1) + 0.03); for (let k2 = 0; k2 < b.guards; k2++) { const side = k2 ? 1 : -1, gx = cx + side * (34 + (1 - b.gIn) * 140); g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(gx, by + 14, 34, 6, 0, 0, 7); g.fill();
          TRL.UTS('ut_rat', [0, 2, 5][Math.floor(t * 3 + k2) % 3], gx, by + 16, 74, side < 0, 1); } }
        if (b.F.princess && !MG('ut_princess') && b.pose !== 7 && !b.out) { const tx2 = cx + ox + h * 0.32, ty2 = by - h * (f === 4 ? 0.98 : 0.66); g.fillStyle = '#f7d44a'; g.beginPath(); g.moveTo(tx2 - 9, ty2 + 5); g.lineTo(tx2 - 9, ty2 - 2); g.lineTo(tx2 - 4, ty2 + 2); g.lineTo(tx2, ty2 - 6); g.lineTo(tx2 + 4, ty2 + 2); g.lineTo(tx2 + 9, ty2 - 2); g.lineTo(tx2 + 9, ty2 + 5); g.fill(); C(tx2, ty2 - 6, 1.6, '#ff8ad0'); }   /* her tiara */
        if (b.F.gary && b.pose !== 7 && !b.out) { const vx2 = cx + ox - h * 0.02, vy2 = by - h * (f === 4 ? 0.55 : 0.38); R(vx2 - 12, vy2 - 8, 24, 14, '#3a5a8a'); R(vx2 - 1, vy2 - 8, 2, 14, '#e8dcc0'); C(vx2 + 5, vy2 - 2, 1.2, '#f7d44a'); C(vx2 + 5, vy2 + 2, 1.2, '#f7d44a'); }   /* Gary's tiny vest */
        if (b.stun > 0) for (let i = 0; i < 3; i++) { const a = t * 4 + i * 2.1; T('*', cx + Math.cos(a) * 30, by - 70 + Math.sin(a) * 6, '#f7c418', 8, 'center'); }
      }
      if (b.dmgT > 0) T('-' + b.dmg, cx + 50, VY + 60 - (0.7 - b.dmgT) * 30, '#fff', 14, 'center');
      // the monster's name plate along the top of the view
      R(cx - 70, VY + 4, 140, 22, 'rgba(10,8,6,.8)'); T(b.F.name, cx, VY + 12, b.F.king ? '#f7c418' : '#fff', 7, 'center'); BAR(cx - 50, VY + 19, 100, 4, b.hp / b.max, '#e9665a');
    }
    if (!s.wed && !s.wake && !s.bag && !s.talk && !s.shop && !(s.fixT >= 3.4)) TRL.hands(s, VX, VY, VW, VH, t);
    if (b && b.open > 0) { const k = b.open / 0.6; for (let i = 0; i < 9; i++) R(VX, VY + i * 20, VW * (1 - k), 20, '#000'); }   // the screen wipe into the fight
    if (s.flash > 0) { g.fillStyle = `rgba(255,250,220,${s.flash})`; g.fillRect(VX, VY, VW, VH); }
    if (s.wake) { const [who, , line] = s.wake.lines[s.wake.i]; R(VX, VY, VW, VH, 'rgba(20,12,6,.55)');
      if (MG('ut_carl')) { const im = MG('ut_carl'), cw = im.width / 4, h = VH * 1.25, w = h * cw / im.height; g.save(); g.imageSmoothingEnabled = false; g.drawImage(im, (who === 'CARL' ? 2 : 0) * cw, 0, cw, im.height, VX + VW / 2 - w / 2 + Math.sin(t * 1.5) * 3, VY + VH * 0.15, w, h); g.restore(); }   /* right up in your face */
      g.fillStyle = `rgba(255,190,120,${0.12 + 0.05 * Math.sin(t * 7)})`; g.fillRect(VX, VY, VW, VH);
      { const L2 = WRAP(line, 0, null, VW - 32, '#fff', 6, 10); R(VX + 8, VY + 6, VW - 16, 20 + L2.length * 10, 'rgba(10,8,6,.88)'); if (!who) WRAP(line, VX + VW / 2, VY + 18, VW - 32, '#e8c86a', 6, 10, 0, 'center'); else { T(who + ':', VX + 14, VY + 14, '#e8c86a', 6); WRAP(line, VX + 14, VY + 26, VW - 32, '#fff', 6, 10); } } }
    if (s.wed) { const W2 = s.wed, [who, line] = W2.lines[W2.i], k = W2.i;
      if (MG('ut_wed_bg')) { g.save(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(MG('ut_wed_bg'), VX, VY, VW, VH); g.fillStyle = `rgba(255,170,80,${0.04 + 0.03 * Math.sin(t * 7)})`; g.fillRect(VX, VY, VW, VH); g.restore(); }   /* the crawlspace chapel, candles flickering */
      else { const grd = g.createLinearGradient(0, VY, 0, VY + VH); grd.addColorStop(0, '#2a1a12'); grd.addColorStop(1, '#5a3a22'); g.fillStyle = grd; g.fillRect(VX, VY, VW, VH);
      for (let i = 0; i < 6; i++) { const fx = VX + 20 + i * 56; R(fx, VY + 52, 3, 12, '#e8dcc0'); C(fx + 1.5, VY + 49 + Math.sin(t * 9 + i) * 1, 2.5, '#ffd27a'); } }   /* candles on the dirt wall */
      const crown = (x, y, sz) => { g.fillStyle = '#f7d44a'; g.beginPath(); g.moveTo(x - sz, y + sz * 0.6); g.lineTo(x - sz, y - sz * 0.2); g.lineTo(x - sz * 0.45, y + sz * 0.25); g.lineTo(x, y - sz * 0.7); g.lineTo(x + sz * 0.45, y + sz * 0.25); g.lineTo(x + sz, y - sz * 0.2); g.lineTo(x + sz, y + sz * 0.6); g.fill(); C(x, y - sz * 0.7, sz * 0.18, '#ff8ad0'); };
      const dead = k >= 13 && k <= 13, sad = k >= 16, base = VY + VH - 18;
      if (MG('ut_royals')) { const kf = dead ? 3 : k >= 14 ? 2 : [1, 3, 6, 9, 11].includes(k) ? 1 : 0, qf = dead ? 7 : k >= 15 ? 6 : [2, 5, 14].includes(k) ? 5 : 4;
        TRL.UTS('ut_royals', kf, VX + 62, base, 84, false); TRL.UTS('ut_royals', qf, VX + VW - 62, base, 78, true); }   /* the King (scepter, cape) and the Queen (pearls, lace) */
      else { TRL.UTS('ut_possum', dead ? 7 : 0, VX + 60, base, 70, false); crown(VX + 78, base - 50, 9); TRL.UTS('ut_possum', dead ? 7 : 0, VX + VW - 60, base, 66, true); crown(VX + VW - 78, base - 47, 6); }
      if (MG('ut_princess')) TRL.UTS('ut_princess', sad ? 7 : k === 5 || k === 6 ? 6 : k >= 9 && k <= 12 ? 3 : k >= 13 && k <= 14 ? (Math.floor(t * 3) % 2 ? 4 : 5) : Math.floor(t * 1.2) % 3 === 0 ? 1 : 0, VX + VW / 2, base + 4, 92, false);
      else { TRL.UTS('ut_possum', sad ? 7 : k >= 9 && k <= 12 ? 4 : 0, VX + VW / 2, base + 4, 82, false); crown(VX + VW / 2 + 26, base - (k >= 9 && k <= 12 ? 78 : 55), 7); }   /* the Princess */
      if (k >= 9 && k <= 12) { g.globalAlpha = 0.5; g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(VX + VW / 2 + 4, base - 84); g.lineTo(VX + VW / 2 - 30, base - 20); g.lineTo(VX + VW / 2 + 24, base - 30); g.fill(); g.globalAlpha = 1; }   /* her veil */
      if (k >= 13 && k <= 14) for (let i = 0; i < 8; i++) T('♥', VX + 30 + (i * 41 + t * 30) % (VW - 40), VY + 60 + Math.sin(t * 2 + i) * 20, '#ff8ad0', 8, 'center');
      { const L2 = WRAP(line, 0, null, VW - 32, '#fff', 6, 10); R(VX + 8, VY + 6, VW - 16, (who ? 20 : 10) + L2.length * 10, 'rgba(10,8,6,.85)');
        if (!who) WRAP(line, VX + VW / 2, VY + 16, VW - 32, '#e8c86a', 6, 10, 0, 'center'); else { T(who + ':', VX + 14, VY + 14, '#e8c86a', 6); WRAP(line, VX + 14, VY + 26, VW - 32, '#fff', 6, 10); } }
    }
    if (s.bag) { R(VX, VY, VW, VH, 'rgba(10,8,6,.93)'); T('THE BAG', VX + 10, VY + 10, '#e8c86a', 8);
      const st = [['LEVEL', s.lvl], ['XP', `${s.xp} / ${s.lvl * 60}`], ['HP', `${Math.max(0, s.hp)} / ${s.hpMax}`], ['ATTACK', `${s.dmg[0] + s.atkB + s.lvl - 1}-${s.dmg[1] + s.atkB + s.lvl - 1}`], ['DEFENSE', s.def], ['CRACKERS', s.crk], ['FLASHLIGHTS', s.lights], ['TIME RESTED', `${s.restMin} MIN`]];
      st.forEach(([k, v], i) => { T(k, VX + 12, VY + 30 + i * 14, '#9fb3d9', 6); T(String(v), VX + 150, VY + 30 + i * 14, '#fff', 6, 'right'); });
      const GN = { pipewrench: 'PIPE WRENCH', lid: 'TRASH CAN LID', crown: 'POSSUM CROWN', pads: 'KNEE PADS', hat: 'HARD HAT', waders: 'CHEST WADERS', wrench: 'BIGGER WRENCH', cutter: 'PIPE CUTTER' }; { const wt = 'WEARING: ' + (s.gear.length ? s.gear.map(q => GN[q]).join(', ') : 'NOTHING SPECIAL'), L2 = WRAP(wt, 0, null, VW - 24, '#c9a46a', 5, 8); WRAP(wt, VX + 12, VY + VH - 6 - L2.length * 8, VW - 24, '#c9a46a', 5, 8); }
      this.bagList(s).forEach((o, i) => { const [x, y, w, h] = this.bagBox(i), on = i === s.bag.sel; R(x, y, w, h, on ? '#5a4420' : '#241c13'); R(x, y, w, 1, '#8a6a30'); T(o.label, x + 6, y + h / 2 + 1, o.off ? '#5a5048' : on ? '#f7c418' : '#e8dcc0', 6); if (on) T('▶', x - 1, y + h / 2 + 1, '#f7c418', 6, 'right'); }); }
    if (s.battle && s.battle.talk && s.battle.open <= 0) { const K = s.battle.talk, line = K.L[Math.min(K.i, K.L.length - 1)], L2 = WRAP(line, 0, null, VW - 48, '#fff', 8, 13), bh = 26 + L2.length * 13, last = K.i === K.L.length - 1;   /* THE RAT KING speaks */
      g.fillStyle = `rgba(90,0,0,${0.18 + 0.1 * Math.sin(s.t * 4)})`; g.fillRect(VX, VY, VW, VH);
      R(VX + 10, VY + 8, VW - 20, bh, 'rgba(12,4,4,.92)'); R(VX + 10, VY + 8, VW - 20, 2, '#c0392b'); R(VX + 10, VY + 6 + bh, VW - 20, 2, '#c0392b');
      T('THE RAT KING:', VX + 20, VY + 18, '#e9665a', 7); WRAP(line.slice(0, Math.floor(K.t * 45)), VX + 20, VY + 32, VW - 48, last ? '#ff8a7a' : '#fff', 8, 13);
      if (K.t > 0.4 && Math.floor(s.t * 3) % 2) T('▼', VX + VW - 20, VY + bh, '#e9665a', 6, 'right'); }
    if (s.songU && (s.songU.t += 1 / 60) < 5) { const k = Math.min(1, s.songU.t * 3, (5 - s.songU.t) * 2); g.save(); g.globalAlpha = k; R(VX + 30, VY + VH - 62, VW - 60, 40, 'rgba(10,8,6,.92)'); R(VX + 30, VY + VH - 62, VW - 60, 2, '#f7c418'); R(VX + 30, VY + VH - 24, VW - 60, 2, '#f7c418');
      T('♪ UNDER THE TRAILER HAS UNLOCKED', VX + VW / 2, VY + VH - 49, '#f7c418', 7, 'center'); T('in your MUSIC playlist', VX + VW / 2, VY + VH - 35, '#fff', 6, 'center'); g.restore(); }
    if (s.lvlUp) { const L = s.lvlUp, a = Math.min(1, L.t * 4, (3.2 - L.t) * 2), sc = 1 + Math.max(0, 0.25 - L.t) * 2;   /* LEVEL UP! pops up over the view */
      g.save(); g.globalAlpha = a; R(VX + 50, VY + 40, VW - 100, 70, 'rgba(10,8,6,.9)'); R(VX + 50, VY + 40, VW - 100, 2, '#f7c418'); R(VX + 50, VY + 108, VW - 100, 2, '#f7c418');
      for (let i = 0; i < 10; i++) { const an = i / 10 * 6.28 + L.t * 2, rr = 70 + L.t * 30; T('✦', VX + VW / 2 + Math.cos(an) * rr, VY + 75 + Math.sin(an) * rr * 0.45, '#f7c418', 6, 'center'); }
      g.translate(VX + VW / 2, VY + 62); g.scale(sc, sc); T('LEVEL UP!', 0, 0, '#f7c418', 12, 'center'); g.setTransform(3, 0, 0, 3, 0, 0);
      T(`LEVEL ${L.lvl}  ·  MAX HP +5  ·  HITS HARDER`, VX + VW / 2, VY + 88, '#e8dcc0', 5, 'center'); T('HEALED SOME, TOO', VX + VW / 2, VY + 99, '#7bd65b', 5, 'center'); g.restore(); }
    if (s.fixT && s.fixT < 3.4) { R(VX + 20, VY + 70, VW - 40, 40, 'rgba(10,8,6,.85)'); T(s.fixT < 1.2 ? 'THERE IT IS. THE DRIP.' : s.fixT < 2.2 ? 'FERNCO ON...' : 'CLAMPS TIGHT. DONE!', VX + VW / 2, VY + 90, '#7bd65b', 9, 'center'); }
    if (s.talk) { const K = s.talk, [who, line] = K.lines[Math.min(K.i, K.lines.length - 1)];
      const sky = g.createLinearGradient(0, VY, 0, VY + VH); sky.addColorStop(0, '#8fc4ef'); sky.addColorStop(1, '#d8ecf8'); g.fillStyle = sky; g.fillRect(VX, VY, VW, VH); if (!BGI('bg_lawn')) R(VX, VY + VH * 0.62, VW, VH * 0.38, '#5f9a3e');
      if (!who) { R(VX, VY, VW, VH, 'rgba(0,0,0,.85)'); const L2 = WRAP(line, 0, null, VW - 40, '#e8c86a', 8, 13); WRAP(line, VX + VW / 2, VY + VH / 2 - (L2.length - 1) * 6.5, VW - 40, '#e8c86a', 8, 13, 0, 'center'); }
      else { const L2 = WRAP(line, 0, null, VW - 52, '#fff', 6, 10), bh = 26 + L2.length * 10; R(VX + 12, VY + VH - 10 - bh, VW - 24, bh, 'rgba(10,8,6,.88)'); T(who + ':', VX + 22, VY + VH - bh + 2, '#e8c86a', 7); WRAP(line, VX + 22, VY + VH - bh + 14, VW - 52, '#fff', 6, 10); if (K.t > 0.4 && Math.floor(t * 3) % 2) T('▼', VX + VW - 20, VY + VH - 16, '#e8c86a', 6); } }
    if (s.fixT >= 3.4) {   // crawled back out into daylight
      const k = Math.min(1, (s.fixT - 3.4) / 0.6), sky = g.createLinearGradient(0, VY, 0, VY + VH); sky.addColorStop(0, '#8fc4ef'); sky.addColorStop(1, '#d8ecf8'); g.globalAlpha = k; g.fillStyle = sky; g.fillRect(VX, VY, VW, VH);
      if (!BGI('bg_lawn')) { R(VX, VY + VH * 0.62, VW, VH * 0.38, '#5f9a3e'); } g.globalAlpha = 1;
      if (k >= 1 && s.fixT > 4.0) { const me = HERO(s).name, them = me === 'ROD' ? 'MATT' : 'ROD', pw = 190, ph = VH - 16, px = VX + (VW - pw) / 2, py = VY + 8, n = Math.min(s.epiI, s.epi.length - 1);   /* a text chain on your phone */
        R(px - 4, py - 4, pw + 8, ph + 8, '#111'); R(px, py, pw, ph, '#f2f2f6'); R(px, py, pw, 22, '#e2e2ea'); C(px + 14, py + 11, 7, them === 'ROD' ? '#2c6cd6' : '#d08a30'); T(them[0], px + 14, py + 11, '#fff', 6, 'center'); T(them === 'ROD' ? 'Rod' : 'Matt', px + 26, py + 11, '#111', 6);
        g.save(); g.beginPath(); g.rect(px, py + 23, pw, ph - 23); g.clip(); let y = py + ph - 6;
        for (let i = n; i >= 0 && y > py + 23; i--) { const [who, line] = s.epi[i], mine = who === me, txt = i === n ? line.slice(0, Math.floor(s.epiT * 60)) : line, L2 = WRAP(line, 0, null, pw * 0.66, '#111', 5, 8), bw = Math.max(...L2.map(l => (g.font = '5px "Press Start 2P", monospace', g.measureText(l).width))) + 12, bh = L2.length * 8 + 8, bx = mine ? px + pw - 6 - bw : px + 6;
          y -= bh; g.fillStyle = mine ? '#2f7cf6' : '#dcdce4'; g.beginPath(); g.roundRect(bx, y, bw, bh, 6); g.fill(); WRAP(txt, bx + 6, y + 7, pw * 0.66, mine ? '#fff' : '#111', 5, 8); y -= 5; }
        g.restore(); if (s.epiT > 0.4 && Math.floor(t * 3) % 2) T('▼', px + pw - 8, py + ph - 3, '#2f7cf6', 5, 'right'); } }
    g.restore();
    // side panel: title, map + compass up top; commands in a fight, stink otherwise
    const PX = 338, PW = 134, wedCh = s.wed && s.wed.lines[s.wed.i][2], fight = b && !s.bag;
    if (wedCh || s.shop || fight) {   /* the right side becomes whatever the scene needs: big buttons you can tap with a thumb */
      bevel(PX, 10, PW, 178);
      if (fight) { T(b.F.name, PX + PW / 2, 18, '#e8c86a', 5, 'center'); const live = b.open <= 0 && !b.q.length; this.opts(s).forEach((o, i, A) => this.tile(s, o, this.btnBox(i, A.length), i === b.sel && live, !live || o.off)); }
      else { const L = wedCh ? wedCh.map(q => ({ label: q })) : this.wares(s), sel = wedCh ? s.wed.sel : s.shop.sel;
        T(wedCh ? 'WHAT DO YOU SAY?' : "CARL'S STUFF", PX + PW / 2, 18, '#e8c86a', 5, 'center');
        L.forEach((o, i) => { const [x, y, w, h] = this.optBox(i, L.length), on = i === sel, priced = !!o.price;
          R(x, y, w, h, on ? '#5a4420' : '#241c13'); R(x, y, w, 1, on ? '#f7c418' : '#8a6a30'); R(x, y + h - 1, w, 1, '#120e09');
          const lw = w - 10 - (priced ? 30 : 0), L2 = WRAP(o.label, 0, null, lw, '#fff', 5, 8, 2); WRAP(o.label, x + 5, y + h / 2 + 1 - (L2.length - 1) * 4, lw, o.off ? '#5a5048' : on ? '#f7c418' : '#e8dcc0', 5, 8, 2);
          if (priced) T(o.price + ' CRK', x + w - 4, y + h / 2 + 1, s.crk >= o.price && !o.off ? '#7bd65b' : '#8a5a50', 5, 'right'); }); } }
    else {
      bevel(PX, 10, PW, 82);
    { const z = this.zone(s); const zi = s.band ? s.band(s.pc) : 0; T(['THE ENTRANCE', 'POSSUM COUNTRY', 'THE DEEP MUCK', "THE KING'S HALL"][zi], PX + PW / 2, 18, '#e8c86a', 6, 'center'); if (!s.battle) T('TAP MAP', PX + PW - 6, 87, '#7a6a50', 5, 'right'); T(`LV ${s.lvl}  ATK ${s.dmg[0] + s.atkB + s.lvl - 1}-${s.dmg[1] + s.atkB + s.lvl - 1}  DEF ${s.def}`, PX + PW / 2, 27, '#9fb3d9', 5, 'center'); }
    { const Z = 4, VWc = 29, VHc = 13, oc = Math.max(0, Math.min(s.C - VWc, Math.round(s.vx - VWc / 2))), orr = Math.max(0, Math.min(s.R - VHc, Math.round(s.vy - VHc / 2))), mw = Math.min(s.C, VWc) * Z, mh = Math.min(s.R, VHc) * Z, mx0 = PX + (PW - mw) / 2 - oc * Z, my0 = 35 - orr * Z;   // automap: a window around you, only where you've been
      R(PX + (PW - mw) / 2 - 1, 34, mw + 2, mh + 2, '#16110b'); g.save(); g.beginPath(); g.rect(PX + (PW - mw) / 2, 35, mw, mh); g.clip();
      for (const k of s.seen) { const c = k % 100, r = Math.floor(k / 100); R(mx0 + c * Z, my0 + r * Z, Z, Z, '#7a6a50');
        for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (s.map[r + ddy][c + ddx] !== '.') R(mx0 + (c + ddx) * Z, my0 + (r + ddy) * Z, Z, Z, '#3e3a34'); }
      for (const cl of s.carls) if (cl.met || s.seen.has(cl.r * 100 + cl.c)) R(mx0 + cl.c * Z, my0 + cl.r * Z, Z, Z, '#4aa83a');   /* Carl */
      { const L0 = PX + (PW - mw) / 2, T0 = 35, pulse = 1 + 0.15 * Math.sin(t * 6);   /* goals: always shown; if it's off this little window, a pointer on the edge shows which way */
        const mark = (c, r, glyph, col) => { let x = mx0 + c * Z + Z / 2, y = my0 + r * Z + Z / 2; const off = x < L0 + 4 || x > L0 + mw - 4 || y < T0 + 4 || y > T0 + mh - 4;
          if (off) { const cx2 = L0 + mw / 2, cy2 = T0 + mh / 2, a2 = Math.atan2(y - cy2, x - cx2); x = Math.max(L0 + 6, Math.min(L0 + mw - 6, x)); y = Math.max(T0 + 6, Math.min(T0 + mh - 6, y));
            g.fillStyle = col; g.beginPath(); g.moveTo(x + Math.cos(a2) * 5, y + Math.sin(a2) * 5); g.lineTo(x + Math.cos(a2 + 2.5) * 4, y + Math.sin(a2 + 2.5) * 4); g.lineTo(x + Math.cos(a2 - 2.5) * 4, y + Math.sin(a2 - 2.5) * 4); g.fill(); }
          else T(glyph, x, y, col, Math.round(9 * pulse), 'center'); };
        if (s.escort && s.kingdom) mark(s.kingdom.c, s.kingdom.r, '♛', '#f7d44a');   /* her kingdom */
        this.xs(s).forEach(q => mark(q.c, q.r, 'X', '#e9665a')); }   /* his napkin maps */
      if (s.scrib) { g.strokeStyle = '#8a5a2a'; g.lineWidth = 1; for (const st of s.scrib) { g.beginPath(); st.forEach(([x, y], i) => i ? g.lineTo(mx0 + x * Z, my0 + y * Z) : g.moveTo(mx0 + x * Z, my0 + y * Z)); g.stroke(); } }
      const cx = mx0 + s.vx * Z, cy = my0 + s.vy * Z, a = s.va; g.fillStyle = '#f7c418'; g.beginPath(); g.moveTo(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4); g.lineTo(cx + Math.cos(a + 2.4) * 3, cy + Math.sin(a + 2.4) * 3); g.lineTo(cx + Math.cos(a - 2.4) * 3, cy + Math.sin(a - 2.4) * 3); g.fill(); g.restore(); }
      bevel(PX, 100, PW, 88);
      const stink = 1 - s.gd[s.pr][s.pc] / Math.max(1, s.gmax);
      T('STINK', PX + 8, 110, '#c9a46a', 6); T('♥'.repeat(s.lives) + '♡'.repeat(Math.max(0, 3 - s.lives)), PX + PW - 8, 110, '#e9665a', 6, 'right'); BAR(PX + 8, 117, PW - 16, 6, stink, stink > 0.75 ? '#a0d040' : '#8a6a3a');
      const st = s.escort ? ['ESCORTING THE PRINCESS', '#ff8ad0'] : stink > 0.75 ? ['SMELLS CLOSE!', Math.floor(t * 3) % 2 ? '#a0d040' : '#6a8a30'] : s.married ? ['MARRIED (TO A POSSUM)', '#ff8ad0'] : null;
      if (st) T(st[0], PX + 8, 131, st[1], 5);
      T('LIGHT x' + s.lights, PX + 8, 146, '#e8dcc0', 5); T('CRACKERS x' + s.crk, PX + 8, 160, '#e8dcc0', 5); T('BEATEN: ' + s.won, PX + 8, 174, '#e8dcc0', 5);
      this.tile(s, { id: 'item', label: 'BAG' }, this.bagBtn(), !!s.bagQ || (s.bagPulse && Math.floor(t * 3) % 2 === 0), false);   /* blinks after the rest tip */   /* tap to open the bag */ }
    // bottom bar: the hero's portrait + health, and the message scroll
    bevel(10, 200, 56, 60);
    if (s.wake) { const [who, f] = s.wake.lines[s.wake.i], me = HERO(s).name.toLowerCase();
      R(10, 200, 56, 60, '#0a0806'); g.imageSmoothingEnabled = true;
      if (who === 'CARL' && MG('ut_carl_face')) g.drawImage(MG('ut_carl_face'), f * 96, 0, 96, 96, 10, 202, 56, 56);
      else { const im = TRL.faceN(me === 'rod' ? 'rod_gross' : 'matt_shocked') || TRL.face(me, 1); if (im) g.drawImage(im, 10, 200, 56, 60); }
      g.imageSmoothingEnabled = false; }
    else if (s.battle && s.battle.F.princess && s.battle.open <= 0 && MG('ut_princess_face')) { const b = s.battle, f = b.out ? 1 : b.pose === 7 ? 6 : b.pose === 6 ? 4 : b.pose === 4 ? 2 : b.hp < b.max / 2 ? 3 : 0;
      R(10, 200, 56, 60, '#0a0806'); g.imageSmoothingEnabled = true; g.drawImage(MG('ut_princess_face'), f * 96, 0, 96, 96, 10, 202, 56, 56); g.imageSmoothingEnabled = false; }
    else if (s.wed && s.wed.lines[s.wed.i][0] === 'THE PRINCESS' && MG('ut_princess_face')) { const f = s.wed.i >= 16 ? 6 : 7;   /* the bride */
      R(10, 200, 56, 60, '#0a0806'); g.imageSmoothingEnabled = true; g.drawImage(MG('ut_princess_face'), f * 96, 0, 96, 96, 10, 202, 56, 56); g.imageSmoothingEnabled = false; }
    else if (s.wed && /POSSUM (KING|QUEEN)/.test(s.wed.lines[s.wed.i][0]) && MG('ut_royal_face')) { const k = s.wed.i, king = s.wed.lines[k][0] === 'POSSUM KING', f = king ? ({ 1: 0, 3: 1, 6: 1, 9: 1, 11: 1 }[k] ?? 3) : ({ 2: 4, 5: 4, 14: 7 }[k] ?? 6);   /* the in-laws */
      R(10, 200, 56, 60, '#0a0806'); g.imageSmoothingEnabled = true; g.drawImage(MG('ut_royal_face'), f * 96, 0, 96, 96, 10, 202, 56, 56); g.imageSmoothingEnabled = false; }
    else if (s.shop && MG('ut_carl_face')) { const S = s.shop, tw = Math.floor(t / 3.1) % 3 === 2 && (t % 3.1) < 0.18, f = tw ? 7 : S.flip != null && S.t > 1.1 ? S.flip : S.face;
      R(10, 200, 56, 60, '#0a0806'); g.imageSmoothingEnabled = true; g.drawImage(MG('ut_carl_face'), f * 96, 0, 96, 96, 10, 202, 56, 56); g.imageSmoothingEnabled = false; }
    else { const H = HERO(s), sp = s.talk ? s.talk.lines[s.talk.i][0] : null, other = s.fixT > 6.2, im = TRL.face(sp ? sp.toLowerCase() : (H.name === 'ROD') !== other ? 'rod' : 'matt', sp || other ? 1 : s.hp / s.hpMax); if (im) { g.imageSmoothingEnabled = true; g.drawImage(im, 10, 200, 56, 60); g.imageSmoothingEnabled = false; } else R(10, 200, 56, 60, '#2a2a36');
      if (s.shake > 0.2) { g.fillStyle = 'rgba(233,102,90,.45)'; g.fillRect(10, 200, 56, 60); } }
    bevel(74, 200, 92, 60);
    T(s.wake && s.wake.lines[s.wake.i][0] === 'CARL' ? 'CARL' : s.wed && /POSSUM (KING|QUEEN)|THE PRINCESS/.test(s.wed.lines[s.wed.i][0]) ? s.wed.lines[s.wed.i][0].replace('POSSUM ', '').replace('THE ', '') : s.battle && s.battle.F.princess && MG('ut_princess_face') ? 'PRINCESS' : HERO(s).name, 80, 210, '#e8c86a', 7); T('HP', 80, 226, '#fff', 6); BAR(96, 222, 64, 7, s.hp / s.hpMax, s.hp / s.hpMax > 0.5 ? '#7bd65b' : s.hp / s.hpMax > 0.25 ? '#f7c418' : '#e9665a');
    T(`${Math.max(0, s.hp)} / ${s.hpMax}`, 160, 240, '#e8dcc0', 6, 'right'); T(s.venom > 0 ? 'ITCHY' : s.hp / s.hpMax > 0.5 ? 'GOOD' : s.hp / s.hpMax > 0.25 ? 'BITTEN' : 'BAD SHAPE', 80, 252, s.venom > 0 ? '#c080e0' : s.hp / s.hpMax > 0.5 ? '#7bd65b' : '#e9665a', 6);
    bevel(174, 200, 298, 60);
    { const log = s.log || (s.log = []);
      const MW = 280, scroll = (entries) => {   /* the newest messages, wrapped to the scroll, as many lines as fit */
        const lines = []; entries.forEach((e, k) => WRAP(e, 0, null, MW, '#fff', 6, 11).forEach(l => lines.push([l, k === entries.length - 1]))); lines.slice(-4).forEach(([l, last], i, A) => T(l, 180, 212 + (4 - A.length) * 11 + i * 11, last ? '#e8dcc0' : '#7a6a50', 6)); };
      if (s.shop) { T('CRAWLSPACE CARL:', 180, 210, '#e8c86a', 6); T('PB CRACKERS: ' + s.crk, 464, 210, '#7bd65b', 6, 'right'); WRAP(s.shop.say, 180, 222, MW, '#fff', 6, 10, 4); }
      else if (b && b.q.length) { const m = b.q[0], full = WRAP(m.text, 0, null, MW, '#fff', 6, 11), shown = m.text.slice(0, Math.floor(m.t * 60));   /* typed out, wrapped where the full line will wrap */
        let left = shown.length; full.slice(-4).forEach((l, i, A) => { const cut = l.slice(0, Math.max(0, left)); left -= l.length + 1; T(cut, 180, 214 + i * 11, '#fff', 6); });
        if (m.t > 0.4 && Math.floor(t * 3) % 2) T('▼', 464, 252, '#e8c86a', 6, 'right'); }
      else if (s.steps < 2 && !b) { T('▲ CRAWL   ▼ BACK   ◀ ▶ TURN', 180, 214, '#e8dcc0', 6); WRAP('Follow your nose. The STINK meter tells you when you are close.', 180, 230, MW, '#7a6a50', 6, 11); }
      else scroll(log.slice(-3)); }
    DRAWFX(s);
    if (s.big) this.drawBig(s, t);
  },

});
/* SAVE + RESUME for Under the Trailer: it's a long crawl, so your spot is kept if the phone locks or the page reloads */
(() => {
  const G = GAMES.find(q => q.id === 'crawl'), SKIP = new Set(['cv', 'cx', 'img', 'buf', 'zb', 'battle', 'talk', 'shop', 'bag', 'wake', 'wed', 'rnd', 'props', 'carlScr', 'end', 'ask', 'saveT', 'lvlUp', 'big', 'bagQ', 'epi', 'fixT', 'songU', 'fx', 'pops', 'parts']);
  const KEY = s => 'ddt_crawl_' + (new URLSearchParams(location.search).get('job') || 'arcade') + '_' + s.diff;
  const save = s => { try { const o = {}; for (const k in s) { if (SKIP.has(k) || typeof s[k] === 'function') continue; o[k] = s[k] instanceof Set ? { __set: [...s[k]] } : s[k]; } localStorage.setItem(KEY(s), JSON.stringify(o)); } catch (e) {} };
  const load = s => { try { const o = JSON.parse(localStorage.getItem(KEY(s)) || 'null'); return o && o.map ? o : null; } catch (e) { return null; } };
  const clear = s => { try { localStorage.removeItem(KEY(s)); } catch (e) {} };
  const init0 = G.init, upd0 = G.update, draw0 = G.draw;
  G.init = function (s) { init0.call(this, s); const o = load(s); if (o) { s.ask = { o, sel: 0 }; s.saveT = 0; } };
  G.update = function (s, dt, I) {
    if (s.ask) {   /* CONTINUE or START OVER */
      const A = s.ask; if (I.Up || I.Dp || I.Lp || I.Rp) { A.sel = 1 - A.sel; SFX('click'); }
      let go = I.Ap ? A.sel : null; if (I.ptr.clicked) [0, 1].forEach(k => { if (I.ptr.y > 120 + k * 34 && I.ptr.y < 148 + k * 34) go = k; });
      if (go === 0) { const o = A.o; for (const k in o) s[k] = o[k] && o[k].__set ? new Set(o[k].__set) : o[k]; s.mv = 0; (s.log = s.log || []).push('You crawl back in where you left off.'); SFX('ui_select'); s.ask = null; }
      else if (go === 1) { clear(s); SFX('ui_select'); s.ask = null; }
      return; }
    const r = upd0.call(this, s, dt, I);
    if (s.end) clear(s);
    else if ((s.saveT = (s.saveT || 0) + dt) > 3 && !s.battle && !s.talk && !s.shop && !s.bag && !s.wake && !s.wed && !s.fixT) { s.saveT = 0; save(s); }
    return r; };
  G.draw = function (s) {
    if (!s.ask) return draw0.call(this, s);
    R(0, 0, W, H, '#14100b'); const o = s.ask.o;
    T('UNDER THE TRAILER', W / 2, 52, '#e8c86a', 12, 'center'); T('You were in the middle of a crawl.', W / 2, 80, '#e8dcc0', 7, 'center');
    T(`LEVEL ${o.lvl}  ·  ${o.crk} CRACKERS  ·  LIVES ${o.lives}${o.kingDone ? '  ·  THE KING IS BEATEN' : ''}`, W / 2, 96, '#9fd1ff', 6, 'center');
    ['CONTINUE THE CRAWL', 'START OVER'].forEach((l, k) => { const on = s.ask.sel === k; R(W / 2 - 110, 120 + k * 34, 220, 28, on ? '#5a4420' : '#2a2018'); if (on) R(W / 2 - 110, 120 + k * 34, 220, 2, '#e8c86a'); T(l, W / 2, 129 + k * 34, on ? '#e8c86a' : '#e8dcc0', 8, 'center'); });
  };
})();

// =====================================================================
// PISS KITTY — something in this house pisses on everything and the old lady swears she has no cat.
// Sniff your way room to room. He moves. He leaves fresh puddles. When you find him... he stands up.
const PK = {
  ROOMS: [
    { name: 'KITCHEN', bg: 'bg_kitchen', spots: [['UNDER THE SINK', 118, 196], ['THE PANTRY', 250, 118], ['BEHIND THE FRIDGE', 404, 140], ['THE TRASH CAN', 330, 214]] },
    { name: 'BATHROOM', bg: 'bg_bath', spots: [['THE HAMPER', 62, 214], ['THE TUB', 132, 186], ['BEHIND THE TOILET', 252, 196], ['THE VANITY', 372, 188]] },
    { name: 'LAUNDRY', bg: 'bg_laundry', spots: [['THE SHELF', 214, 92], ['THE LAUNDRY PILE', 128, 214], ['BEHIND THE DRYER', 300, 168], ['THE UTILITY SINK', 404, 180]] },
    { name: 'BASEMENT', bg: 'bg_basement', spots: [['THE CRAWL HOLE', 62, 118], ['THE OLD COUCH', 116, 200], ['THE FLOOR DRAIN', 244, 228], ['THE FURNACE', 384, 160]] },
  ],
  NOPE: ['A puddle. On a slipper. Why a slipper.', 'Wet. Not water.', 'An old tuna can. Licked clean.', 'Nothing. Smells like... old lady perfume.', 'Somebody peed on the cereal box.', 'A tiny wet footprint. ...Just the back feet?', 'A dry trap. That is not it.', 'Rubber ducky. Damp. Do not ask.', 'A sock. Crunchy.', 'Forty years of potpourri.', 'A hairless... no. That is a chicken cutlet.', 'Cobwebs. And a faint yellow stain.'],
  FRESH: ['FRESH. Still warm. He was HERE.', 'Steaming. He JUST left.', 'Wet, warm, and somehow smug.'],
};
GAMES.push({
  id: 'kitty', name: 'PISS KITTY', tag: 'Track the smell · room by room · he moves',
  how: ["The old lady says it smells like piss. She does NOT have a cat. Find what's doing it.", 'Pick a room (◀ ▶), then SNIFF a spot (▲ ▼ to choose, or tap it). The STINK bar shows how strong it is in this room.', 'Every wrong sniff makes you gag. Gag out and you have to step outside.', 'Fresh, warm puddles mean he was JUST there. He moves when you get close. Corner him.'],
  dpad: true, ctl: '◀ ▶ ROOM · ▲ ▼ SPOT · SPACE = SNIFF', act: 'SNIFF', phone: 'tap a room tab, then tap a spot to sniff it.',
  init(s) {
    s.room = 0; s.sel = 0; s.gag = 0; s.GAG = [12, 10, 9][s.diff] * HERO(s).grip; s.sniffs = 0; s.moves = 0;
    s.cat = { r: 1 + Math.floor(s.rnd() * 3), p: Math.floor(s.rnd() * 4) }; s.fresh = null; s.sniffed = {}; s.msg = 'It smells like piss in here. Faint. Start sniffing.'; s.msgT = 99; s.found = 0; s.recog = false;
  },
  stink(s, r) { const d = Math.min(Math.abs(r - s.cat.r), 4 - Math.abs(r - s.cat.r)); return d === 0 ? 0.92 : d === 1 ? 0.5 : 0.18; },
  update(s, dt, I) {
    s.t += dt; FX(s, dt);
    if (s.found) { s.found += dt; if (s.found > 5.2) s.end = { win: true, stars: stars3(s.sniffs <= 6, s.sniffs <= 10), line: `Found PISS KITTY in ${s.sniffs} sniffs. He went out the dog door. Next house.` }; return; }
    const R0 = PK.ROOMS[s.room];
    if (I.Lp) { s.room = (s.room + 3) % 4; s.sel = 0; SFX('ui_tap'); } if (I.Rp) { s.room = (s.room + 1) % 4; s.sel = 0; SFX('ui_tap'); }
    if (I.Up) s.sel = (s.sel + 3) % 4; if (I.Dp) s.sel = (s.sel + 1) % 4;
    let pick = I.Ap ? s.sel : null;
    if (I.ptr.clicked) {
      for (let i = 0; i < 4; i++) { const x = 8 + i * 118; if (I.ptr.x > x && I.ptr.x < x + 112 && I.ptr.y > 18 && I.ptr.y < 34) { s.room = i; s.sel = 0; SFX('ui_tap'); return; } }
      R0.spots.forEach(([, x, y], i) => { if (Math.hypot(I.ptr.x - x, I.ptr.y - y) < 22) { s.sel = i; pick = i; } });
    }
    if (pick === null) return;
    const key = s.room * 10 + pick; s.sniffs++; s.msgT = 3;
    if (s.cat.r === s.room && s.cat.p === pick) { s.found = 0.01; SFX('ui_select'); return; }
    const fresh = s.fresh && s.fresh.r === s.room && s.fresh.p === pick;
    s.gag += fresh ? 0.5 : 1; s.shake = 0.15; SFX('click');
    s.msg = fresh ? PK.FRESH[Math.floor(s.rnd() * PK.FRESH.length)] : PK.NOPE[Math.floor(s.rnd() * PK.NOPE.length)];
    if (fresh && !s.recog) { s.recog = true; s.msg += "   ...Wait. I KNOW this smell."; }
    s.sniffed[key] = fresh ? 'fresh' : 'nope';
    // close in his room, or every few sniffs: he slips off to a spot next door, leaving a warm puddle where he was
    if ((s.room === s.cat.r && s.rnd() < 0.55) || (s.sniffs % 4 === 0 && s.rnd() < 0.5)) {
      s.fresh = { r: s.cat.r, p: s.cat.p }; delete s.sniffed[s.cat.r * 10 + s.cat.p]; s.moves++;
      const nr = s.rnd() < 0.5 ? s.cat.r : (s.cat.r + (s.rnd() < 0.5 ? 1 : 3)) % 4; let np; do np = Math.floor(s.rnd() * 4); while (nr === s.cat.r && np === s.cat.p);
      s.cat = { r: nr, p: np }; delete s.sniffed[nr * 10 + np]; POP(s, 240, 60, '*pitter patter*', '#c9a46a');
    }
    if (s.gag >= s.GAG) s.end = { win: false, stars: 0, line: "Gagged out. Had to step outside. Something in there is STILL peeing." };
  },
  drawCat(s, x, y, k) {   /* a hairless cat, standing up like a little man */
    if (MG('pk_0')) { const run = k > 3.6, f = run ? 1 + Math.floor(s.t * 11) % 5 : 0; return SPI('pk_' + f, x, y + 6, 1.15, false, Math.min(1, k * 2)); }   /* the drawn Piss Kitty: stands there, sprays, struts off */
    const up = Math.min(1, k * 2), skin = '#e6b7a6', dk = '#c48f80';
    g.save(); g.translate(x, y);
    g.fillStyle = skin; g.beginPath(); g.ellipse(0, -18 - up * 10, 11, 16 + up * 6, 0, 0, 7); g.fill();   // body
    R(-8, -6, 5, 8, skin); R(3, -6, 5, 8, skin); R(-10, 0, 8, 3, dk); R(2, 0, 8, 3, dk);   // hind legs, feet
    g.strokeStyle = dk; g.lineWidth = 3; g.beginPath(); g.moveTo(-10, -26 - up * 8); g.lineTo(-16, -14 - up * 10 + Math.sin(s.t * 6) * 3); g.moveTo(10, -26 - up * 8); g.lineTo(17, -34 - up * 6); g.stroke();   // arms: one on the hip, one waving
    const hy = -42 - up * 18; g.fillStyle = skin; g.beginPath(); g.ellipse(0, hy, 12, 10, 0, 0, 7); g.fill();   // head
    g.beginPath(); g.moveTo(-11, hy - 4); g.lineTo(-15, hy - 20); g.lineTo(-4, hy - 9); g.fill(); g.beginPath(); g.moveTo(11, hy - 4); g.lineTo(15, hy - 20); g.lineTo(4, hy - 9); g.fill();   // huge ears
    for (let i = 0; i < 3; i++) R(-6 + i * 4, hy - 7 + (i % 2), 3, 1, dk);   // forehead wrinkles
    C(-5, hy, 3.4, '#c8e05a'); C(5, hy, 3.4, '#c8e05a'); R(-5.5, hy - 2, 1, 4, '#111'); R(4.5, hy - 2, 1, 4, '#111');   // eyes
    R(-1, hy + 3, 2, 1, '#a0605a'); R(-3, hy + 5, 6, 1, dk);
    g.strokeStyle = skin; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -4); g.quadraticCurveTo(-18, 6, -22, -10 + Math.sin(s.t * 4) * 4); g.stroke();   // tail
    g.restore();
  },
  draw(s) {
    const R0 = PK.ROOMS[s.room];
    if (!BGI(R0.bg)) R(0, 0, W, H, '#3a3028');
    g.fillStyle = `rgba(200,190,60,${0.05 + this.stink(s, s.room) * 0.14})`; g.fillRect(0, 0, W, H);   // the air is visibly yellow
    HUD(s, 'PISS KITTY', null);
    PK.ROOMS.forEach((r, i) => { const x = 8 + i * 118; R(x, 18, 112, 16, i === s.room ? '#2c6cd6' : 'rgba(16,21,31,.85)'); T(r.name, x + 56, 26, '#fff', 6, 'center'); });
    // stink + gag
    const st = this.stink(s, s.room); R(W - 128, 40, 122, 30, 'rgba(16,21,31,.85)');
    T('STINK', W - 122, 48, '#c9b84a', 6); BAR(W - 84, 45, 72, 6, st, st > 0.8 ? '#d0d040' : '#a08a40');
    T('GAG', W - 122, 62, '#e9665a', 6); BAR(W - 84, 59, 72, 6, s.gag / s.GAG, '#e9665a');
    T(st > 0.8 ? 'EYES WATERING' : st > 0.4 ? 'STRONG' : 'FAINT', W - 10, 77, st > 0.8 ? '#d0d040' : '#9fb3d9', 5, 'right');
    // the spots
    R0.spots.forEach(([nm, x, y], i) => { const k = s.room * 10 + i, st2 = s.sniffed[k], on = i === s.sel, hot = s.fresh && s.fresh.r === s.room && s.fresh.p === i;
      if (hot) { g.fillStyle = 'rgba(230,210,60,.55)'; g.beginPath(); g.ellipse(x, y + 10, 16, 5, 0, 0, 7); g.fill(); for (let j = 0; j < 3; j++) R(x - 8 + j * 8, y + 2 - ((s.t * 20 + j * 7) % 14), 1, 4, 'rgba(255,255,255,.5)'); }   // steam off a fresh one
      C(x, y, on ? 15 : 12, st2 === 'nope' ? 'rgba(60,60,60,.7)' : on ? 'rgba(247,196,24,.85)' : 'rgba(16,21,31,.75)');
      T(st2 === 'nope' ? 'x' : '?', x, y + 1, st2 === 'nope' ? '#888' : on ? '#10151f' : '#f7c418', 9, 'center');
      if (on) { R(x - nm.length * 3 - 4, y - 28, nm.length * 6 + 8, 12, 'rgba(16,21,31,.9)'); T(nm, x, y - 22, '#fff', 6, 'center'); } });
    if (s.found) { const sp = R0.spots[s.cat.p], k = s.found;
      R(0, 0, W, H, `rgba(0,0,0,${Math.min(0.55, k * 0.4)})`);
      const run = Math.max(0, k - 3.6), cx = sp[1] + run * 260, cy = sp[2] + 20;
      this.drawCat(s, cx, cy, k);
      if (k > 1.8 && k < 3.6) { g.strokeStyle = '#e6d040'; g.lineWidth = 2; g.beginPath(); const rx = MG('pk_0') ? cx - 32 : cx + 2, ry = MG('pk_0') ? cy - 32 : cy - 14; g.moveTo(rx, ry); g.quadraticCurveTo(rx - 30, ry - 24, rx - 62, cy + 10); g.stroke(); T('PSSSSSHHHH', cx - 50, cy - 46, '#e6d040', 7, 'center'); }   // right on your boot
      T(k < 1.2 ? '...' : k < 1.8 ? 'PISS KITTY.' : k < 3.6 ? '' : 'AND HE IS GONE.', W / 2, 70, '#f7c418', 12, 'center'); }
    if (s.msg && s.msgT > 0) { R(10, H - 34, W - 20, 26, 'rgba(16,21,31,.9)'); T(s.msg, W / 2, H - 21, '#fff', 6, 'center'); }
    DRAWFX(s);
  },
});

// =====================================================================
// 16. LINE DETECTIVE — a whole house of plumbing. Run water at the fixtures, read what backs up and what's just slow, and name the pipe.
GAMES.push({
  id: 'detective', name: 'LINE DETECTIVE', tag: 'The hidden cesspool · the second inlet',
  how: ['Something in this house is blocked: it could be ANY pipe. The customer already told you one thing (shown in yellow).', 'Tap a fixture to run water there. Water runs down its own pipe, down the stack, along the main to the tank.', 'If it hits a full clog, it comes back up at the LOWEST opening above the clog. That might not be the fixture you ran!', 'SLOW = a partial clog (only big fixtures like toilets, tubs and the washer show it). The cleanout cap shows if the line below it is standing full.', 'Tests are limited. When you know, hit GUESS and tap the pipe. On hard jobs there are TWO problems: the clog and a slow spot.'],
  dpad: 'omni',
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
    const LV = { t2: 3, tub: 3.1, k: 2, sk: 2.1, w: 1, fd: 0 }; s.fix.forEach(f => f.lv = LV[f.id]); s.over = {}; s.note = {};
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
    const shows = s.fix.filter(f => f.id !== 'co' && this.result(s, f) !== 'drain');
    const tell = shows.length ? shows[Math.floor(s.rnd() * shows.length)] : s.fix[0];
    s.res[tell.id] = this.result(s, tell); s.told = tell.id;
  },
  // where does water from fixture f come out? Down its path until a full clog, then up out of the lowest opening that drains into the pipe above the clog
  spill(s, f) { if (!s.full || !f.path.includes(s.full)) return null; if (f.id === 'co') return f;
    const up = s.fix.filter(q => q.id !== 'co' && q.path.includes(s.full)); return up.reduce((a, b) => b.lv < a.lv ? b : a, f); },
  result(s, f) { const o = this.spill(s, f); if (o) return o === f ? 'back' : 'drain'; if (s.part && f.big && f.path.includes(s.part)) return 'slow'; return 'drain'; },
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
      { const o = this.spill(s, f); if (o && o !== f) { s.over[o.id] = 1; s.note[pick] = 'CAME UP AT ' + o.name; s.anim.over = o.id; SFX('gurgle', { vol: 0.5 }); } }   /* ran one fixture, water came up somewhere else */
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
    if (false && s.anim) { const f = s.fix.find(f => f.id === s.anim.id), res = s.res[f.id], pts = [];   // no water drawn in the pipes: you read the clog from the fixture results, not by watching where the water stops
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
      if (r) T(r === 'back' ? (f.id === 'co' ? 'STANDING FULL' : 'BACKS UP') : r === 'slow' ? 'SLOW' : f.id === 'co' ? 'DRY' : 'DRAINS', f.x, f.y + 6, r === 'back' ? '#c0392b' : r === 'slow' ? '#b07a10' : '#27ae60', 4, 'center', false);
      if (s.note[f.id]) T('...' + s.note[f.id], f.x, f.y + 17, '#c0392b', 4, 'center');
      if (s.over[f.id]) { const fl = s.anim && s.anim.over === f.id ? (Math.floor(s.t * 8) % 2 ? 1 : 0.5) : 1; g.globalAlpha = fl;   /* water spilling out over the rim */
        g.fillStyle = 'rgba(95,155,192,.85)'; g.beginPath(); g.ellipse(f.x, f.y + 18 + (s.note[f.id] ? 8 : 0), 30, 4, 0, 0, 7); g.fill(); R(f.x - 30, f.y - 14, 60, 4, '#5f9bc0'); T('WATER CAME UP!', f.x, f.y - 18, '#1f5f8a', 4, 'center'); g.globalAlpha = 1; }
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
  how: ['An army of clogs marches down the main line, step by step. The fewer left, the faster they march.', 'Slide the jetter nozzle with ◀ ▶ and press SPACE to blast. One blast in the pipe at a time.', 'Hide behind the green shields from the drips; shots and drips eat the shields away.', 'Clear them all before they reach the bottom. Blast the rubber duck up top for a bonus.'],
  ctl: '◀ ▶ = SLIDE  ·  SPACE = BLAST',
  act: 'BLAST', phone: 'drag to slide, tap BLAST to shoot.', dpad: 'omni',
  init(s) {
    s.px = 240; s.py = 246; s.pantsMax = s.pants = [5, 4, 4][s.diff] + (HERO(s).grip > 1 ? 1 : 0); /* Rod's strong stomach: one more drip */ s.inv = 0; s.hits = 0; s.shots = []; s.drips = []; s.cool = 0; s.score = 0;
    s.ROWS = [4, 5, 5][s.diff]; s.COLS = 10; s.foes = [];
    const kinds = ['towel', 'grease', 'grease', 'wipe', 'wipe'], pts = [30, 20, 20, 10, 10];
    for (let r = 0; r < s.ROWS; r++) for (let c = 0; c < s.COLS; c++) s.foes.push({ x: 98 + c * 30, y: 42 + r * 22, k: kinds[r], pts: pts[r], hp: 1, wob: 0 });
    s.N0 = s.foes.length; s.dir = 1; s.step = 0; s.stepT = 0; s.duck = null; s.nextDuck = 12; s.march = 0;
    // four shields, built from little chunks that get eaten away by shots and drips
    s.shield = []; for (let k = 0; k < 4; k++) { const x0 = 70 + k * 100; for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 9; xx++) { if (yy === 0 && (xx === 0 || xx === 8)) continue; if (yy >= 3 && xx >= 3 && xx <= 5) continue; s.shield.push({ x: x0 + xx * 4, y: 200 + yy * 4 }); } }
  },
  update(s, dt, I) {
    s.t += dt; FX(s, dt); s.inv -= dt; s.cool -= dt;
    mover1D(s, I, dt, 170 * HERO(s).spd, 30, W - 30);
    if ((I.A || I.Ap) && !s.shots.length && s.cool <= 0) { s.shots.push({ x: s.px, y: s.py - 16 }); s.cool = 0.35; SFX('bead_pop' + (1 + Math.floor(Math.random() * 5)), { vol: 0.22, rate: 0.9 }); }   // one blast in the pipe at a time, and a beat to reload
    for (const b of s.shots) b.y -= 240 * dt;
    // the march: the whole army steps together, tick... tick... and the fewer are left, the faster the steps come
    const left = s.foes.length; s.stepT -= dt;
    if (left && s.stepT <= 0) { s.stepT = (0.05 + 0.6 * left / s.N0) / [0.85, 1, 1.2][s.diff];
      let edge = s.foes.some(f => (s.dir > 0 && f.x > W - 30) || (s.dir < 0 && f.x < 30));
      if (edge) { s.dir *= -1; for (const f of s.foes) f.y += 10; } else for (const f of s.foes) f.x += s.dir * 6;
      s.step++; s.march = s.step; if (s.step % 2 === 0) SFX('click', { vol: 0.12, rate: [0.8, 0.7][(s.step / 2) % 2] }); }
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
        if (f.hp <= 0) { s.score += f.pts; SFX('bead_pop' + (1 + Math.floor(Math.random() * 5)), { vol: 0.4 }); if (s.rnd() < 0.25) POP(s, f.x, f.y, ['SPLOOSH', 'CLEAR', 'GONE'][Math.floor(s.rnd() * 3)]); } else SFX('clog', { vol: 0.15 });
        break;
      }
    }
    for (const b of s.shots) for (let i = s.shield.length - 1; i >= 0; i--) { const c = s.shield[i]; if (b.x > c.x - 3 && b.x < c.x + 5 && b.y > c.y - 4 && b.y < c.y + 6) { s.shield.splice(i, 1); b.y = -99; break; } }
    for (const d of s.drips) for (let i = s.shield.length - 1; i >= 0; i--) { const c = s.shield[i]; if (d.x > c.x - 3 && d.x < c.x + 5 && d.y > c.y - 2 && d.y < c.y + 6) { s.shield.splice(i, 1); if (i > 0 && s.rnd() < 0.5) s.shield.splice(i - 1, 1); d.y = 999; break; } }
    for (const f of s.foes) if (f.y > 190) s.shield = s.shield.filter(c => Math.abs(c.x - f.x) > 14 || Math.abs(c.y - f.y) > 10);   // they plow through the shields
    s.foes = s.foes.filter(f => f.hp > 0); s.shots = s.shots.filter(b => b.y > 10);
    for (const d of s.drips) if (s.inv <= 0 && Math.abs(d.x - s.px) < 9 && Math.abs(d.y - s.py) < 10) {
      d.y = 999; s.pants--; s.hits++; s.inv = 1.2; s.shake = 0.3; PUFF(s, s.px, s.py - 8, '#7a5a2e', 14, 70); POP(s, s.px, s.py - 24, 'DRIPPED ON', '#e9665a'); SFX('squish', { vol: 0.4 });
      if (s.pants <= 0) return (s.end = { win: false, stars: 0, line: 'Out of pants. The backup wins this round.' });
    }
    s.drips = s.drips.filter(d => d.y < H);
    if (s.foes.some(f => f.y > s.py - 18)) return (s.end = { win: false, stars: 0, line: 'It backed all the way up to the cleanout. Gross.' });
    if (!s.foes.length) { SFX('flush_big'); s.end = { win: true, stars: stars3(s.hits === 0, s.pants > 1), line: `Main line's clear! Score ${s.score + s.pants * 100}.` }; }
  },
  col(k) { return k === 'towel' ? '#e85a8e' : k === 'grease' ? '#2b2620' : '#e8e4d8'; },
  draw(s) {
    // inside the main: a long pipe, seen from the cleanout
    R(0, 0, W, H, '#2b2d30');   // flat dark gray, nothing moving behind the action
    if (s.duck) { const x = s.duck.x; R(x - 8, 22, 14, 9, '#f7c418'); R(x + 2, 17, 8, 8, '#f7c418'); R(x + 9, 20, 4, 3, '#e8822a'); R(x + 5, 19, 2, 2, '#000'); }
    for (const f of s.foes) {
      const x = f.x, y = f.y, fr = s.march % 2;   // two-step shuffle, in time with the march
      if (f.k === 'towel') { R(x - 10, y - 6, 20, 12, '#f1f3f5'); R(x - 10, y - 6, 20, 2, '#d9dde2'); R(x - 8, y - 2, 16, 1, '#8fb8e8'); R(x - 8, y + 2, 16, 1, '#8fb8e8'); R(x - 5, y - 4, 3, 2, '#222'); R(x + 2, y - 4, 3, 2, '#222'); R(x - 8 + (fr ? 0 : 12), y + 6, 4, 3, '#c9cdd2'); R(x + 4 - (fr ? 0 : 12), y + 6, 4, 3, '#c9cdd2'); }   // paper towel: white, blue print, little eyes and feet
      else if (f.k === 'grease' && SPC('grease', x, y, 0.5 + fr * 0.04)) {}
      else if (f.k !== 'grease' && SPC('tp', x, y, 0.5 + fr * 0.04)) {}
      else if (f.k === 'grease') { C(x, y, 9, '#2b2620'); C(x - 3, y - 3, 3, '#5a5040'); R(x - 9 + fr * 2, y + 6, 4, 4, '#2b2620'); R(x + 5 - fr * 2, y + 6, 4, 4, '#2b2620'); R(x - 4, y - 1, 2, 2, '#f7c418'); R(x + 2, y - 1, 2, 2, '#f7c418'); }
      else { R(x - 9, y - 7, 18, 14, '#e8e4d8'); R(x - 9, y - 7, 18, 3, '#d0ccc0'); R(x - 9 + fr * 14, y + 7, 4, 3, '#e8e4d8'); R(x - 4, y - 1, 2, 2, '#333'); R(x + 2, y - 1, 2, 2, '#333'); }
    }
    for (const c of s.shield) R(c.x, c.y, 4, 4, '#5fb848');
    for (const d of s.drips) { if (SPC('glob_2', d.x, d.y, 0.32)) continue; R(d.x - 2, d.y - 4, 4, 6, '#7a5a2e'); R(d.x - 1, d.y - 7, 2, 3, '#7a5a2e'); }
    for (const b of s.shots) { R(b.x - 2, b.y - 8, 4, 12, '#9fd3ff'); R(b.x - 1, b.y + 4, 2, 6, '#5fa8e0'); }
    // the nozzle + the hero behind it
    // the jetter nozzle on the end of its hose: no crew member, just the hose snaking off the bottom of the screen
    if (s.inv <= 0 || Math.floor(s.t * 10) % 2) {
      g.strokeStyle = '#1b1b1b'; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(s.px, s.py + 6);
      g.bezierCurveTo(s.px, s.py + 22, s.px * 0.5 + 120, H - 6, 240, H + 12); g.stroke();
      g.strokeStyle = '#3a3a3a'; g.lineWidth = 2; g.beginPath(); g.moveTo(s.px - 2, s.py + 6); g.bezierCurveTo(s.px - 2, s.py + 22, s.px * 0.5 + 118, H - 8, 238, H + 12); g.stroke();
      R(s.px - 5, s.py - 2, 10, 9, '#8a8f96'); R(s.px - 4, s.py - 1, 3, 7, '#c4c9cf');            // brass-and-steel fitting
      R(s.px - 3, s.py - 14, 6, 13, '#b9bec5'); R(s.px - 2, s.py - 13, 2, 11, '#e2e6ea');          // the nozzle
      R(s.px - 4, s.py - 16, 8, 3, '#d4a632');                                                  // its brass tip
      if (s.cool > 0.2) for (let i = 0; i < 3; i++) C(s.px + (i - 1) * 3, s.py - 18 - i, 1.5, '#cfe9ff'); }   // a little spray after each blast
    DRAWFX(s); HUD(s, 'PIPE INVADERS', null); PANTS(s, 6, 20); T(`LEFT ${s.foes.length}`, W - 8, 24, '#fff', 6, 'right');
  },
});

// =====================================================================
// 18. POOP SWEEPER — minesweeper-lite. Cross the yard to the septic lid without stepping in it.
GAMES.push({
  id: 'poop', name: 'POOP SWEEPER', tag: 'The yard where three dogs live',
  how: ['Walk from the gate to the septic lid without stepping in dog poop.', 'Tap a square next to one you have uncovered to step there.', 'Numbers = how many poops touch that square (diagonals count).', 'Tap FLAG to mark poop you have figured out. You have spare boots.'],
  dpad: 'omni',
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
        if (n && !(c === s.pos.c && r === s.pos.r)) T(String(n), x + s.Z / 2 + 1, y + s.Z / 2 + 1, ['', '#2e6fd6', '#2e8a3a', '#d6352e', '#6a2ea0', '#8a3a10'][Math.min(5, n)], 9, 'center'); }
      else { R(x, y, s.Z, s.Z, (c + r) % 2 ? '#4e7d36' : '#558a3b'); R(x + 6, y + 8, 2, 4, '#6fa04f'); R(x + 18, y + 16, 2, 4, '#6fa04f');
        if (this.reachable(s, c, r) && !s.end) { g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1; g.strokeRect(x + 1.5, y + 1.5, s.Z - 3, s.Z - 3); } }
      if ((s.stepped.has(k) || (s.end && s.poop.has(k))) && SPI(s.stepped.has(k) ? 'poop' : 'poopcorn', x + 15, y + 26, 0.8)) {} else if (s.stepped.has(k) || (s.end && s.poop.has(k))) { C(x + 15, y + 19, 7, '#5a3a1c'); C(x + 15, y + 14, 5, '#6b4423'); C(x + 15, y + 10, 3, '#7a4a1e'); }
      if (s.flag.has(k)) { R(x + 13, y + 6, 2, 18, '#333'); g.fillStyle = '#e9665a'; g.beginPath(); g.moveTo(x + 15, y + 6); g.lineTo(x + 24, y + 10); g.lineTo(x + 15, y + 14); g.fill(); }
    }
    { const f = Math.floor(s.t * 3) % 2; SPI('dog_' + f, 452, 70, 0.8, true); SPI('lab_' + (1 - f), 450, 130, 0.8, true); SPI('dog_' + (1 - f), 452, 190, 0.8, true); }
    const gx = s.ox + s.goal.c * s.Z, gy = s.oy + s.goal.r * s.Z; if (!SPC('septiclid', gx + 15, gy + 15, 0.5)) C(gx + 15, gy + 15, 11, '#8a8f94'); C(gx + 15, gy + 15, 8, '#a0a5aa'); T('LID', gx + 15, gy + 15, '#333', 5, 'center');
    g.strokeStyle = '#f7c418'; g.lineWidth = 2; g.strokeRect(s.ox + s.cur.c * s.Z + 1, s.oy + s.cur.r * s.Z + 1, s.Z - 2, s.Z - 2);
    HERO_AT(s, s.ox + s.pos.c * s.Z + 15, s.oy + s.pos.r * s.Z + 30, 1.15, { face: 'D' });
    { const n = s.open.has(s.pos.c + ',' + s.pos.r) ? this.count(s, s.pos.c, s.pos.r) : 0;   // the number under your boots, tucked in the corner so you can still read it
      if (n) { const x = s.ox + s.pos.c * s.Z, y = s.oy + s.pos.r * s.Z; R(x + s.Z - 11, y + s.Z - 11, 10, 10, 'rgba(255,255,255,.85)'); T(String(n), x + s.Z - 6, y + s.Z - 5, ['', '#2e6fd6', '#2e8a3a', '#d6352e', '#6a2ea0', '#8a3a10'][Math.min(5, n)], 7, 'center'); } }
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
  how: ['Grease blobs are loose in the trap room. Blow a jetter bubble (SPACE) to trap one.', 'Run into a trapped blob to POP it. Wait too long and it breaks out, angrier.', 'Jump with ▲. You can jump up through ledges.', 'Dodge hot grease from the hood vents, frying pans flying off the line, and the deep fryers flaring at the ends. New blobs crawl out of the floor drain. Pop them all. Touch a loose blob and you lose a clean pair of pants.'],
  dpad: 'omni',
  ctl: '◀ ▶ RUN  ·  ▲ JUMP  ·  SPACE = BUBBLE',
  act: 'BUBBLE',
  init(s) {
    s.TIME = 75; s.px = 60; s.py = 226; s.vx = 0; s.vy = 0; s.on = true; s.face = 1; s.pantsMax = s.pants = [5, 4, 3][s.diff]; s.inv = 1.5; s.cd = 0; s.pops = 0; s.combo = 0; s.comboT = 0;
    s.plat = [{ x: 0, y: 226, w: 480 }, { x: 40, y: 178, w: 150 }, { x: 290, y: 178, w: 150 }, { x: 140, y: 128, w: 200 }, { x: 20, y: 80, w: 130 }, { x: 330, y: 80, w: 130 }];   /* the floor raised so your thumb isn't on it */
    const spots = [[100, 178], [360, 178], [240, 128], [80, 80], [400, 80], [300, 226], [200, 178], [420, 226], [160, 128], [60, 226]];
    s.foes = []; const n = [7, 9, 11][s.diff];   // a crowded trap room
    for (let i = 0; i < n; i++) { const [x, y] = spots[i % spots.length]; s.foes.push({ x: x + (s.rnd() - .5) * 20, y, vx: (s.rnd() < .5 ? -1 : 1) * (28 + 10 * s.diff), vy: 0, st: 'walk', t: 0, angry: false, kind: i % 3 === 2 ? 'wipe' : 'grease' }); }
    s.bubs = []; s.loot = []; s.drips = []; s.pans = []; s.vents = [70, 170, 310, 410]; s.nextDrip = 1.5; s.nextPan = 3.5; s.fryers = [{ x: 30, t: 3 + s.rnd() * 2, warn: 0, on: 0 }, { x: 450, t: 6 + s.rnd() * 2, warn: 0, on: 0 }]; s.spawned = 0; s.nextSpawn = 12;
  },
  ground(s, x, yPrev, y) { for (const p of s.plat) if (x > p.x - 4 && x < p.x + p.w + 4 && yPrev <= p.y && y >= p.y) return p.y; return null; },
  update(s, dt, I) {
    s.t += dt; FX(s, dt); const H = HERO(s);
    s.inv = Math.max(0, s.inv - dt); s.cd = Math.max(0, s.cd - dt); s.comboT = Math.max(0, s.comboT - dt); if (s.comboT <= 0) s.combo = 0;
    // run + jump (one-way ledges)
    let mv = (I.R ? 1 : 0) - (I.L ? 1 : 0); if (I.ptr.down && I.ptr.y > 60) mv = I.ptr.x < s.px - 10 ? -1 : I.ptr.x > s.px + 10 ? 1 : 0;
    if (mv) s.face = mv;
    s.vx += (mv * 130 * H.spd - s.vx) * Math.min(1, dt * 12);
    if ((I.Up || (I.ptr.clicked && I.ptr.y < s.py - 30)) && s.on) { s.vy = -335; s.on = false; SFX('bead_pop' + (1 + Math.floor(Math.random() * 5)), { vol: 0.3, rate: 1.2 }); }
    s.vy += 760 * dt; const py0 = s.py; s.px = clamp(s.px + s.vx * dt, 12, W - 12); s.py += s.vy * dt;
    s.on = false; if (s.vy >= 0) { const gy = this.ground(s, s.px, py0, s.py); if (gy != null) { s.py = gy; s.vy = 0; s.on = true; } }
    if (s.py > 226) { s.py = 226; s.vy = 0; s.on = true; }
    // blow a bubble
    if ((I.Ap || (I.ptr.clicked && I.ptr.y >= s.py - 30 && Math.abs(I.ptr.x - s.px) < 40)) && s.cd <= 0) { s.cd = 0.8;   /* one bubble at a time: it takes a breath to blow the next */ s.bubs.push({ x: s.px + s.face * 10, y: s.py - 12, vx: s.face * 260, vy: 0, t: 0, foe: null }); SFX('bead_pop' + (1 + Math.floor(Math.random() * 5)), { vol: 0.45 }); }
    for (const b of s.bubs) {
      b.t += dt;
      if (!b.foe) { b.vx *= Math.pow(0.06, dt); if (Math.abs(b.vx) < 30) b.vy = -22; }
      else { b.vx = Math.sin(b.t * 2) * 12; b.vy = -18; }
      b.x = clamp(b.x + b.vx * dt, 14, W - 14); b.y = Math.max(28, b.y + b.vy * dt);
      if (!b.foe) for (const f of s.foes) if (f.st !== 'trapped' && f.st !== 'gone' && Math.abs(f.x - b.x) < 16 && Math.abs(f.y - 10 - b.y) < 16 && b.t < 1.6) { b.foe = f; f.st = 'trapped'; b.t = 0; POP(s, b.x, b.y - 16, 'GOTCHA!', '#9fd1ff'); break; }
      // touch a trapped blob to pop it
      if (b.foe && Math.abs(b.x - s.px) < 16 && Math.abs(b.y - (s.py - 10)) < 20) {
        b.dead = true; b.foe.st = 'gone'; s.pops++; s.combo++; s.comboT = 1.2;
        const pts = 100 * s.combo; POP(s, b.x, b.y - 10, s.combo > 1 ? `x${s.combo} COMBO!` : '+100', '#f7c418');
        PUFF(s, b.x, b.y, b.foe.kind === 'bead' ? `hsl(${b.foe.hue * 360},80%,65%)` : b.foe.kind === 'wipe' ? '#f4f4f2' : '#c9a640', 16, 110); SFX('bead_chain', { vol: 0.5 });
        s.loot.push({ x: b.x, y: b.y, vy: -60, kind: s.beads ? 'bucket' : s.rnd() < .5 ? 'soap' : 'coffee' });
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
        if (f.y > 226) { f.y = 226; f.vy = 0; }
        const onPlat = s.plat.find(p => Math.abs(p.y - f.y) < 1 && f.x > p.x && f.x < p.x + p.w);
        if (onPlat && (f.x < onPlat.x + 6 || f.x > onPlat.x + onPlat.w - 6) && s.rnd() < 0.7) f.vx *= -1;
        if (f.x < 14 || f.x > W - 14) { f.vx *= -1; f.x = clamp(f.x, 14, W - 14); }
        if (f.vy === 0 && s.rnd() < dt * (f.kind === 'bead' ? 1.6 : 0.4)) f.vy = f.kind === 'bead' ? -330 - s.rnd() * 80 : -300;   /* the beads boing everywhere */
      }
      if (s.inv <= 0 && Math.abs(f.x - s.px) < 11 && Math.abs((f.y - 8) - (s.py - 10)) < 14) { s.pants--; s.inv = 2.0; s.shake = 0.3; s.vx = (s.px < f.x ? -1 : 1) * 220; s.vy = -200; s.on = false; PUFF(s, s.px, s.py - 16, '#6b4423', 12); POP(s, s.px, s.py - 40, 'SPLAT!', '#e9665a'); SFX('squish'); }
    }
    for (const l of s.loot) { l.vy += 400 * dt; const y0 = l.y; l.y += l.vy * dt; const gy = this.ground(s, l.x, y0, l.y); if (l.vy > 0 && gy != null) { l.y = gy; l.vy = 0; }
      if (!l.got && Math.abs(l.x - s.px) < 14 && Math.abs(l.y - s.py) < 20) { l.got = true; POP(s, l.x, l.y - 20, l.kind === 'bucket' ? `BUCKET OF BEADS! (${++s.buckets})` : l.kind === 'soap' ? 'SOAP!' : 'COFFEE!', '#7bd65b'); } }
    s.loot = s.loot.filter(l => !l.got);
    // hazards: hot grease drips from the hood vents (a warning wobble first), and frying pans skid across a ledge
    if (!s.beads) { s.nextDrip -= dt; if (s.nextDrip <= 0) { s.nextDrip = (1.0 - s.diff * 0.18) * (0.6 + s.rnd()); s.drips.push({ x: s.vents[Math.floor(s.rnd() * s.vents.length)] + (s.rnd() - .5) * 20, y: 30, vy: 0, warn: 0.8 }); }
    for (const d of s.drips) { if (d.warn > 0) { d.warn -= dt; continue; } d.vy += 600 * dt; d.y += d.vy * dt;
      if (s.inv <= 0 && Math.abs(d.x - s.px) < 7 && d.y > s.py - 24 && d.y < s.py) { d.y = 999; s.pants--; s.inv = 1.6; s.shake = 0.25; PUFF(s, s.px, s.py - 18, '#d9a23a', 10); POP(s, s.px, s.py - 30, 'HOT GREASE!', '#e9665a'); SFX('bead_drop', { vol: 0.5 }); }
      const gy = s.plat.find(p => d.x > p.x && d.x < p.x + p.w && d.y >= p.y && d.y - d.vy * dt < p.y); if (gy && d.y < 900) { d.y = 999; PUFF(s, d.x, gy.y, '#d9a23a', 5, 40); } }
    } else { s.nextDrip -= dt; if (s.nextDrip <= 0) { s.nextDrip = (1.4 - s.diff * 0.25) * (0.6 + s.rnd()); s.drips.push({ x: 30 + s.rnd() * 420, y: 30, vy: 0, warn: 0.6, col: s.rnd() }); }   /* the kids are pouring more in from upstairs */
      for (const d of s.drips) { if (d.warn > 0) { d.warn -= dt; continue; } d.vy += 500 * dt; d.y += d.vy * dt;
        if (s.inv <= 0 && Math.abs(d.x - s.px) < 8 && d.y > s.py - 24 && d.y < s.py) { d.y = 999; s.pants--; s.inv = 1.6; s.shake = 0.25; s.vy = -160; s.on = false; POP(s, s.px, s.py - 30, 'SLIPPED ON A BEAD!', '#e9665a'); SFX('squish'); }
        const gy = s.plat.find(p => d.x > p.x && d.x < p.x + p.w && d.y >= p.y && d.y - d.vy * dt < p.y); if (gy && d.y < 900) { d.y = 999; PUFF(s, d.x, gy.y, '#9fd1ff', 5, 40); } } }
    s.drips = s.drips.filter(d => d.y < H);
    if (!s.beads) { s.nextPan -= dt; if (s.nextPan <= 0) { s.nextPan = (3.6 - s.diff * 0.6) * (0.7 + s.rnd() * 0.6); const p = s.plat[Math.floor(s.rnd() * s.plat.length)], dir = s.rnd() < .5 ? 1 : -1; s.pans.push({ x: dir > 0 ? p.x - 10 : p.x + p.w + 10, y: p.y, vx: dir * (120 + s.diff * 30), spin: 0, warn: 0.9, lane: p }); }
    for (const pn of s.pans) { if (pn.warn > 0) { pn.warn -= dt; continue; } pn.x += pn.vx * dt; pn.spin += dt * 14;
      if (s.inv <= 0 && Math.abs(pn.x - s.px) < 11 && Math.abs(pn.y - s.py) < 6) { pn.x = 9999; s.pants--; s.inv = 1.6; s.shake = 0.35; s.vy = -220; s.on = false; POP(s, s.px, s.py - 30, 'CLANG!', '#e9665a'); SFX('clog', { vol: 0.6 }); } }
    } s.pans = s.pans.filter(pn => pn.x > -40 && pn.x < W + 40);
    if (!s.beads) for (const fr of s.fryers) { if (fr.on > 0) { fr.on -= dt; if (fr.on <= 0) fr.t = (5 - s.diff) * (0.8 + s.rnd() * 0.5); }
      else if (fr.warn > 0) { fr.warn -= dt; if (fr.warn <= 0) { fr.on = 1.1; SFX('bead_drop', { vol: 0.5 }); } }
      else { fr.t -= dt; if (fr.t <= 0) fr.warn = 1.0; }
      if (fr.on > 0 && s.inv <= 0 && Math.abs(s.px - fr.x) < 46 && s.py > 200) { s.pants--; s.inv = 1.6; s.shake = 0.3; s.vy = -260; s.on = false; s.vx = (s.px < fr.x ? -1 : 1) * 200; POP(s, s.px, s.py - 30, 'FRYER FLARE!', '#e9665a'); SFX('squish'); } }   /* the deep fryers spit hot oil along the floor */
    s.nextSpawn -= dt; if (s.nextSpawn <= 0 && s.spawned < 2 + s.diff) { s.nextSpawn = 14 - s.diff * 2; s.spawned++; s.foes.push({ x: 240, y: 226, vx: (s.rnd() < .5 ? -1 : 1) * 40, vy: -260, st: 'walk', t: 0, angry: true, kind: s.beads ? 'bead' : 'grease', hue: s.rnd() }); POP(s, 240, 200, s.beads ? 'ANOTHER ONE BUBBLED UP THE DRAIN!' : 'ANOTHER ONE CRAWLED OUT!', '#e9665a'); SFX('gurgle', { vol: 0.5 }); }   /* the floor drain keeps coughing them up */
    const left = s.foes.filter(f => f.st !== 'gone').length;
    if (s.pants <= 0) s.end = { win: false, stars: 0, line: s.beads ? 'Slipped one too many times. The beads win.' : 'Out of clean pants. The grease wins.' };
    else if (!left) s.end = { win: true, stars: stars3(s.pants === s.pantsMax && s.t < 40, s.pants >= s.pantsMax - 1), line: s.beads ? `Line cleared. ${s.buckets || 0} buckets of beads.` : `Trap room cleared in ${Math.round(s.t)}s.` };
    else if (s.t >= s.TIME) s.end = { win: false, stars: 0, line: `${left} blob${left > 1 ? 's' : ''} still loose.` };
  },
  draw(s) {
    if (BGI(s.beads ? 'bg_basement' : 'bg_kitchen')) R(0, 0, W, H, 'rgba(8,12,20,.55)'); else { R(0, 0, W, H, '#14202c'); for (let y = 16; y < H; y += 16) for (let x = (y / 16 % 2) * 16; x < W; x += 32) R(x, y, 30, 14, '#182634'); }
    if (!s.beads) for (const fr of s.fryers) { R(fr.x - 22, 196, 44, 30, '#7e848c'); R(fr.x - 22, 196, 44, 3, '#b9bec6'); R(fr.x - 18, 200, 36, 6, fr.warn > 0 ? (Math.floor(s.t * 10) % 2 ? '#e8b440' : '#a87a20') : '#8a6a24');   /* deep fryer */
      if (fr.warn > 0) T('!', fr.x, 186, '#e9665a', 10, 'center');
      if (fr.on > 0) for (let q = 0; q < 14; q++) { const a = Math.random() * Math.PI, rr = 10 + Math.random() * 40; C(fr.x + Math.cos(a) * rr * (q % 2 ? 1 : -1), 220 - Math.sin(a) * rr * 0.5, 2 + Math.random() * 2, q % 3 ? '#f2b23a' : '#ffe08a'); } }
    if (s.beads) { R(222, 14, 36, 10, '#c9ced6'); R(232, 16, 16, 6, '#1a1a1a'); }   /* the tub drain, where they came from */
    else for (const vx of s.vents) { R(vx - 16, 18, 32, 8, '#5a5e66'); for (let i = 0; i < 4; i++) R(vx - 13 + i * 7, 20, 4, 4, '#2a2c30'); }   // hood vents overhead
    for (const p of s.plat) { if (p.y === 226) { R(p.x, p.y, p.w, 20, '#3a3d42'); for (let x = p.x; x < p.x + p.w; x += 24) R(x, p.y, 22, 3, '#4e525a'); continue; }   // the tile floor
      R(p.x, p.y, p.w, 7, '#b9bec6'); R(p.x, p.y, p.w, 2, '#e4e7ec'); R(p.x, p.y + 7, p.w, 2, '#6e737b'); R(p.x + 6, p.y + 9, 3, 10, '#6e737b'); R(p.x + p.w - 9, p.y + 9, 3, 10, '#6e737b'); }   // stainless steel shelves
    for (const d of s.drips) { if (d.col != null) { const c = `hsl(${d.col * 360},80%,62%)`; if (d.warn > 0) C(d.x, 28, 3, c); else { C(d.x, d.y, 3.5, c); R(d.x - 1, d.y - 2, 1, 1, '#fff'); } continue; } if (d.warn > 0) { const w = Math.sin(s.t * 30) * 1; C(d.x + w, 28, 3, '#e8b440'); } else { C(d.x, d.y, 3, '#e8b440'); R(d.x - 1, d.y - 6, 2, 5, '#e8b440'); } }
    for (const pn of s.pans) { if (pn.warn > 0) { if (Math.floor(s.t * 8) % 2) T('!', pn.vx > 0 ? pn.lane.x + 6 : pn.lane.x + pn.lane.w - 6, pn.y - 14, '#e9665a', 9, 'center'); continue; }
      g.save(); g.translate(pn.x, pn.y - 5); g.rotate(pn.spin); R(-7, -3, 14, 6, '#2b2d31'); R(-6, -2, 12, 2, '#55595f'); R(6, -1, 9, 2, '#1a1a1a'); g.restore(); }
    for (const l of s.loot) { if (l.kind === 'bucket') { R(l.x - 6, l.y - 10, 12, 10, '#f0f0f0'); R(l.x - 6, l.y - 10, 12, 2, '#c9c9c9'); for (let q = 0; q < 4; q++) C(l.x - 4 + q * 2.6, l.y - 10, 1.8, `hsl(${q * 90},80%,62%)`); continue; } if (l.kind === 'soap') { R(l.x - 6, l.y - 6, 12, 6, '#9fd1ff'); R(l.x - 4, l.y - 8, 8, 2, '#fff'); } else { R(l.x - 4, l.y - 10, 8, 10, '#f4f1ea'); R(l.x - 4, l.y - 6, 8, 3, '#8a5a2e'); } }
    for (const f of s.foes) { if (f.st !== 'walk') continue; const bob = Math.sin(s.t * 10 + f.x) * 1.5;
      if (f.kind === 'bead') { const c = `hsl(${f.hue * 360},${f.angry ? 95 : 75}%,58%)`, sq = f.vy === 0 ? 1.15 : 0.92;   /* a swollen water bead, squishing when it lands */
        g.save(); g.translate(f.x, f.y - 10); g.scale(sq, 1 / sq); g.globalAlpha = 0.9; C(0, 0, 10, c); g.globalAlpha = 1; C(-3, -4, 3, 'rgba(255,255,255,.75)'); C(3, 3, 2, 'rgba(255,255,255,.25)'); R(-4, -1, 2, 3, f.angry ? '#c0302a' : '#1a1a2a'); R(2, -1, 2, 3, f.angry ? '#c0302a' : '#1a1a2a'); g.restore(); continue; }
      { const k = f.kind === 'wipe' ? 'wipe_' : 'grease_', im = MG('sr_' + k + ANIM(f, s.t, 6, f.kind === 'wipe' ? 0.5 : 0.75));
        if (im) { const sc = SCL(MG('sr_' + k + '0'), f.kind === 'wipe' ? 20 : 16), w = im.width * sc, h = im.height * sc; g.save(); g.translate(f.x, 0); if (f.vx > 0 && f.kind !== 'wipe') g.scale(-1, 1); if (f.angry) g.filter = 'saturate(1.6) hue-rotate(-20deg)';
          g.drawImage(im, -w / 2, f.kind === 'wipe' ? f.y - h - 4 + bob : f.y - h + 1, w, h); g.restore(); continue; } }
      if (f.kind === 'wipe') { R(f.x - 9, f.y - 20 + bob, 18, 16, '#f4f4f2'); R(f.x - 7, f.y - 18 + bob, 14, 2, '#d9d4c8'); R(f.x - 4, f.y - 14 + bob, 2, 3, f.angry ? '#e9665a' : '#222'); R(f.x + 2, f.y - 14 + bob, 2, 3, f.angry ? '#e9665a' : '#222'); }
      else { C(f.x, f.y - 8 + bob, 9, f.angry ? '#8a5a1e' : '#c9a640'); C(f.x - 3, f.y - 11 + bob, 3, '#e8d48a'); R(f.x - 4, f.y - 9 + bob, 2, 3, f.angry ? '#e9665a' : '#222'); R(f.x + 2, f.y - 9 + bob, 2, 3, f.angry ? '#e9665a' : '#222'); } }
    for (const b of s.bubs) { g.globalAlpha = 0.85; C(b.x, b.y, 11, 'rgba(159,209,255,.35)'); g.strokeStyle = '#9fd1ff'; g.lineWidth = 1.5; g.beginPath(); g.arc(b.x, b.y, 11, 0, 7); g.stroke(); g.globalAlpha = 1; R(b.x - 5, b.y - 6, 3, 3, '#fff');
      if (b.foe && b.foe.kind === 'bead') { C(b.x, b.y, 7, `hsl(${b.foe.hue * 360},75%,58%)`); C(b.x - 2, b.y - 3, 2, '#fff'); if (b.t > 4) T('!', b.x, b.y - 16, '#e9665a', 7, 'center'); }
      else if (b.foe) { const im = MG('sr_' + (b.foe.kind === 'wipe' ? 'wipe_6' : 'grease_6')); if (im) g.drawImage(im, b.x - 7, b.y - 7, 14, 14 * im.height / im.width); else if (b.foe.kind === 'wipe') R(b.x - 6, b.y - 5, 12, 10, '#f4f4f2'); else C(b.x, b.y, 6, '#c9a640'); if (b.t > 4) T('!', b.x, b.y - 16, '#e9665a', 7, 'center'); } }
    if (!(s.inv > 0 && Math.floor(s.t * 12) % 2)) HERO_AT(s, s.px, s.py, 0.85, { face: s.face > 0 ? 'R' : 'L', force: true, horiz: true });   // half the old height, so the room has space
    DRAWFX(s);
    HUD(s, s.beads ? 'BEAD BOBBLE' : 'GREASE BOBBLE', s.TIME - s.t); PANTS(s, 6, 22);
    T('LEFT ' + s.foes.filter(f => f.st !== 'gone').length, W - 6, 26, '#f7c418', 6, 'right');
  },
});
// 20b. WATER BEADS — swollen water beads packed in the sewer, seen from the jetter nozzle. Spray one and its whole
// same-color clump pops; the beads above drop into the gap. Drop-ins that line up 3+ of a color pop on their own: chain them.
GAMES.push({
  id: 'beads', name: 'WATER BEADS', tag: 'Match the colors · chain reactions · one bucket',
  how: ["The kids' water beads swelled up and packed the sewer. You've got ONE bucket of water in the jetter tank.", 'Pick a bead with the stick (or tap it) and SPRAY: it pops along with every bead of the same color touching it.', 'Beads above fall into the gap. If 3 or more of one color end up touching, they pop for FREE. Chain them!', 'Every spray costs water. Big clumps and chain reactions are how you clear it before the tank runs dry.'],
  dpad: 'omni', ctl: 'STICK = PICK A BEAD  ·  SPACE = SPRAY', act: 'SPRAY', phone: 'tap a bead to spray it, or pick with the stick and press SPRAY.',
  COLS: ['#3f8cff', '#3ccf5a', '#f04a6a', '#f7c418', '#b15cff'],
  init(s) {
    s.oy = 0.22; const [cx, cy, cr] = TUNNEL.proj(7.5, 0, 0, 0, s.oy); s.cx = cx; s.cy = cy; s.cr = cr * 0.95;
    s.NC = [9, 10, 11][s.diff]; s.NR = s.NC; s.cell = (s.cr * 2) / s.NC; s.nCol = [4, 4, 5][s.diff];
    s.g = []; for (let c = 0; c < s.NC; c++) { s.g.push([]); for (let r = 0; r < s.NR; r++) { const x = this.X(s, c), y = this.Y(s, r), inside = Math.hypot(x - s.cx, y - s.cy) < s.cr - s.cell * 0.35; s.g[c].push(inside ? { k: Math.floor(s.rnd() * s.nCol) } : null); } }
    s.in = s.g.map(col => col.map(b => !!b));
    this.unclump(s);
    s.N0 = s.g.flat().filter(Boolean).length; s.shots = [16, 15, 15][s.diff]; s.S0 = s.shots; s.sc = Math.floor(s.NC / 2); s.sr = s.NR - 2; this.snap(s);
    s.busy = 0; s.popping = []; s.chain = 0; s.best = 0; s.done = 0; s.cleared = 0; s.spray = 0;
  },
  X(s, c) { return s.cx - s.cr + s.cell * (c + 0.5); }, Y(s, r) { return s.cy - s.cr + s.cell * (r + 0.5); },
  unclump(s) { for (let pass = 0; pass < 6; pass++) for (let c = 0; c < s.NC; c++) for (let r = 0; r < s.NR; r++) { const b = s.g[c][r]; if (b && this.group(s, c, r).length >= 3) b.k = Math.floor(s.rnd() * s.nCol); } },   /* no free pops at the start */
  snap(s) { if (s.g[s.sc] && s.g[s.sc][s.sr]) return; let best = null, bd = 1e9; for (let c = 0; c < s.NC; c++) for (let r = 0; r < s.NR; r++) if (s.g[c][r]) { const d = Math.abs(c - s.sc) * 1.1 + Math.abs(r - s.sr); if (d < bd) { bd = d; best = [c, r]; } } if (best) { s.sc = best[0]; s.sr = best[1]; } },
  group(s, c, r) { const k = s.g[c][r].k, seen = new Set([c * 100 + r]), q = [[c, r]], out = [];
    while (q.length) { const [a, b] = q.pop(); out.push([a, b]); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = a + dx, y = b + dy, key = x * 100 + y; if (x < 0 || y < 0 || x >= s.NC || y >= s.NR || seen.has(key)) continue; const n = s.g[x][y]; if (n && n.k === k) { seen.add(key); q.push([x, y]); } } } return out; },
  pop(s, cells) { for (const [c, r] of cells) { const b = s.g[c][r]; if (!b) continue; s.popping.push({ x: this.X(s, c), y: this.Y(s, r), k: b.k, t: 0 }); s.g[c][r] = null; s.cleared++; } SFX('bead_pop' + (1 + Math.floor(Math.random() * 5)), { rate: 0.9 + Math.random() * 0.25 }); },
  fall(s) { let moved = false;   // gravity, inside the round pipe
    for (let c = 0; c < s.NC; c++) for (let r = s.NR - 1; r >= 0; r--) { if (!s.in[c][r] || s.g[c][r]) continue; for (let u = r - 1; u >= 0; u--) if (s.g[c][u]) { s.g[c][r] = s.g[c][u]; s.g[c][r].drop = (s.g[c][r].drop || 0) + (r - u); s.g[c][u] = null; moved = true; break; } }
    return moved; },
  cascade(s) { const seen = new Set(), pops = [];
    for (let c = 0; c < s.NC; c++) for (let r = 0; r < s.NR; r++) { if (!s.g[c][r] || seen.has(c * 100 + r)) continue; const gr = this.group(s, c, r); gr.forEach(([a, b]) => seen.add(a * 100 + b)); if (gr.length >= 3) pops.push(...gr); }
    return pops; },
  update(s, dt, I) {
    s.t += dt; FX(s, dt); s.spray = Math.max(0, s.spray - dt);
    for (const p of s.popping) p.t += dt; s.popping = s.popping.filter(p => p.t < 0.35);
    for (const col of s.g) for (const b of col) if (b && b.drop) b.drop = Math.max(0, b.drop - dt * 9);
    if (s.done) { s.done += dt; if (s.done > 2.2) { const left = s.g.flat().filter(Boolean).length; s.end = s.win2 ? { win: true, stars: stars3(s.shots >= 4, s.shots >= 1), line: `Line's open. ${s.cleared} beads popped, best chain x${s.best}, ${s.shots} spray${s.shots === 1 ? '' : 's'} left in the bucket.` } : { win: false, stars: 0, line: `Bucket's empty. ${left} beads still in there, drinking.` }; } return; }
    if (s.busy > 0) { s.busy -= dt; if (s.busy <= 0) {   // after a pop: let things fall, then check for chain pops
        if (this.fall(s)) { s.busy = 0.28; return; }
        const more = this.cascade(s); if (more.length) { s.chain++; s.best = Math.max(s.best, s.chain); this.pop(s, more); POP(s, 240, 60, `CHAIN x${s.chain}!`, '#7dffb0'); SFX('bead_chain', { rate: 1 + Math.min(0.5, s.chain * 0.1) }); s.busy = 0.3; return; }
        s.chain = 0; this.snap(s); this.check(s); } return; }
    // pick a bead: stick steps from bead to bead, tap picks directly
    const step = (dc, dr) => { for (let n = 1; n < s.NC; n++) { const c = s.sc + dc * n, r = s.sr + dr * n; if (c < 0 || r < 0 || c >= s.NC || r >= s.NR) return; if (s.g[c][r]) { s.sc = c; s.sr = r; SFX('ui_tap', { vol: 0.2 }); return; } } };
    if (I.Lp) step(-1, 0); if (I.Rp) step(1, 0); if (I.Up) step(0, -1); if (I.Dp) step(0, 1);
    let fire = I.Ap;
    if (I.ptr.clicked && Math.hypot(I.ptr.x - s.cx, I.ptr.y - s.cy) < s.cr) { const c = Math.floor((I.ptr.x - (s.cx - s.cr)) / s.cell), r = Math.floor((I.ptr.y - (s.cy - s.cr)) / s.cell); if (s.g[c] && s.g[c][r]) { s.sc = c; s.sr = r; fire = true; } }
    if (fire && s.g[s.sc][s.sr] && s.shots > 0) { s.shots--; s.spray = 0.35; SFX('bead_drop'); const gr = this.group(s, s.sc, s.sr); this.pop(s, gr); if (gr.length >= 4) POP(s, 240, 48, `${gr.length} AT ONCE!`, '#f7c418'); s.chain = 1; s.busy = 0.3; }
  },
  check(s) { const left = s.g.flat().filter(Boolean).length;
    if (left <= s.N0 * 0.2) { s.done = 0.01; s.win2 = true; for (let c = 0; c < s.NC; c++) for (let r = 0; r < s.NR; r++) if (s.g[c][r]) { s.popping.push({ x: this.X(s, c), y: this.Y(s, r), k: s.g[c][r].k, t: -r * 0.03 }); s.g[c][r] = null; } SFX('drain'); POP(s, 240, 70, 'IT ALL LETS GO!', '#7dffb0'); }
    else if (s.shots <= 0) { s.done = 0.01; s.win2 = false; POP(s, 240, 70, 'OUT OF WATER', '#e9665a'); } },
  draw(s) {
    R(0, 0, W, H, '#050605');
    TUNNEL.draw({ D: 0, t: s.t, pvc: false, ox: 0, oy: s.oy, plugs: [], water: 0.22, flow: -1, light: 1 }, 0, 0);
    const rr = s.cell * 0.48, sel = s.g[s.sc] && s.g[s.sc][s.sr], grp = sel && !s.busy && !s.done ? new Set(this.group(s, s.sc, s.sr).map(([a, b]) => a * 100 + b)) : new Set();
    for (let c = 0; c < s.NC; c++) for (let r = 0; r < s.NR; r++) { const b = s.g[c][r]; if (!b) continue; const x = this.X(s, c), y = this.Y(s, r) - (b.drop || 0) * s.cell, col = this.COLS[b.k], hot = grp.has(c * 100 + r);
      C(x, y, rr * (hot ? 1.06 + Math.sin(s.t * 10) * 0.04 : 1), col); C(x - rr * 0.3, y - rr * 0.35, rr * 0.3, 'rgba(255,255,255,.65)'); C(x + rr * 0.3, y + rr * 0.3, rr * 0.18, 'rgba(255,255,255,.2)');
      g.strokeStyle = hot ? '#fff' : 'rgba(0,0,0,.4)'; g.lineWidth = hot ? 1.5 : 1; g.beginPath(); g.arc(x, y, rr, 0, 7); g.stroke(); }
    for (const p of s.popping) { if (p.t < 0) { C(p.x, p.y, rr, this.COLS[p.k]); continue; } const k = p.t / 0.35; g.globalAlpha = Math.max(0, 1 - k); C(p.x, p.y, rr * (1 + k * 1.2), this.COLS[p.k]); g.globalAlpha = 1; for (let i = 0; i < 6; i++) { const a = i * 1.05; R(p.x + Math.cos(a) * rr * (1 + k * 2), p.y + Math.sin(a) * rr * (1 + k * 2), 2, 2, '#e8f6ff'); } }
    TUNNEL.vignette(0.45);
    const nx = 240, ny = 236; g.strokeStyle = '#1e1e22'; g.lineWidth = 14; g.beginPath(); g.moveTo(240, H + 10); g.lineTo(nx, ny + 8); g.stroke();
    R(nx - 9, ny - 6, 18, 14, '#b8862e'); R(nx - 9, ny - 6, 18, 3, '#e0b45a'); R(nx - 5, ny - 11, 10, 6, '#9a6e22');
    if (sel) { const x = this.X(s, s.sc), y = this.Y(s, s.sr);
      if (s.spray > 0) for (let i = 0; i < 8; i++) { g.strokeStyle = `rgba(170,215,255,${0.3 + Math.random() * 0.5})`; g.lineWidth = 1 + Math.random() * 2.5; g.beginPath(); g.moveTo(nx + (Math.random() - 0.5) * 6, ny - 10); g.lineTo(x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 8); g.stroke(); }
      else if (!s.done) { g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, rr + 3, 0, 7); g.stroke(); } }
    HUD(s, 'WATER BEADS', null);
    T('JETTER TANK · 1 BUCKET', 10, 26, '#9fd1ff', 6); for (let i = 0; i < s.S0; i++) R(10 + i * 9, 31, 7, 8, i < s.shots ? '#4aa8ff' : '#26313d');
    const left = s.g.flat().filter(Boolean).length, need = Math.ceil(s.N0 * 0.2);
    T(`BEADS ${left}  (CLEAR TO ${need})`, W - 8, 26, '#f7c418', 6, 'right'); BAR(W - 158, 31, 150, 7, (s.N0 - left) / (s.N0 - need), '#7dffb0');
    if (s.t < 5 && !s.cleared) T('POP CLUMPS. LINE UP CHAINS.', 240, 250, '#fff', 7, 'center');
    if (s.done) T(s.win2 ? 'LINE IS OPEN!' : 'TANK IS EMPTY...', 240, 70, s.win2 ? '#7dffb0' : '#e9665a', 12, 'center');
    DRAWFX(s);
  },
});


// =====================================================================
// 19. SUPER RON — a side-scroller starring Ron, God of Drains. Rod has notes.
const SR_TILE = 16, SR_GROUND = 15;                       // ground top is row 15 (y = 240)
const SR_LEVEL = (() => {
  const L = { len: 230, pits: [[38, 40], [74, 76], [118, 120], [150, 152], [176, 178]], pipes: [[16, 2], [28, 3], [46, 3], [60, 2], [88, 3], [102, 3], [132, 3], [162, 2], [186, 3]],
    blocks: [[10, 11], [11, 11], [12, 11], [52, 11], [53, 11], [54, 10], [55, 10], [80, 11], [81, 11], [96, 11], [97, 11], [98, 11], [140, 10], [141, 10], [142, 10], [168, 11], [169, 11]],
    plungers: [[11, 9], [12, 9], [20, 12], [21, 12], [33, 13], [39, 11], [54, 8], [55, 8], [66, 13], [67, 13], [75, 11], [76, 11], [92, 13], [97, 9], [110, 13], [111, 13], [119, 11], [126, 13], [141, 8], [151, 11], [152, 11], [158, 13], [170, 9], [177, 11], [192, 13], [193, 13]],
    grease: [24, 35, 57, 69, 84, 95, 108, 128, 138, 158, 172, 182, 196], wipes: [44, 82, 114, 146, 180],
    bricks: [[9, 11], [13, 11], [51, 11], [56, 10], [79, 11], [82, 11], [95, 11], [99, 11], [64, 10], [65, 10], [66, 10], [67, 10], [124, 10], [125, 10], [126, 10], [127, 10], [139, 10], [143, 10], [167, 11], [170, 11], [190, 11], [191, 11], [192, 11]] };
  L.brickSet = new Set(L.bricks.map(([c, r]) => c + ',' + r));
  return L;
})();
function srSolid(c, r) {
  const L = SR_LEVEL;
  if (c < 0) return true; if (c >= L.len) return false;
  if (r >= SR_GROUND) return !L.pits.some(([a, b]) => c >= a && c <= b);
  for (const [px, h] of L.pipes) if ((c === px || c === px + 1) && r >= SR_GROUND - h) return true;
  return L.blocks.some(([bx, by]) => bx === c && by === r) || (L.brickSet.has(c + ',' + r) && !(SR_BROKE && SR_BROKE.has(c + ',' + r)));
}
let SR_BROKE = null;   // cinder blocks smashed this run
function srRon(x, y, face, t, run, hurt, big, pose) {    // feet at (x, y); Ron, God of Drains (big = on espresso)
  if (hurt && Math.floor(t * 12) % 2) return;
  const im = IMG.ron_sheet;
  if (im) {   // the drawn sheet: 18 frames, facing right. 0 idle, 1-3 walk, 4-5 run, 6 jump, 7 fall, 8 crouch, 9 swing, 10 powered, 11 hurt, 12 dazed, 13-14 victory, 17 wave
    const fw = im.width / 18, fh = im.height, f = pose != null ? pose : run ? 1 + Math.floor(t * 9) % 3 : 0, h = (big ? 52 : 40), w = fw * h / (fh * 0.92);
    g.save(); g.translate(Math.round(x), Math.round(y)); if (face < 0) g.scale(-1, 1); g.imageSmoothingEnabled = true;
    g.drawImage(im, f * fw, 0, fw, fh, -w / 2, -h / 0.92 + 1, w, h / 0.92); g.restore(); g.imageSmoothingEnabled = false; return; }
  g.save(); g.translate(Math.round(x), Math.round(y)); if (face < 0) g.scale(-1, 1); if (big) g.scale(1.4, 1.4);
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
  how: ['Run right to the golden toilet at the end. Keep running to build up speed; a running jump goes higher.', 'Bonk toolboxes from below. Some hold an espresso: grab it to get big, smash cinder blocks, and survive one extra hit.', 'Squash grease blobs and wipe ghosts by landing on them. Chain stomps for bigger points.', 'Grab golden plungers. Rod will be commenting.'],
  ctl: 'LEFT / RIGHT TO RUN  ·  SPACE / UP TO JUMP',
  act: 'JUMP', dpad: 'stick',
  init(s) {
    const L = SR_LEVEL;
    s.p = { x: 40, y: SR_GROUND * SR_TILE, vx: 0, vy: 0, on: true, face: 1 };
    s.cam = 0; s.hearts = s.heartsMax = [4, 3, 2][s.diff]; s.time = [130, 110, 95][s.diff]; s.inv = 0; s.hits = 0; s.got = 0; s.total = L.plungers.length + L.blocks.filter((_, i) => i % 4 !== 1).length;   // the ones floating, plus the ones hiding in toolboxes (every 4th box has an espresso instead)
    s.plg = L.plungers.map(([c, r]) => ({ x: c * SR_TILE + 8, y: r * SR_TILE + 8, got: false }));
    s.bonked = new Set(); s.pops = [];
    s.foes = [...L.grease.filter(c => c < L.len - 42).map(c => ({ k: 'g', x: c * SR_TILE, y: SR_GROUND * SR_TILE, vx: -26, vy: 0, dead: 0 })),
              ...L.wipes.map(c => ({ k: 'w', x: c * SR_TILE, y: 150, y0: 150, vx: -18, dead: 0, ph: c }))];
    s.said = {}; s.bub = null; s.check = { x: 40, y: SR_GROUND * SR_TILE }; s.won = false; s.flush = 0;
    SR_BROKE = new Set(); s.big = false; s.items = []; s.debris = []; s.bumps = []; s.score = 0; s.combo = 0; s.runT = 0; s.texts = [];
    const FACE = { start: 'stare', pipe: 'annoyed', box: 'annoyed', plunger: 'confused', g: 'gross', w: 'gross', hitg: 'smug', hitw: 'laugh', pit: 'shocked', end: 'confused', espresso: 'happy', smash: 'shocked', bump: 'smug', shrink: 'tired', boss: 'panic', bossdown: 'happy' };
    s.quip = (k, txt) => { if (s.said[k]) return; s.said[k] = 1; s.bub = { txt, t: 3.2, face: FACE[k] || 'normal' }; };   // Rod's face matches what he's saying
    s.quip('start', "Ron has his own game now? ...Sure.");
  },
  update(s, dt, I) {
    s.t += dt; const p = s.p, L = SR_LEVEL;
    if (s.bub) { s.bub.t -= dt; if (s.bub.t <= 0) s.bub = null; }
    if (s.won) { s.flush += dt; if (s.flush > 2.2) s.end = { win: true, stars: stars3(s.hits === 0 && s.got >= s.total * 0.6, s.hits <= 1), line: `${s.got}/${s.total} golden plungers. "This isn't how drains work."` }; return; }
    if (!s.boss) s.time -= dt; s.inv = Math.max(0, s.inv - dt);   // the clock stops for the boss fight
    if (s.time <= 0) { s.end = { win: false, stars: 0, line: 'Out of time. Ron is late. Ron is never late. (Ron is late.)' }; return; }
    // run + jump
    let dir = (I.R ? 1 : 0) - (I.L ? 1 : 0);
    if (I.ptr.down && dir === 0) dir = I.ptr.x < W * 0.33 ? -1 : I.ptr.x > W * 0.66 ? 1 : 0;
    s.runT = dir && p.on && Math.sign(p.vx) === dir ? s.runT + dt : (p.on ? 0 : s.runT);          // keep running to build up speed
    const top = s.runT > 0.7 ? 168 : 112, skid = dir && Math.sign(p.vx) === -dir && Math.abs(p.vx) > 30;
    if (skid) { p.vx = dir * 40; s.runT = 0; }   // turning around is instant: no sliding
    const acc = p.on ? 620 : 420; p.vx += dir * acc * dt; if (!dir && p.on) p.vx *= Math.pow(0.00002, dt);   // and he stops when you let go
    p.vx = clamp(p.vx, -top, top); if (dir) p.face = dir; p.skid = false;
    const jumpHeld = I.A || I.U || (I.ptr.down && I.ptr.x >= W * 0.33 && I.ptr.x <= W * 0.66);
    if ((I.Ap || I.Up || (I.ptr.clicked && I.ptr.x >= W * 0.33 && I.ptr.x <= W * 0.66)) && (p.on || s.airJump)) { if (!p.on) s.airJump = false; p.vy = -305 - Math.abs(p.vx) * 0.32; p.on = false; SFX('ui_tap', { vol: 0.3 }); }   // a running jump goes higher
    if (!jumpHeld && p.vy < -110) p.vy = -110;                       // short hop if you let go
    p.vy = Math.min(520, p.vy + (jumpHeld && p.vy < 0 ? 640 : 1250) * dt);   // floaty while you hold jump, snappy coming down
    // move X, collide
    const hw = 6, hh = s.big ? 31 : 22;
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
      if (p.vy >= 0) { const r = Math.floor(p.y / SR_TILE); if (srSolid(c, r)) { p.y = r * SR_TILE; p.vy = 0; p.on = true; s.combo = 0; s.airJump = false; } }
      else { const r = Math.floor((p.y - hh) / SR_TILE); if (srSolid(c, r)) { p.y = (r + 1) * SR_TILE + hh; p.vy = 0;
        const k = c + ',' + r; s.bumps.push({ k, t: 0.15 });
        if (L.brickSet.has(k)) { if (s.big) { SR_BROKE.add(k); s.score += 50; SFX('clog'); for (let i = 0; i < 4; i++) s.debris.push({ x: c * SR_TILE + 4 + (i % 2) * 8, y: r * SR_TILE + 4 + (i > 1) * 8, vx: (i % 2 ? 60 : -60), vy: -200 + (i > 1) * 60, t: 1 }); s.quip('smash', "That's a load-bearing cinder block, Ron."); }
          else { SFX('click', { vol: 0.5 }); s.quip('bump', 'Too small to break it. Have you tried espresso?'); } }
        const bi = L.blocks.findIndex(([bx, by]) => bx === c && by === r);
        if (bi >= 0 && !s.bonked.has(k) && bi % 4 === 1 && !s.big) { s.bonked.add(k); s.items.push({ x: c * SR_TILE + 8, y: r * SR_TILE, vx: 0, vy: 0, rise: 16 }); SFX('ui_select'); s.quip('espresso', "An espresso? From a toolbox? ...Okay that one I respect."); }
        else if (bi >= 0 && !s.bonked.has(k)) { s.bonked.add(k); s.got++; s.score += 100; s.pops.push({ x: c * SR_TILE + 8, y: r * SR_TILE - 4, t: 0.6 }); s.quip('box', "Don't headbutt the toolbox, Ron. We need that."); } } }
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
        if (p.vy > 60 && p.y - ftop < 10) { f.dead = 0.01; p.vy = jumpHeld ? -330 : -230; s.airJump = true; /* a stomp gives you another jump */ SFX('squish'); s.combo++; const pts = 100 * Math.pow(2, Math.min(5, s.combo - 1)); s.score += pts; s.texts.push({ x: f.x, y: f.y - 16, txt: String(pts), t: 0.8 }); s.quip(f.k, f.k === 'g' ? "You don't STOMP grease, Ron. You JET it." : 'Flushable wipes. Haunting us even here.'); }
        else if (s.inv <= 0) { s.quip('hit' + f.k, f.k === 'g' ? 'He got greased. Happens to the best of us.' : 'Wiped out. Literally.'); hurt(s, false); }
      }
    }
    for (const it of s.items) {   // espresso: pops up out of the toolbox, then slides along and falls off ledges
      if (it.rise > 0) { it.rise -= 30 * dt; it.y -= 30 * dt; if (it.rise <= 0) it.vx = 50; continue; }
      it.vy = Math.min(400, it.vy + 900 * dt); it.x += it.vx * dt; if (srSolid(Math.floor((it.x + Math.sign(it.vx) * 6) / SR_TILE), Math.floor((it.y - 4) / SR_TILE))) it.vx = -it.vx;
      it.y += it.vy * dt; if (srSolid(Math.floor(it.x / SR_TILE), Math.floor(it.y / SR_TILE))) { it.y = Math.floor(it.y / SR_TILE) * SR_TILE; it.vy = 0; }
      if (!it.got && Math.abs(it.x - p.x) < 12 && Math.abs((it.y - 6) - (p.y - hh / 2)) < hh / 2 + 8) { it.got = true; s.big = true; s.score += 500; SFX('ui_select'); s.texts.push({ x: it.x, y: it.y - 14, txt: 'WIRED!', t: 1 }); }
      if (it.y > H + 40) it.got = true; }
    s.items = s.items.filter(it => !it.got);
    s.debris.forEach(d => { d.vy += 900 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.t -= dt; }); s.debris = s.debris.filter(d => d.t > 0);
    s.bumps.forEach(b => b.t -= dt); s.bumps = s.bumps.filter(b => b.t > 0);
    s.texts.forEach(o => { o.t -= dt; o.y -= 24 * dt; }); s.texts = s.texts.filter(o => o.t > 0);
    // ---------- THE FATBERG: the boss, guarding the golden toilet ----------
    const AR0 = (L.len - 41) * SR_TILE, AR1 = (L.len - 11) * SR_TILE;   /* the arena: a full screen wide */
    if (!s.boss && !s.bossDone && p.x > AR0 + 40) { s.boss = { x: AR1 - 30, vx: -40, hp: 3, inv: 0, t: 0, spit: 2, hop: 0, vy: 0, y: SR_GROUND * SR_TILE, roar: 1.2 }; s.globs = []; SFX('gurgle'); s.quip('boss', "That's a FATBERG. Every wipe anybody ever flushed. Stomp it, Ron."); }
    if (s.boss) { const B = s.boss; B.t += dt; B.inv = Math.max(0, B.inv - dt);
      p.x = clamp(p.x, AR0 + 8, AR1 - 6);   // no leaving mid-fight, and no jumping past him
      if (B.hp > 0) {
        if (B.roar > 0) B.roar -= dt;
        else { B.x += B.vx * dt * (B.hp === 1 ? 1.8 : B.hp === 2 ? 1.35 : 1); if (B.x < AR0 + 40 || B.x > AR1 - 10) B.vx = -B.vx;
          B.spit -= dt; if (B.spit <= 0) { B.spit = [2.2, 1.6, 1.1][3 - B.hp] || 1.1; const dir = Math.sign(p.x - B.x) || -1; s.globs.push({ x: B.x + dir * 16, y: B.y - 26, vx: dir * (90 + Math.random() * 60), vy: -220 }); B.mouth = 0.35; SFX('splash', { vol: 0.4 }); }
          if (B.hop <= 0 && Math.random() < dt * (B.hp === 1 ? 0.5 : 0.25)) { B.vy = -260; B.hop = 1; }
          if (B.hop) { B.vy += 900 * dt; B.y += B.vy * dt; if (B.y >= SR_GROUND * SR_TILE) { B.y = SR_GROUND * SR_TILE; B.hop = 0; B.vy = 0; s.shake = 0.3; } } }
        B.mouth = Math.max(0, (B.mouth || 0) - dt);
        // stomp it on the head, or get hurt touching it
        const top = B.y - 40;
        if (Math.abs(p.x - B.x) < 24 && p.y > top - 2 && p.y - 22 < B.y) {
          if (p.vy > 40 && p.y - top < 12 && B.inv <= 0) { B.hp--; B.inv = 1.0; B.roar = 0.6; p.vy = -380; s.airJump = true; s.score += 1000; s.shake = 0.4; SFX('squish'); s.texts.push({ x: B.x, y: top - 10, txt: '1000', t: 0.9 });
            if (B.hp <= 0) { B.dead = 0; SFX('flush_big'); s.quip('bossdown', "You flattened a fatberg with your BOOTS. ...I'll allow it."); } }
          else if (s.inv <= 0 && B.inv <= 0) { hurt(s, false); p.vx = (p.x < B.x ? -1 : 1) * 160; }
        }
      } else { B.dead += dt; if (B.dead > 1.6) { s.bossDone = true; s.boss = null; s.score += 5000; } }
      for (const o of s.globs) { o.vy += 700 * dt; o.x += o.vx * dt; o.y += o.vy * dt; if (o.y > SR_GROUND * SR_TILE) o.dead = true;
        if (!o.dead && s.inv <= 0 && Math.abs(o.x - p.x) < 8 && o.y > p.y - 22 && o.y < p.y) { o.dead = true; hurt(s, false); } }
      if (s.globs) s.globs = s.globs.filter(o => !o.dead);
    }
    if (!s.bossDone && p.x > AR1 - 6) { p.x = AR1 - 6; p.vx = Math.min(0, p.vx); }   // the toilet is behind the Fatberg: beat him first
    // the golden toilet
    if (s.bossDone && p.x > (L.len - 4) * SR_TILE && !s.won) { s.won = true; SFX('flush_big'); s.quip('end', "This isn't how drains work. What IS this?"); s.bub = { txt: "This isn't how drains work. What IS this?", t: 9, face: 'confused' }; }
    { const want = s.boss ? AR0 : clamp(p.x - 180, 0, L.len * SR_TILE - W); s.cam = s.boss || s.camEase > 0 ? s.cam + (want - s.cam) * Math.min(1, dt * 5) : want; s.camEase = s.boss ? 1 : Math.max(0, (s.camEase || 0) - dt); }   /* the camera eases onto the arena for the fight, and back off after */
    s.pops.forEach(o => { o.t -= dt; o.y -= 30 * dt; }); s.pops = s.pops.filter(o => o.t > 0);
    function hurt(s, fell) {
      if (!fell && s.big) { s.big = false; s.inv = 1.6; SFX('bubble'); s.p.vy = -150; s.quip('shrink', 'Caffeine crash. Happens.'); return; }   // the espresso takes the hit
      SFX(fell ? 'splash' : 'bubble'); s.hits++; s.hearts--; s.inv = 1.6;
      if (fell) { s.p.x = s.check.x; s.p.y = s.check.y; s.p.vx = s.p.vy = 0; for (const f of s.foes) if (!f.dead && Math.abs(f.x - s.p.x) < 60) f.x += 80 * Math.sign(f.x - s.p.x || 1); }
      else { s.p.vy = -200; s.p.vx = -s.p.face * 90; }
      if (s.hearts <= 0) s.end = { win: false, stars: 0, line: 'Game over, Ron. Rod finished the job. Nobody will ever know.' };
    }
  },
  draw(s) {
    const L = SR_LEVEL, cam = Math.round(s.cam), t = s.t;
    const BG = MG('sr_bg'), SI = n => MG('sr_' + n), T2 = n => MG('sr2_' + n);
    R(0, 0, W, H, '#2a1d14');   // nothing stale ever shows below the level
    if (BG) { const ox = -((cam * 0.3) % W); g.drawImage(BG, ox, -20, W, H); g.drawImage(BG, ox + W, -20, W, H); }   // the White Mountains, scrolling slowly
    else { const gr = g.createLinearGradient(0, 0, 0, 240); gr.addColorStop(0, '#5aa8f0'); gr.addColorStop(1, '#bfe6ff'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
    g.save(); g.translate(0, -34);   // the whole level sits higher, so your thumbs on the bottom don't cover Ron
    if (!BG) for (let i = 0; i < 6; i++) { const x = ((i * 190 - cam * 0.3) % 1140 + 1140) % 1140 - 100; C(x, 60 + (i % 3) * 18, 12, '#fff'); C(x + 14, 56 + (i % 3) * 18, 15, '#fff'); C(x + 30, 60 + (i % 3) * 18, 11, '#fff'); }
    if (!BG) for (let i = 0; i < 8; i++) { const x = ((i * 160 - cam * 0.55) % 1280 + 1280) % 1280 - 120; g.fillStyle = i % 2 ? '#3f8f4a' : '#4fa357'; g.beginPath(); g.ellipse(x, 242, 70, 40 + (i % 3) * 12, 0, Math.PI, 0); g.fill(); }
    const c0 = Math.floor(cam / SR_TILE), c1 = c0 + Math.ceil(W / SR_TILE) + 1;
    for (let c = c0; c <= c1; c++) {
      const x = c * SR_TILE - cam;
      if (T2('grass')) {   // the ground tile set: grass tops, dirt, straight cliff walls at pits, dark pit shafts
        const tile = (n, ty) => { const im = T2(n), h = 16 * im.height / im.width; g.drawImage(im, x - 0.5, ty + 16 - h, 17, h + 0.5); };   // bottom-anchored, so grass blades poke up
        if (!srSolid(c, SR_GROUND)) { tile('pittop', 240); for (let y = 256; y < 320; y += 16) tile('pit', y); continue; }
        const l = !srSolid(c - 1, SR_GROUND), rr = !srSolid(c + 1, SR_GROUND), v = (c * 7919) % 11;
        for (let y = 256; y < 320; y += 16) tile(l ? 'cliffL' : rr ? 'cliffR' : (y === 272 && v === 3) ? 'dirtrock' : (y === 288 && v === 7) ? 'dirtroots' : 'dirt', y);
        tile(l ? 'cliffLtop' : rr ? 'cliffRtop' : 'grass', 240);
        continue; }
      if (srSolid(c, SR_GROUND)) { R(x, 240, 16, 64, '#8a5a32'); R(x, 240, 16, 4, '#5fb848'); R(x + 3, 250, 3, 3, '#6b4423'); R(x + 10, 260, 3, 3, '#6b4423'); }
    }
    for (const [px, h] of L.pipes) {                                   // white PVC "pipes" (they're cleanouts, Ron)
      const x = px * SR_TILE - cam, top = (SR_GROUND - h) * SR_TILE; if (x < -40 || x > W + 10) continue;
      if (T2('ptop')) {   // pipe pieces: the cap off the top piece, the flared foot off the base piece, plain pipe repeating in between (clipped to the pipe's height)
        const pw = 36, px0 = x + 16 - pw / 2, bot = H + 40, I = T2,   /* the pipe runs down through the dirt, off the bottom of the screen */ part = (n, f0, f1, y, h) => g.drawImage(I(n), 0, I(n).height * f0, I(n).width, I(n).height * (f1 - f0), px0, y, pw, h);
        const capH = pw * I('ptop').height * 0.5 / I('ptop').width, footH = pw * I('pbase').height * 0.22 / I('pbase').width, bodyH = pw * I('pbody').height / I('pbody').width;
        g.save(); g.beginPath(); g.rect(px0 - 2, top + capH * 0.85, pw + 4, bot - top - capH * 0.85); g.clip();   // the body starts under the cap, so nothing pokes out behind it
        let k = 0; for (let y = bot - footH; y > top + capH * 0.6 - bodyH; y -= bodyH) { const n = ['pbody', 'pcoup', 'pbody', 'pstain'][(px + k++) % 4]; part(n, 0, 1, y - bodyH, bodyH + 0.5); }
        part('pbase', 0.78, 1, bot - footH, footH); g.restore();
        g.drawImage(I('ptop'), 0, 0, I('ptop').width, I('ptop').height * 0.5, px0 - 1, top - 3, pw + 2, capH); continue; }
      if (SI('pipetop')) { const pw = 40, px0 = x - 4, mh = pw * SI('pipemid').height / SI('pipemid').width; g.save(); g.beginPath(); g.rect(px0, top, pw, SR_GROUND * SR_TILE - top + 2); g.clip();
        for (let y = SR_GROUND * SR_TILE - mh + 4; y > top - mh; y -= mh) g.drawImage(SI('pipemid'), px0, y, pw, mh); g.restore(); g.drawImage(SI('pipetop'), px0 - 1, top - 4, pw + 2, 22); continue; }
      R(x + 2, top + 6, 28, h * SR_TILE - 6, '#e8ecef'); R(x + 4, top + 6, 5, h * SR_TILE - 6, '#ffffff'); R(x + 24, top + 6, 5, h * SR_TILE - 6, '#c9ced6');
      R(x, top, 32, 8, '#f2f4f6'); R(x, top + 7, 32, 2, '#aab1ba'); T('4"', x + 16, top + 20, '#7a8a9a', 5, 'center');
    }
    for (const [bx, by] of L.bricks) {                                // cinder blocks (break them when you're big)
      const k = bx + ',' + by; if (SR_BROKE && SR_BROKE.has(k)) continue; const x = bx * SR_TILE - cam, y = by * SR_TILE - (s.bumps.some(b => b.k === k) ? 3 : 0); if (x < -16 || x > W) continue;
      if (T2('cinder')) { g.drawImage(T2('cinder'), x, y, 16, 16); continue; }
      if (SI('cinder')) { g.drawImage(SI('cinder'), x, y, 16, 16); continue; }
      R(x, y, 16, 16, '#9a958c'); R(x, y, 16, 1, '#c4bfb4'); R(x, y + 7, 16, 2, '#6f6a62'); R(x + 7, y, 2, 7, '#6f6a62'); R(x + 3, y + 9, 2, 7, '#6f6a62'); R(x + 11, y + 9, 2, 7, '#6f6a62'); R(x + 2, y + 2, 4, 4, '#7d786f'); R(x + 10, y + 2, 4, 4, '#7d786f');
    }
    s.debris.forEach(d => R(d.x - cam - 3, d.y - 3, 6, 6, '#8a857c'));
    if (SI('espresso')) for (const it of s.items) { g.drawImage(SI('espresso'), it.x - cam - 8, it.y - 15, 16, 15); it.drawn = 1; }
    for (const it of s.items) { if (it.drawn) { it.drawn = 0; continue; } const x = it.x - cam; R(x - 5, it.y - 10, 10, 10, '#f4f4f2'); R(x - 4, it.y - 9, 8, 3, '#5a3a1c'); R(x + 5, it.y - 8, 3, 5, '#f4f4f2'); R(x - 6, it.y - 1, 12, 1, '#c9c4b8');   // espresso cup
      for (let i = 0; i < 2; i++) R(x - 2 + i * 4, it.y - 14 - Math.abs(Math.sin(t * 6 + i)) * 3, 1, 3, '#ffffffaa'); }
    for (const [bx, by] of L.blocks) {                                // toolboxes
      const x = bx * SR_TILE - cam, y = by * SR_TILE - (s.bumps.some(b => b.k === bx + ',' + by) ? 3 : 0), used = s.bonked.has(bx + ',' + by); if (x < -16 || x > W) continue;
      if (T2('toolbox')) { g.drawImage(T2(used ? 'toolbox_used' : 'toolbox'), x, y, 16, 16); continue; }
      if (SI('toolbox')) { g.drawImage(SI(used ? 'toolbox_open' : 'toolbox'), x - 1, y + 1, 18, 15); continue; }
      R(x, y, 16, 16, used ? '#7a4a40' : '#c0392b'); R(x, y + 6, 16, 2, '#8b2a1f'); R(x + 5, y + 2, 6, 2, '#222'); if (!used) R(x + 7, y + 9, 2, 3, '#f7c418');
    }
    for (const q of s.plg) if (!q.got) {                              // golden plungers (spinning)
      const x = q.x - cam; if (x < -10 || x > W + 10) continue; const w = Math.abs(Math.cos(t * 4 + q.x)) * 5 + 1;
      if (SI('plunger')) { const im = SI('plunger'), sw = Math.max(2, 13 * Math.abs(Math.cos(t * 4 + q.x))); g.drawImage(im, x - sw / 2, q.y - 12, sw, 16); continue; }
      R(x - 1, q.y - 4, 2, 10, '#c98a1e'); g.fillStyle = '#f2c94c'; g.beginPath(); g.ellipse(x, q.y - 5, w, 4, 0, Math.PI, 0); g.fill();
    }
    s.pops.forEach(o => { if (SI('plunger')) { g.drawImage(SI('plunger'), o.x - cam - 6, o.y - 10, 13, 16); return; } R(o.x - cam - 1, o.y - 4, 2, 9, '#c98a1e'); R(o.x - cam - 4, o.y - 6, 8, 3, '#f2c94c'); });
    for (const f of s.foes) {
      const x = f.x - cam; if (x < -20 || x > W + 20) continue;
      if (SI('grease_0')) { const k = f.k === 'g' ? 'grease_' : 'wipe_', n8 = !!SI(k + '7'), fr = f.dead ? (n8 ? 7 : 3) : ANIM(f, t, n8 ? 6 : 2, f.k === 'g' ? 0.75 : 0.5), im = SI(k + fr), sc = SCL(SI(k + '0'), f.k === 'g' ? 22 : 26), w = im.width * sc, h = im.height * sc;
        if (f.dead && f.dead > 0.5) continue; g.globalAlpha = f.dead ? Math.max(0, 1 - f.dead / 0.5) : 1; g.save(); g.translate(x, 0); if (f.vx > 0) g.scale(-1, 1);
        g.drawImage(im, -w / 2, f.k === 'g' ? f.y - h : f.y - h / 2, w, h); g.restore(); g.globalAlpha = 1; continue; }
      if (f.dead) { if (f.dead < 0.4) { g.globalAlpha = 1 - f.dead / 0.4; R(x - 9, f.y - 3, 18, 3, f.k === 'g' ? '#c9a24a' : '#f2f0ea'); g.globalAlpha = 1; } continue; }
      if (f.k === 'g') { g.fillStyle = '#d9b04a'; g.beginPath(); g.ellipse(x, f.y - 5, 9, 6 + Math.sin(t * 8) * 0.8, 0, 0, Math.PI * 2); g.fill(); R(x - 4, f.y - 8, 2, 2, '#222'); R(x + 2, f.y - 8, 2, 2, '#222'); R(x - 6, f.y - 11, 3, 2, '#f4dc8a'); }
      else { g.fillStyle = '#f2f0ea'; g.beginPath(); g.moveTo(x - 9, f.y + 9); g.lineTo(x - 9, f.y - 4); g.quadraticCurveTo(x, f.y - 14, x + 9, f.y - 4); g.lineTo(x + 9, f.y + 9); for (let k = 0; k < 4; k++) g.lineTo(x + 9 - k * 6 - 3, f.y + 5 + (k % 2) * 4); g.fill(); R(x - 4, f.y - 3, 2, 3, '#222'); R(x + 2, f.y - 3, 2, 3, '#222'); R(x - 6, f.y + 2, 12, 1, '#c9d6df'); }
    }
    // the golden toilet
    const tx = (L.len - 3) * SR_TILE - cam; /* the golden toilet sits near the far edge, leaving room to move */ if (tx < W + 40 && SI('toilet_0')) { const fr = !s.won ? 0 : s.flush < 0.5 ? 1 : s.flush < 1.4 ? 2 : 3, im = SI('toilet_' + fr), h = 52, w = h * im.width / im.height; g.drawImage(im, tx + 13 - w / 2, 240 - h, w, h); }
    else if (tx < W + 40) { R(tx, 212, 26, 28, '#f2c94c'); g.fillStyle = '#f7d96a'; g.beginPath(); g.ellipse(tx + 13, 212, 18, 7, 0, 0, Math.PI * 2); g.fill(); R(tx + 14, 180, 18, 26, '#f2c94c'); T('FLUSH', tx + 13, 172, '#f7c418', 5, 'center');
      if (s.won) { for (let i = 0; i < 8; i++) { const a = s.flush * 6 + i; C(tx + 13 + Math.cos(a) * 14 * (1 - s.flush / 2.2), 210 + Math.sin(a) * 5, 2, '#9fd0e0'); } } }
    if (s.boss) { const B = s.boss, x = B.x - cam, n8 = !!SI('fat_7'), fr = n8 ? (B.hp <= 0 ? (B.dead < 0.4 ? 6 : 7) : B.inv > 0.6 ? 6 : B.mouth > 0 ? 5 : B.roar > 0 ? 4 : B.hop ? 3 : (B.roar <= 0 ? 2 + Math.floor(t * 2.5) % 2 : Math.floor(t * 1.5) % 2)) : (B.hp <= 0 ? 3 : B.inv > 0 ? 3 : B.mouth > 0 ? 2 : B.roar > 0 ? 1 : 0), im = SI('fat_' + fr), sq = n8 ? 1 : B.hp <= 0 ? Math.max(0.05, 1 - B.dead / 1.4) : 1;
      if (!(B.inv > 0 && Math.floor(t * 14) % 2)) { if (im) { const h = 62 * sq, w = h * im.width / im.height * (sq < 1 ? 1 / sq : 1); g.save(); g.translate(x, 0); if (B.vx > 0) g.scale(-1, 1); g.drawImage(im, -w / 2, B.y - h, w, h); g.restore(); } else { R(x - 24, B.y - 40 * sq, 48, 40 * sq, '#8a6a2a'); } }
      for (const o of s.globs || []) { if (SI('grease_3')) g.drawImage(SI('grease_3'), o.x - cam - 6, o.y - 4, 12, 7); else C(o.x - cam, o.y, 3, '#d9b04a'); }
      for (let i = 0; i < 3; i++) C(W / 2 - 14 + i * 14, 70, 4, i < B.hp ? '#e9665a' : 'rgba(255,255,255,.25)'); }   // boss health
    if (!s.won || s.flush < 0.8) srRon(s.p.x - cam, s.p.y, s.p.face, t * (1 + Math.abs(s.p.vx) / 140), Math.abs(s.p.vx) > 10 && s.p.on, s.inv > 0, s.big,
      s.won ? (s.flush < 1.4 ? 15 : 16) : s.inv > 1.2 ? 12 : !s.p.on ? (s.p.vy < 0 ? 7 : 8) : s.p.skid ? 14 : Math.abs(s.p.vx) > 130 ? 5 + Math.floor(t * 10) % 2 : Math.abs(s.p.vx) > 10 ? 1 + Math.floor(t * 9) % 4 : (s.big && Math.floor(t) % 4 === 0 ? 11 : 0));   // 0 idle, 1-4 walk, 5-6 run, 7 jump, 8 fall, 9 crouch, 10 swing, 11 powered, 12 hurt, 13 dazed, 14 skid, 15 victory, 16 thumbs up, 17 wave
    s.texts.forEach(o => T(o.txt, o.x - cam, o.y, '#fff', 6, 'center'));
    g.restore();
    HUD(s, 'SUPER RON', s.time);
    for (let i = 0; i < s.heartsMax; i++) { const on = i < s.hearts; C(130 + i * 12, 8, 3, on ? '#e9665a' : '#444'); C(135 + i * 12, 8, 3, on ? '#e9665a' : '#444'); g.fillStyle = on ? '#e9665a' : '#444'; g.beginPath(); g.moveTo(127 + i * 12, 9); g.lineTo(132.5 + i * 12, 15); g.lineTo(138 + i * 12, 9); g.fill(); }
    R(305, 3, 2, 10, '#c98a1e'); R(301, 2, 10, 4, '#f2c94c'); T(`${s.got}/${s.total}`, 314, 8, '#f2c94c', 6);   // golden plunger count
    T(String(s.score).padStart(6, '0'), W - 8, 22, '#fff', 6, 'right');
    if (s.boss) T('FATBERG', 240, 22, '#e9665a', 6, 'center');
    // Rod's running commentary
    if (s.bub) { const lines = []; let ln = ''; for (const w of s.bub.txt.split(' ')) { if ((ln + ' ' + w).length > 34) { lines.push(ln); ln = w; } else ln = ln ? ln + ' ' + w : w; } lines.push(ln);
      const h = Math.max(34, 18 + lines.length * 10); R(8, 22, 306, h, 'rgba(16,21,31,.92)');  /* at least tall enough for Rod's face */ g.strokeStyle = '#f7c418'; g.lineWidth = 1; g.strokeRect(8.5, 22.5, 305, h - 1);
      const face = IMG['rodf_' + (s.bub.face || 'normal')] || IMG.rod_port;
      if (face) { const fs = 28, fy = 22 + (h - 28) / 2; R(11, fy, fs, fs, '#2a3346'); g.imageSmoothingEnabled = true; g.drawImage(face, 11, fy, fs, fs); g.imageSmoothingEnabled = false; g.strokeStyle = '#f7c418'; g.lineWidth = 1; g.strokeRect(11.5, fy + .5, fs - 1, fs - 1); } else SPR('rod', 0, 24, 22 + h - 2); T('ROD:', 46, 30, '#f7c418', 6); lines.forEach((l, i) => T(l, 46, 42 + i * 10, '#fff', 6)); }
  },
});

// =====================================================================
// SONDE CROSSING — Frogger with a locator. The camera's sonde is out under Main Street; find it, spray-paint it, don't get hit.
GAMES.push({
  id: 'locate', name: 'SONDE CROSSING', tag: 'The auto shop line · it runs under Main Street',
  how: ['The shop line runs out under the street to the city main.', 'Rod is in the shop pushing the camera. Its sonde beeps.', 'Hop out into traffic with the locator. Faster beeps = closer.', 'When the signal maxes out, SPACE to spray-paint the spot.', 'Rod pushes the camera further after each mark. Mark all 3.', 'Getting clipped sends you back to the curb.'],
  dpad: 'omni',
  ctl: '◀ ▶ ▲ ▼ HOP · SPACE MARK',
  act: 'MARK',
  init(s) {
    const bg = !!MG('bg_mainstreet'); s.bg = bg; s.nl = bg ? 4 : 6; const NL = s.nl;
    s.ys = bg ? [70, 90, 110, 130, 150, 172, 206, 238] : [36, 58, 80, 102, 124, 146, 168, 190, 212, 234];
    s.DUR = [80, 70, 62][s.diff]; s.row = bg ? NL + 1 : NL + 2; s.startRow = s.row; /* start on the near sidewalk, not in the lot by the fence */ s.px = 300; s.cool = 0; s.pantsMax = s.pants = [4, 3, 3][s.diff]; s.inv = 0; s.hits = 0; s.marks = []; s.bad = 0; s.beepT = 0; s.flash = 0; s.say = ''; s.sayT = 0;
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
      else if (I.D || I.Dp) s.row = Math.min(s.startRow ?? s.nl + 3, s.row + 1);   /* a barrier behind the near sidewalk: no backing off to the shop */
      else if (I.L || I.Lp) s.px = clamp(s.px - 12, 12, W - 12);
      else if (I.R || I.Rp) s.px = clamp(s.px + 12, 12, W - 12);
      else moved = false;
      if (I.ptr.down && !moved) { const ty = I.ptr.y, me = s.ys[s.row] - 2; let tr = s.row; if (Math.abs(ty - me) > 16) { tr = 0; s.ys.forEach((yy, i) => { if (Math.abs(yy - 2 - ty) < Math.abs(s.ys[tr] - 2 - ty)) tr = i; }); } const dx = I.ptr.x - s.px;   // a tap near your own row walks sideways; only a clear tap above/below steps into the road
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
    if (s.inv <= 0 && s.row >= 1 && s.row <= s.nl) for (const c of s.cars) if (c.row === s.row && Math.abs(c.x - s.px) < c.w / 2 + 3) {
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
      // (only the crew member you're playing is out here)
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
    { const by = Y(s.startRow ?? s.nl + 1) + 13;   /* orange-and-white construction barrier along the back of the near sidewalk */
      for (let x = 0; x < W; x += 34) { R(x + 2, by - 6, 30, 10, '#e8e4d8'); for (let k = 0; k < 3; k++) R(x + 4 + k * 10, by - 6, 5, 10, '#e8742a'); R(x + 4, by + 4, 3, 5, '#5a5a5a'); R(x + 27, by + 4, 3, 5, '#5a5a5a'); } }
    // you, with the locator wand
    if (!(s.inv > 0 && Math.floor(s.t * 12) % 2)) { const fy = Y(s.row) + 9, k = 0.6, h = 40 * k;   // smaller than a car; the locator wand scales with him
      HERO_AT(s, s.px, fy, k, { face: 'U' }); R(s.px + 4, fy - h * 0.6, 1, h * 0.5, '#f39c12'); R(s.px + 3, fy - h * 0.66, 3, 2, '#f7c418'); }   // just the wand in his hand, nothing over his head
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
  how: ['The line froze solid along the outside wall. You are at the cleanout with the steamer, looking up the pipe.', '▶ (or ▲) feeds the steam hose up the pipe, ◀ pulls it back.', 'Hold SPACE to steam the ice in front of the nozzle.', 'Steam too long in one spot and the pipe gets soft. Watch the HEAT bar.', 'The melt runs back into your bucket. When it gets full, STOP steaming and press ▼ to carry it outside and dump it.', 'Forget, and it runs over: you mop the floor before you can do anything else.', 'Melt every chunk of ice to open the line.'],
  dpad: 'omni',
  ctl: '◀ ▶ HOSE · SPACE STEAM · ▼ DUMP BUCKET',
  phone: 'the pad moves the hose (▼ dumps the bucket), the big button steams.',
  act: 'STEAM',
  init(s) {
    s.DUR = [68, 62, 56][s.diff]; s.mop = 0; s.hx = 92; s.heat = 0; s.bucket = 0; s.swap = 0; s.pantsMax = s.pants = [4, 3, 3][s.diff]; s.inv = 0; s.soft = 0; s.spill = 0;
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
    const wantSteam = I.A || (I.ptr.down && I.ptr.x >= 150 && I.ptr.x <= 330 && I.ptr.y < 190);
    const away = s.swap > 0 || s.mop > 0;
    // the floor: if the bucket ran over you mop before anything else (tap SPACE / tap the screen)
    if (s.mop > 0) { s.heat = Math.max(0, s.heat - dt * 0.38);
      if (I.Ap || I.ptr.clicked) { s.mop -= 0.075 * Math.sqrt(H0.spd); s.mopT = 0.15; SFX('squish', { vol: 0.5 }); if (s.mop <= 0) { s.mop = 0; POP(s, 240, 120, "FLOOR'S DRY. BACK TO IT.", '#7dffb0'); } }
      s.mopT = Math.max(0, (s.mopT || 0) - dt); }
    // the dump run: stop steaming, carry the bucket out the bulkhead, dump it, come back
    else if (s.swap > 0) { s.swap -= dt; s.heat = Math.max(0, s.heat - dt * 0.38); if (s.swap <= 0) { s.bucket = 0; POP(s, 240, 120, 'BUCKET DUMPED. BACK AT IT.', '#7dffb0'); } }
    else if (I.Dp || (I.ptr.clicked && I.ptr.x < 110 && I.ptr.y > 190)) {
      if (wantSteam) POP(s, 240, 110, 'STOP STEAMING FIRST', '#f7c418');
      else if (s.bucket < 0.1) POP(s, 240, 110, "BUCKET'S EMPTY", '#cfd8e0');
      else { s.swap = s.SWAP = 3.2 / Math.sqrt(H0.spd); SFX('splash'); } }
    if (!away) {
      const dir = (I.R || I.U ? 1 : 0) - (I.L ? 1 : 0) + (I.ptr.down && !I.A ? (I.ptr.x > 330 ? 1 : I.ptr.x < 150 ? -1 : 0) : 0);   /* touch: right side feeds the hose in, left pulls it back, middle steams */
      s.hx = clamp(s.hx + dir * 70 * H0.spd * dt, 92, maxX); }
    const steaming = wantSteam && !away; s.steaming = steaming; s.near = front && front.x - s.hx < 16;
    // heat builds where you steam and bleeds off when you stop. Rod's steadier hands spread it out.
    if (steaming) {
      s.heat += dt * (0.42 + s.diff * 0.06) / H0.grip;
      if (front && front.x - s.hx < 16) { const m = dt / front.max; front.hp -= m; s.bucket += m * 0.55 * (1 + s.diff * 0.1); if (s.rnd() < dt * 8) s.drips.push({ x: s.hx, v: 0 }); if (front.hp <= 0) { s.melted++; POP(s, 240, 110, 'CRACK!', '#9fe0ff'); SFX('drain'); } }
      if (s.rnd() < dt * 20) s.puffs.push({ x: s.hx + 6, y: 150, l: 0.6 });
    } else if (!away) s.heat = Math.max(0, s.heat - dt * 0.38);
    if (s.heat >= 1 && s.inv <= 0) { s.pants--; s.soft++; s.inv = 1; s.heat = 0.55; s.shake = 0.3; POP(s, 240, 120, "PIPE'S GOING SOFT!", '#e9665a'); }
    if (s.bucket >= 1 && !s.mop) { s.spill++; s.bucket = 0; s.mop = 1; s.shake = 0.4; SFX('splash'); POP(s, 240, 100, 'BUCKET RAN OVER! MOP IT UP!', '#e9665a'); }   /* forgot the bucket: water on the basement floor */
    for (const d of s.drips) { d.v += dt * 140; d.x -= d.v * dt; } s.drips = s.drips.filter(d => d.x > 74);
    for (const p of s.puffs) { p.l -= dt; p.y -= dt * 30; p.x += dt * 10; } s.puffs = s.puffs.filter(p => p.l > 0);
    FX(s, dt);
    if (s.pants <= 0) s.end = { win: false, stars: 0, line: 'Cooked the pipe. Now it needs a new one.' };
    else if (!front && !s.mop) s.end = { win: true, stars: stars3(s.soft + s.spill === 0 && s.t < s.DUR * 0.75, s.soft + s.spill <= 1), line: s.spill ? `Line is open. Mopped the floor ${s.spill} time${s.spill > 1 ? 's' : ''}.` : s.soft ? 'Line is open. Pipe got a little warm.' : 'Line is open. Not a drop on the floor.' };
    else if (s.t >= s.DUR) s.end = { win: false, stars: 0, line: s.spill ? 'Still frozen, and the floor is soaked.' : 'Still frozen. Doreen is pouring hot water down it again.' };
  },
  draw(s) {   /* the steam nozzle's view up the frozen line */
    const PX = 10, oy = 0.3, hot = Math.max(0, s.heat - 0.5) * 2;
    const plugs = s.ice.map((c, i2) => c.hp > 0 ? { f: Math.max(0.12, (c.x - s.hx) / PX), hole: Math.min(0.9, (1 - c.hp) * 1.05), kind: 'ice', seed: i2 + 2 } : null).filter(Boolean);
    R(0, 0, W, H, '#050605');
    TUNNEL.draw({ D: s.hx / PX, t: s.t, pvc: true, ox: 0, oy, plugs, frost: 0.55, water: 0.2 + Math.min(0.25, s.bucket * 0.2), flow: -1 }, 0, 0);
    if (hot > 0) { const gr = g.createRadialGradient(240, 220, 20, 240, 200, 260); gr.addColorStop(0, `rgba(255,120,40,${0.35 * hot})`); gr.addColorStop(1, 'rgba(255,60,20,0)'); g.fillStyle = gr; g.fillRect(0, 16, W, H); }   /* the pipe going soft */
    TUNNEL.vignette(0.5);
    // steam rolling off the nozzle
    for (const p of s.puffs) { const age = 0.6 - p.l, a = Math.max(0, p.l / 0.6) * 0.2, rr = 12 + age * 90, px = 240 + Math.sin(p.x * 7.1) * 40 * age * 2, py = 210 - age * 150;
      g.fillStyle = `rgba(240,244,248,${a})`; g.beginPath(); g.arc(px, py, rr, 0, 7); g.fill(); }
    // the steam hose and brass nozzle
    g.strokeStyle = '#1e1e22'; g.lineWidth = 14; g.beginPath(); g.moveTo(240, H + 10); g.lineTo(240, 232); g.stroke();
    R(231, 218, 18, 16, '#b8862e'); R(231, 218, 18, 3, '#e0b45a'); R(236, 212, 8, 7, '#9a6e22');
    if (s.steaming && !s.near && Math.floor(s.t * 3) % 2) T('GET CLOSER TO THE ICE ▶', 240, 64, '#f7c418', 7, 'center');
    // the bucket under the cleanout, down in the corner (tap it or ▼ to swap)
    const bx = 14, by = 204; R(bx - 4, by - 8, 92, 60, 'rgba(0,0,0,.55)');
    if (s.swap > 0 || s.mop > 0) g.globalAlpha = 0.3;
    { const lv = Math.min(1, s.bucket), col = lv > 0.8 ? '#e9665a' : lv > 0.6 ? '#f7c418' : '#7fc4ff';   /* the bucket, cut away so you can see the water level, with a gauge beside it */
      R(bx + 4, by + 6, 32, 38, '#c45f1e'); R(bx + 6, by + 8, 28, 34, '#3a2a20'); R(bx + 6, by + 42 - 34 * lv, 28, 34 * lv, col); R(bx + 6, by + 42 - 34 * lv, 28, 2, '#e8f6ff');
      R(bx + 2, by + 4, 36, 3, '#e8762b'); for (let q = 1; q < 4; q++) R(bx + 34, by + 42 - 34 * q / 4, 3, 1, '#fff');   /* rim and quarter marks */
      T(Math.round(lv * 100) + '%', bx + 62, by + 14, col, 7, 'center'); }
    g.globalAlpha = 1; T('▼ DUMP', bx + 62, by + 34, '#cfd8e0', 5, 'center');
    if (s.bucket > 0.7 && !s.swap && !s.mop && Math.floor(s.t * 4) % 2) { T('!', bx + 20, by - 2, '#e9665a', 10, 'center'); T("BUCKET'S ALMOST FULL! STOP AND DUMP IT ▼", 240, 78, '#e9665a', 6, 'center'); }
    if (s.swap > 0 || s.mop > 0) {   /* off the job: out to dump the bucket, or on the floor with the mop */
      R(0, 16, W, H - 16, 'rgba(8,10,14,.72)'); const pw = 300, px0 = 90, py0 = 90; R(px0, py0, pw, 110, '#1b222c'); R(px0, py0, pw, 3, '#f7c418'); R(px0, py0 + 107, pw, 3, '#0e1218');
      const who = s.hero || 'rod';
      if (s.swap > 0) { const f = 1 - s.swap / s.SWAP, out = f < 0.5, x = out ? px0 + 30 + f * 2 * (pw - 60) : px0 + pw - 30 - (f - 0.5) * 2 * (pw - 60), fr = Math.abs(f - 0.5) < 0.05 ? 6 : WALK(who, s.t, 6);   /* side-on walk cycle */
        T(f < 0.45 ? 'CARRYING IT OUT THE BULKHEAD...' : f < 0.55 ? 'DUMP!' : 'HEADING BACK DOWN...', px0 + pw / 2, py0 + 14, '#f7c418', 7, 'center');
        R(px0 + 12, py0 + 92, pw - 24, 2, '#3a4250'); R(px0 + pw - 34, py0 + 40, 22, 52, '#5a4a3a'); R(px0 + pw - 30, py0 + 44, 14, 44, '#8ec6e8');   /* the bulkhead door, daylight */
        SPR(who, fr, x, py0 + 94, !out && fr >= 9, 1.6); if (out) SPI('bucket', x + 12, py0 + 92, 0.6); else SPI('bucket', x - 12, py0 + 92, 0.6);
        if (Math.abs(f - 0.5) < 0.06) for (let i2 = 0; i2 < 8; i2++) R(px0 + pw - 44 + Math.random() * 20, py0 + 60 + Math.random() * 30, 3, 3, '#7fc4ff');
        BAR(px0 + 20, py0 + 100, pw - 40, 4, f, '#7fc4ff', ''); }
      else { T('BUCKET RAN OVER! MOP IT UP', px0 + pw / 2, py0 + 14, '#e9665a', 7, 'center'); T('TAP SPACE / TAP THE SCREEN', px0 + pw / 2, py0 + 28, '#cfd8e0', 5, 'center');
        g.fillStyle = 'rgba(110,170,220,.8)'; g.beginPath(); g.ellipse(px0 + pw / 2, py0 + 84, 110 * s.mop + 10, 12 * s.mop + 2, 0, 0, 7); g.fill();
        SPR(who, (s.mopT || 0) > 0 ? 3 : 0, px0 + pw / 2 - 60, py0 + 94, false, 1.6);
        g.strokeStyle = '#c9a66b'; g.lineWidth = 3; const ma = (s.mopT || 0) > 0 ? 0.5 : -0.3; g.beginPath(); g.moveTo(px0 + pw / 2 - 50, py0 + 40); g.lineTo(px0 + pw / 2 - 30 + Math.sin(ma) * 30, py0 + 86); g.stroke(); R(px0 + pw / 2 - 40 + Math.sin(ma) * 30, py0 + 84, 22, 6, '#e8e4d8');   /* the mop */
        BAR(px0 + 20, py0 + 100, pw - 40, 4, 1 - s.mop, '#7dffb0', ''); } }
    DRAWFX(s);
    HUD(s, `THAW IT OUT  ${s.melted}/${s.ice.length}`, s.DUR - s.t); PANTS(s, 6, 22);
    BAR(330, 26, 140, 6, s.heat, s.heat > 0.8 ? '#e9665a' : '#f39c12', 'PIPE HEAT');
    BAR(330, 44, 140, 6, s.bucket, s.bucket > 0.8 ? '#e9665a' : '#7fc4ff', 'BUCKET');
  },
});

if (typeof module !== 'undefined') module.exports = { GAMES, HEROES, srSolid: typeof srSolid !== 'undefined' ? srSolid : null, setCtx: c => { g = c; } };
