// =====================================================================
// PLACEHOLDER ART — procedural backdrops, customers and portraits.
// Swap any of these for real pixel art later (480x270 backgrounds, 80x80 portraits).
// Needs the engine globals: g, W, H, R, E, T.
// =====================================================================
function srand(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const pick = (r, a) => a[Math.floor(r() * a.length)];
const SKIN = ['#f1c9a5', '#e0ac85', '#c68863', '#9a6544', '#6e4630', '#f6d7bd'];
const HAIR = ['#2a1d14', '#5a3a22', '#8a5a2e', '#c9a050', '#d9d4ca', '#7a2e1e', '#111'];
const SHIRT = ['#2c6cd6', '#c0392b', '#2e8a3a', '#7a2d5a', '#d08a30', '#4a4a52', '#2b6f7a', '#8a6a3a'];
function season(month) { const n = DDT.seasonPal(month).name; return n === 'winter' || n === 'thaw' ? 'winter' : n === 'fall' || n === 'early fall' ? 'fall' : 'summer'; }
function placeholderTag() { T('PLACEHOLDER ART', 474, 26, 'rgba(255,255,255,.35)', 5, 'right', false); }

// ---------- customers ----------
function custLook(seed) {
  const r = srand(seed * 9973 + 7);
  return { skin: pick(r, SKIN), hair: pick(r, HAIR), shirt: pick(r, SHIRT), style: Math.floor(r() * 5), glasses: r() < 0.35, beard: r() < 0.3, pants: pick(r, ['#2a3346', '#4a3a2a', '#3a3a3a', '#5a6a7a']) };
}
// ---------- CUSTOMER SPRITE BUILDER ----------
// Every customer is built from their seed: height, build, skin, hair style + color, facial hair, glasses, top, bottoms, shoes.
// Poses: idle (breathing, blinking), talk (mouth moves while they're the one speaking), walk (when they move), wave, upset (arms up, shaking), happy (smile + little bounce).
// Drawn in half-units for more detail; feet at (x, y).
const CUST_MV = {};
function custBuild(seed) {
  const r = srand(seed * 7919 + 13), L = custLook(seed);   // L is what their portrait is drawn from, so the two match: same hair, beard, glasses, shirt
  const tops = ['tee', 'flannel', 'hoodie', 'sweater', 'polo', 'jacket'], bots = ['jeans', 'khaki', 'sweats', 'jeans'];
  return { ...L, h: 72 + Math.floor(r() * 12), build: Math.floor(r() * 3), top: tops[Math.floor(r() * tops.length)], bot: bots[Math.floor(r() * bots.length)],
    hairStyle: ['bald', 'short', 'long', 'bun', 'cap'][L.style] || 'short', face: L.beard ? 'beard' : 'none',
    shoe: ['#222', '#5a3a1c', '#e8e4d8', '#3a4a6a'][Math.floor(r() * 4)], accent: ['#c0392b', '#2c6cd6', '#2e8a3a', '#f2c94c', '#e8e4d8'][Math.floor(r() * 5)], cap: '#c0392b' };
}
// ---------- DRAWN CUSTOMERS: 15 pixel-art homeowners. Picked by seed, matched to the name (no "Gloria" in a beard), mirrored at random. ----------
const CUST_SEX = 'mffmfmmfmmfmmfx' + 'f'.repeat(30) + 'm'.repeat(30);   // c0..c74 (x = either)
const CUST_F = /^(BEA|BEV|CAROL|DEB|DIANE|DOREEN|ELLEN|GAIL|GLORIA|HELEN|JESS|JUNE|KAYLA|LINDA|MAEVE|MARGE|NANCY|PRIYA|ROSE|SUE|TINA|ANN|MARY|KAREN|BETTY|JEAN|PAM|DOT|LISA|AMY)/;
const CUST_M = /^(ART|BOB|BRENT|BUCK|BUD|DUANE|EARL|ED|FRANK|GRANT|GREG|HAL|JOE|JR|LOU|MIKE|NED|PHIL|RAY|RON|STAN|TODD|TYLER|VERN|WALT|CHEF)/;
const _cimg = {}, CUST_NAME = {};
function custImg(i, face) { const k = 'c' + i + (face ? '_face' : ''); if (k in _cimg) return _cimg[k]; _cimg[k] = null; const im = new Image(); im.onload = () => (_cimg[k] = im); im.src = ART + 'cust/' + k + '.png'; return null; }
function custPick(seed) {
  let nm = CUST_NAME[seed]; if (!nm && typeof JOB !== 'undefined' && JOB && JOB.cust && JOB.cust.seed === seed) nm = CUST_NAME[seed] = String(JOB.cust.name || '').toUpperCase();
  const sex = nm && CUST_F.test(nm) ? 'f' : nm && CUST_M.test(nm) ? 'm' : '';
  const pool = []; for (let i = 0; i < CUST_SEX.length; i++) if (!sex || CUST_SEX[i] === sex || CUST_SEX[i] === 'x') pool.push(i);
  const h = Math.abs((seed * 2654435761) | 0); return { i: pool[h % pool.length], flip: (h >> 5) & 1 };
}
const _cbuild = {};
function customer(x, y, seed, s = 2, mood = 'normal') {
  { const P = custPick(seed), im = custImg(P.i);
    if (!im && !customer.giveUp) { customer.wait = (customer.wait || 0) + 1; if (customer.wait < 1200) return; customer.giveUp = true; }   /* the art is still loading: draw nothing rather than the old blocky stand-in */
    if (im) {   // the drawn homeowner
      const B = _cbuild[seed] || (_cbuild[seed] = custBuild(seed)), now = performance.now(), t = now / 1000, q = s / 2;
      const mv = CUST_MV[seed] || (CUST_MV[seed] = { x, mv: 0, dir: 1 }); if (Math.abs(x - mv.x) > 0.05) { mv.mv = now; mv.dir = x > mv.x ? 1 : -1; } mv.x = x;
      const walking = now - mv.mv < 150, talking = typeof dialog !== 'undefined' && dialog && dialog.shown < dialog.text.length && typeof JOB !== 'undefined' && JOB.cust && dialog.name === JOB.cust.name;
      const shake = mood === 'upset' ? Math.round(Math.sin(t * 16)) : 0, hop = mood === 'happy' ? -Math.abs(Math.sin(t * 5)) * 3 * q : walking ? -Math.abs(Math.sin(t * 10)) * 2 * q : talking ? -Math.abs(Math.sin(t * 8)) * 1 * q : 0;
      const hh = B.h * q * 0.95, ww = im.width * hh / im.height, breathe = 1 + Math.sin(t * 2.2) * 0.008;
      const flip = walking ? mv.dir < 0 : !!P.flip, cx = Math.round(x + shake);
      g.save(); g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(cx, Math.round(y) + 1, ww * 0.38, 3 * q, 0, 0, 7); g.fill();
      g.translate(cx, Math.round(y + hop)); if (flip) g.scale(-1, 1); g.imageSmoothingEnabled = hh < im.height * 0.9; g.imageSmoothingQuality = 'high';
      g.drawImage(im, -ww / 2, -hh * breathe, ww, hh * breathe); g.restore(); g.imageSmoothingEnabled = false;
      return;
    } }
  const B = _cbuild[seed] || (_cbuild[seed] = custBuild(seed)), now = performance.now(), t = now / 1000;
  const mv = CUST_MV[seed] || (CUST_MV[seed] = { x, mv: 0, dir: 1 }); if (Math.abs(x - mv.x) > 0.05) { mv.mv = now; mv.dir = x > mv.x ? 1 : -1; } mv.x = x;
  const walking = now - mv.mv < 150, talking = typeof dialog !== 'undefined' && dialog && dialog.shown < dialog.text.length && typeof JOB !== 'undefined' && JOB.cust && dialog.name === JOB.cust.name;
  const shake = mood === 'upset' ? Math.round(Math.sin(t * 16)) : 0, hop = mood === 'happy' ? -Math.abs(Math.sin(t * 5)) * 3 : 0;
  const breath = walking ? 0 : Math.round(Math.sin(t * 2.2) * 0.6), step = walking ? Math.floor(t * 8) % 4 : -1;
  const SC = customer._c || (customer._c = Object.assign(document.createElement('canvas'), { width: 96, height: 150 })), k = SC.getContext('2d'), G0 = g; k.setTransform(1, 0, 0, 1, 0, 0); k.clearRect(0, 0, 96, 150); k.translate(48, 146);
  { const g = k;   // everything below draws on the scratch canvas (feet at 48,146), in half-units
  const H = B.h, wide = [0, 2, 6][B.build], hw = 13 + wide, legH = Math.round(H * 0.44), torsoH = Math.round(H * 0.3), headH = 22, top = -H + headH;
  const r = (a, b, c, d, col) => { g.fillStyle = col; g.fillRect(a, b, c, d); };
  const dark = col => { const n = parseInt(col.slice(1), 16), f = v => Math.max(0, Math.round(v * 0.72)); return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map(v => v.toString(16).padStart(2, '0')).join(''); };
  // legs (and walking strides)
  const pants = B.bot === 'khaki' ? '#b8a27a' : B.bot === 'sweats' ? '#7a7f88' : B.pants, sh = B.bot === 'shorts';
  const lx = [-hw + 3, 2], swing = step < 0 ? [0, 0] : [[4, -4], [0, 0], [-4, 4], [0, 0]][step];
  for (let k = 0; k < 2; k++) { const ox = lx[k] + swing[k], lw = 10 + Math.floor(wide / 2);
    r(ox, -legH, lw, sh ? legH * 0.45 : legH - 4, k ? pants : dark(pants)); if (sh) r(ox + 1, -legH * 0.55, lw - 2, legH * 0.55 - 4, B.skin);
    r(ox - 1, -5, lw + 3, 5, B.shoe); r(ox - 1, -2, lw + 3, 2, dark(B.shoe)); }
  // torso
  const ty = -legH - torsoH + breath, shirt = B.shirt;
  r(-hw, ty, hw * 2, torsoH + 3, shirt);
  if (B.top === 'flannel') { for (let i = -hw; i < hw; i += 6) r(i, ty, 2, torsoH + 3, dark(shirt)); for (let j = ty + 3; j < ty + torsoH; j += 6) r(-hw, j, hw * 2, 2, dark(shirt)); }
  if (B.top === 'hoodie') { r(-6, ty + 3, 12, 8, dark(shirt)); r(-2, ty + 2, 1, 10, '#ddd'); r(2, ty + 2, 1, 10, '#ddd'); r(-hw + 4, ty + torsoH - 8, hw * 2 - 8, 6, dark(shirt)); }
  if (B.top === 'polo') { r(-5, ty, 10, 4, '#fff'); r(-1, ty + 4, 2, 6, dark(shirt)); }
  if (B.top === 'sweater') { r(-hw, ty + torsoH - 2, hw * 2, 4, dark(shirt)); r(-6, ty, 12, 3, dark(shirt)); }
  if (B.top === 'jacket') { r(-1, ty, 2, torsoH + 3, dark(shirt)); r(-hw, ty, 4, torsoH + 3, dark(shirt)); r(hw - 4, ty, 4, torsoH + 3, dark(shirt)); }
  if (B.top === 'tank') { r(-hw, ty, 5, 6, B.skin); r(hw - 5, ty, 5, 6, B.skin); }
  if (B.top === 'tee') r(-5, ty + 6, 10, 6, B.accent);   // a logo on the shirt
  r(-hw, -legH, hw * 2, 3, dark(pants));   // belt line
  // arms: by the sides; swinging when walking; up and shaking when upset; one hand waving when happy; gesturing while talking
  const armW = 7, sleeve = B.top === 'tank' ? B.skin : shirt, ay = ty + 2;
  const talkA = talking ? Math.round(Math.sin(t * 7) * 3) : 0;
  for (const side of [-1, 1]) { const ax = side < 0 ? -hw - armW + 1 : hw - 1;
    if (mood === 'upset') { r(ax, ay - 16, armW, 18, sleeve); r(ax, ay - 20, armW, 5, B.skin); }
    else if (mood === 'happy' && side > 0) { const w = Math.round(Math.sin(t * 9) * 3); r(ax + w, ay - 16, armW, 18, sleeve); r(ax + w, ay - 21, armW, 6, B.skin); }
    else { const sw = walking ? (side > 0 ? swing[0] : swing[1]) * 0.6 : (side > 0 ? talkA : 0); r(ax + sw, ay + (side > 0 && talking ? -talkA : 0), armW, torsoH - 2, sleeve); r(ax + sw, ay + torsoH - 3 + (side > 0 && talking ? -talkA : 0), armW, 5, B.skin); } }
  // head
  const hy = top - headH + breath, hx = -9;
  r(-3, hy + headH - 2, 6, 4, B.skin);   // neck
  r(hx, hy, 18, headH, B.skin); r(hx - 2, hy + 8, 2, 5, B.skin); r(hx + 18, hy + 8, 2, 5, B.skin);   // face + ears
  const hc = B.hair, hs = B.hairStyle;
  if (hs === 'short' || hs === 'curly' || hs === 'ponytail' || hs === 'bun' || hs === 'long') r(hx - 1, hy - 2, 20, 7, hc);
  if (hs === 'curly') for (let i = 0; i < 6; i++) r(hx - 2 + i * 4, hy - 4 + (i % 2) * 2, 4, 4, hc);
  if (hs === 'long') { r(hx - 3, hy, 4, headH + 8, hc); r(hx + 17, hy, 4, headH + 8, hc); }
  if (hs === 'ponytail') { r(hx + 17, hy + 4, 5, 6, hc); r(hx + 20, hy + 8, 4, 12, hc); }
  if (hs === 'bun') r(hx + 4, hy - 8, 10, 7, hc);
  if (hs === 'buzz') r(hx, hy - 1, 18, 3, dark(hc));
  if (hs === 'cap') { r(hx - 1, hy - 3, 20, 7, B.cap); r(hx + 12, hy + 2, 12, 3, dark(B.cap)); }
  if (hs === 'beanie') { r(hx - 1, hy - 5, 20, 9, B.cap); r(hx - 1, hy + 2, 20, 2, dark(B.cap)); r(hx + 7, hy - 8, 4, 3, '#eee'); }
  // face: eyes (blink), brows, mouth (moves while talking), facial hair, glasses
  const blink = Math.floor(t * 0.7 + seed) % 5 === 0 && (t * 0.7 + seed) % 1 < 0.08, ey = hy + 9;
  if (blink) { r(hx + 4, ey + 1, 4, 1, '#1a1a1a'); r(hx + 11, ey + 1, 4, 1, '#1a1a1a'); }
  else { r(hx + 4, ey, 3, 3, '#1a1a1a'); r(hx + 11, ey, 3, 3, '#1a1a1a'); r(hx + 4, ey, 1, 1, '#fff'); r(hx + 11, ey, 1, 1, '#fff'); }
  const brow = hs === 'bald' || hs === 'buzz' ? '#6a5040' : hc;
  if (mood === 'upset') { r(hx + 3, ey - 3, 5, 1, brow); r(hx + 11, ey - 3, 5, 1, brow); r(hx + 7, ey - 2, 1, 1, brow); r(hx + 11, ey - 2, 1, 1, brow); }
  else r(hx + 3, ey - 3, 5, 1, brow), r(hx + 11, ey - 3, 5, 1, brow);
  r(hx + 8, ey + 4, 2, 3, dark(B.skin));   // nose
  const my = hy + 17, open = talking ? [0, 2, 1, 3][Math.floor(t * 12) % 4] : 0;
  if (mood === 'happy') { r(hx + 5, my, 8, 2, '#7a3030'); r(hx + 6, my + 2, 6, 1, '#7a3030'); }
  else if (mood === 'upset') r(hx + 6, my, 6, 3 + open, '#46141a');
  else r(hx + 6, my, 6, 1 + open, '#7a3030');
  if (B.face === 'beard') { r(hx, hy + 13, 18, 9, hc); r(hx + 3, hy + 21, 12, 3, hc); r(hx + 6, my, 6, 1 + open, '#3a1818'); }
  if (B.face === 'mustache') r(hx + 4, my - 2, 10, 2, hc);
  if (B.face === 'stubble') for (let i = 0; i < 8; i++) r(hx + 2 + i * 2, hy + 15 + (i % 2) * 3, 1, 1, dark(B.skin));
  if (B.glasses) { g.strokeStyle = '#222'; g.lineWidth = 1; g.strokeRect(hx + 2.5, ey - 1.5, 6, 5); g.strokeRect(hx + 9.5, ey - 1.5, 6, 5); r(hx + 8, ey, 2, 1, '#222'); }
  // shading: a soft shadow down one side of the body and under the chin, so they read as rounded instead of flat
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(4, -H, 40, H); g.fillRect(-9, top - 3, 18, 3); g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(-40, -H, 30, H); g.globalCompositeOperation = 'source-over';
  }
  // stamp it: a dark outline (the silhouette drawn 4 ways), then the figure, like the crew's sprites
  const OC = customer._o || (customer._o = Object.assign(document.createElement('canvas'), { width: 96, height: 150 })), ok = OC.getContext('2d'); ok.clearRect(0, 0, 96, 150); ok.globalCompositeOperation = 'source-over'; ok.drawImage(SC, 0, 0); ok.globalCompositeOperation = 'source-in'; ok.fillStyle = '#1a1410'; ok.fillRect(0, 0, 96, 150);
  const q = s / 2, dx = Math.round(x + shake - 48 * q), dy = Math.round(y + hop - 146 * q), w = 96 * q, h = 150 * q, flipX = walking && mv.dir < 0;
  G0.save(); if (flipX) { G0.translate(Math.round(x + shake) * 2, 0); G0.scale(-1, 1); } G0.imageSmoothingEnabled = q < 1;
  G0.fillStyle = 'rgba(0,0,0,.25)'; G0.beginPath(); G0.ellipse(Math.round(x + shake), Math.round(y) + 1, 13 * q, 3 * q, 0, 0, 7); G0.fill();   // ground shadow
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) G0.drawImage(OC, dx + ox * Math.max(1, q * 0.8), dy + oy * Math.max(1, q * 0.8), w, h);
  G0.drawImage(SC, dx, dy, w, h); G0.imageSmoothingEnabled = false; G0.restore();
}
// 80x80 portrait canvas for the dialog box
const _ports = {};
function custPortrait(seed, mood = 'normal') {
  const key = seed + mood; if (_ports[key]) return _ports[key];
  const P = custPick(seed), paint = (c, f) => { const k = c.getContext('2d'); k.setTransform(1, 0, 0, 1, 0, 0); k.imageSmoothingEnabled = false;
      const gr = k.createLinearGradient(0, 0, 0, 80); gr.addColorStop(0, '#34405a'); gr.addColorStop(1, '#1e2638'); k.fillStyle = gr; k.fillRect(0, 0, 80, 80);
      if (P.flip) { k.translate(80, 0); k.scale(-1, 1); } k.drawImage(f, 0, 0, 80, 80); k.setTransform(1, 0, 0, 1, 0, 0);
      if (mood === 'upset') { k.fillStyle = 'rgba(220,40,30,.16)'; k.fillRect(0, 0, 80, 80); k.fillStyle = '#e9665a'; k.fillRect(64, 6, 3, 9); k.fillRect(70, 8, 3, 7); k.fillRect(64, 18, 3, 3); k.fillRect(70, 18, 3, 3); }
      if (mood === 'happy') { k.fillStyle = 'rgba(255,230,120,.12)'; k.fillRect(0, 0, 80, 80); } return c; };
  { const f = custImg(P.i, true); if (f) { const c = document.createElement('canvas'); c.width = c.height = 80; return (_ports[key] = paint(c, f)); } }
  const L = custLook(seed), c = document.createElement('canvas'); c.width = c.height = 40; const k = c.getContext('2d');
  const r = (x, y, w, h, col) => { k.fillStyle = col; k.fillRect(x, y, w, h); };
  r(0, 0, 40, 40, '#2a3346');
  r(4, 32, 32, 8, L.shirt); r(16, 28, 8, 5, L.skin);
  r(11, 9, 18, 21, L.skin); r(9, 17, 2, 5, L.skin); r(29, 17, 2, 5, L.skin);
  if (L.style === 1) r(10, 7, 20, 5, L.hair);
  if (L.style === 2) { r(10, 7, 20, 5, L.hair); r(8, 10, 4, 22, L.hair); r(28, 10, 4, 22, L.hair); }
  if (L.style === 3) { r(10, 7, 20, 5, L.hair); r(15, 3, 10, 5, L.hair); }
  if (L.style === 4) { r(9, 6, 22, 6, '#c0392b'); r(5, 10, 8, 3, '#c0392b'); }
  if (L.style === 0) r(12, 9, 16, 2, '#00000022');
  if (L.beard) { r(11, 24, 18, 7, L.hair); r(13, 30, 14, 3, L.hair); }
  const eye = '#1a1a1a';
  if (mood === 'happy') { r(14, 18, 4, 1, eye); r(22, 18, 4, 1, eye); r(16, 25, 8, 2, '#7a3030'); }
  else if (mood === 'upset') { r(15, 18, 2, 3, eye); r(23, 18, 2, 3, eye); r(13, 15, 5, 1, L.hair === '#d9d4ca' ? '#999' : L.hair); r(22, 15, 5, 1, L.hair === '#d9d4ca' ? '#999' : L.hair); r(18, 24, 4, 4, '#46141a'); }
  else { r(15, 18, 2, 2, eye); r(23, 18, 2, 2, eye); r(17, 25, 6, 1, '#7a3030'); }
  if (L.glasses) { k.strokeStyle = '#222'; k.lineWidth = 1; k.strokeRect(13.5, 16.5, 6, 5); k.strokeRect(20.5, 16.5, 6, 5); }
  r(19, 20, 2, 3, '#00000022');
  const big = document.createElement('canvas'); big.width = big.height = 80; const b = big.getContext('2d'); b.imageSmoothingEnabled = false; b.drawImage(c, 0, 0, 80, 80);
  const blank = document.createElement('canvas'); blank.width = blank.height = 80; { const k2 = blank.getContext('2d'), gr = k2.createLinearGradient(0, 0, 0, 80); gr.addColorStop(0, '#34405a'); gr.addColorStop(1, '#1e2638'); k2.fillStyle = gr; k2.fillRect(0, 0, 80, 80); }
  _ports[key] = blank; let tries = 0; const poll = () => { const f = custImg(P.i, true); if (f) paint(blank, f); else if (++tries < 60) setTimeout(poll, 100); else blank.getContext('2d').drawImage(big, 0, 0); }; poll();   /* an empty frame until the drawn face loads; the old face only if it never does */
  return blank;
}

// ---------- art loaded on demand (portraits like ron_smug.png) ----------
const ART = (() => { let b = ''; try { const s = document.currentScript && document.currentScript.src; if (s) b = s.replace(/js\/placeholders\.js.*$/, ''); } catch (e) {} return b + 'assets/'; })();
const _art = {};
function artImg(name) {
  if (name in _art) return _art[name];
  _art[name] = null; const i = new Image(); i.onload = () => (_art[name] = i); i.src = ART + name + '.png'; return null;
}
['ron_smug', 'ron_happy', 'ron_cover'].forEach(artImg);
/* each homeowner's art loads the first time they're needed */

// ---------- RON, GOD OF DRAINS: flowing hair, cape, holding a plunger crackling with lightning ----------
function drawRon(x, y, s = 1) {           // x,y = feet
  const t = performance.now() / 1000;
  g.save(); g.translate(Math.round(x), Math.round(y)); g.scale(s, s);
  g.fillStyle = '#b8262b'; g.beginPath(); g.moveTo(-14, -52); g.quadraticCurveTo(-26 + Math.sin(t * 3) * 3, -20, -22, 0); g.lineTo(18, 0); g.quadraticCurveTo(24, -24, 14, -52); g.fill();  // cape
  R(-8, -18, 7, 18, '#3a3a52'); R(1, -18, 7, 18, '#3a3a52'); R(-9, -2, 8, 3, '#5a3a22'); R(1, -2, 8, 3, '#5a3a22');                          // legs, boots
  R(-12, -50, 24, 32, '#2c4f9c'); R(-12, -24, 24, 4, '#d6b24a'); R(-3, -24, 6, 4, '#f7c418');                                           // tunic, belt
  R(-17, -48, 6, 20, '#e8b48a'); R(11, -60, 6, 22, '#e8b48a');                                                                          // arms (right one raised)
  // the plunger of power
  R(13, -96, 2, 38, '#8a5a2e'); g.fillStyle = '#c0392b'; g.beginPath(); g.ellipse(14, -98, 9, 6, 0, Math.PI, 0); g.fill(); R(5, -99, 18, 2, '#8a1f1a');
  g.strokeStyle = '#bfefff'; g.lineWidth = 1; g.beginPath();
  for (let i = 0; i < 3; i++) { const a = t * 7 + i * 2.1; g.moveTo(14, -104); g.lineTo(14 + Math.cos(a) * 8, -110 + Math.sin(a) * 4); g.lineTo(14 + Math.cos(a) * 14, -118 + Math.sin(a * 1.3) * 6); }
  g.stroke();
  R(-8, -66, 16, 16, '#e8b48a'); R(-10, -70, 20, 6, '#f2c94c'); R(-12, -66, 5, 22, '#f2c94c'); R(7, -66, 5, 22, '#f2c94c');            // head, golden hair
  R(-7, -54, 14, 7, '#e0a83a'); R(-4, -61, 2, 2, '#1a1a1a'); R(2, -61, 2, 2, '#1a1a1a'); R(-3, -56, 6, 1, '#7a3030');                  // beard, eyes, grin
  g.restore();
}
// a customer review: always about Ron
function reviewCard(stars, name, text) {
  R(70, 40, 340, 150, '#f4f1ea'); R(70, 40, 340, 22, '#3a5a8a'); T('NEW REVIEW · MT. WASHINGTON SEWER & DRAIN', 240, 51, '#fff', 5, 'center', false);
  const rp = artImg(stars >= 5 ? 'ron_smug' : 'ron_happy');   // the man himself, every time
  R(80, 70, 60, 60, '#2a3346'); if (rp) g.drawImage(rp, 80, 70, 60, 60); g.strokeStyle = '#f2b01e'; g.lineWidth = 2; g.strokeRect(80, 70, 60, 60);
  T('RON', 110, 140, '#3a5a8a', 6, 'center', false);
  for (let i = 0; i < 5; i++) { g.fillStyle = i < stars ? '#f2b01e' : '#c9c4b8'; g.beginPath(); const cx = 218 + i * 27, cy = 82; for (let k = 0; k < 10; k++) { const r = k % 2 ? 4.5 : 10, a = -Math.PI / 2 + k * Math.PI / 5; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.fill(); }
  wrap(`"${text}"`, 240, 7).forEach((l, i) => T(l, 272, 108 + i * 14, '#2a2a2a', 7, 'center', false));
  T(`— ${name}`, 390, 172, '#5a5a5a', 6, 'right', false);
}
// the magazine cover at the end of each month
function magazineCover(month, head) {
  R(140, 22, 200, 236, '#0e1a2c'); const gr = g.createLinearGradient(0, 22, 0, 258); gr.addColorStop(0, '#2c4f9c'); gr.addColorStop(1, '#0e1a2c'); g.fillStyle = gr; g.fillRect(144, 26, 192, 228);
  T('NORTH COUNTRY', 240, 40, '#f7c418', 7, 'center'); T('PIPES & PLUMBING', 240, 52, '#fff', 6, 'center');
  T(`${month} ISSUE · $4.99`, 240, 64, '#9fb3d9', 4, 'center', false);
  const t = performance.now() / 1000; g.strokeStyle = `rgba(191,239,255,${0.3 + 0.3 * Math.sin(t * 9)})`; g.lineWidth = 2; g.beginPath(); g.moveTo(170, 70); g.lineTo(190, 110); g.lineTo(178, 112); g.lineTo(200, 150); g.stroke();
  // a new Ron every issue: same hair, different mood
  const COVER_RON = ['ron_cover', 'ron_smug', 'ron_happy', 'ron_laugh', 'ron_phone', 'ron_stare', 'ron_suspicious', 'ron_shocked', 'ron_tired', 'ron_confused', 'ron_annoyed', 'ron_neutral'];
  const mi = Math.max(0, ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'].indexOf(String(month).toUpperCase()));
  const rc = artImg(COVER_RON[mi]) || artImg('ron_cover'); g.imageSmoothingEnabled = false;
  if (rc) g.drawImage(rc, 165, 68, 150, 150); else drawRon(256, 218, 1.25);
  R(144, 196, 192, 46, '#000000aa'); T(head[0], 240, 208, '#fff', 8, 'center'); T(head[1], 240, 222, '#f7c418', head[1].length > 16 ? 6 : 8, 'center');
  T('at Mt. Washington Sewer & Drain', 240, 236, '#cfd8e8', 5, 'center', false);
}

// ---------- exteriors ----------
function sky(sea, hour = 9) {
  const P = DDT.seasonPal(typeof MONTH !== 'undefined' ? MONTH : (DDT.get() || {}).month || 0);
  const gr = g.createLinearGradient(0, 0, 0, 200); gr.addColorStop(0, P.sky[0]); gr.addColorStop(1, P.sky[1]);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.fillStyle = P.mtn; g.beginPath(); g.moveTo(0, 140); g.lineTo(90, 70); g.lineTo(170, 120); g.lineTo(260, 60); g.lineTo(380, 125); g.lineTo(480, 90); g.lineTo(480, 200); g.lineTo(0, 200); g.fill();
  if (P.snow || P.name === 'stick season' || P.name === 'mud') { g.fillStyle = '#f4f7fa'; g.beginPath(); g.moveTo(245, 69); g.lineTo(260, 60); g.lineTo(276, 69); g.fill(); g.beginPath(); g.moveTo(80, 78); g.lineTo(90, 70); g.lineTo(100, 78); g.fill(); }
  for (let x = -10, i = 0; x < W; x += 26, i++) {
    if (!P.leaf || i % 3 === 0) { g.fillStyle = P.pine; g.beginPath(); g.moveTo(x, 196); g.lineTo(x + 13, 150 - (x * 7 % 19)); g.lineTo(x + 26, 196); g.fill(); }
    else { g.fillStyle = P.leaf[i % P.leaf.length]; g.beginPath(); g.ellipse(x + 13, 172 - (x * 7 % 13), 14, 20, 0, 0, Math.PI * 2); g.fill(); }
  }
  R(0, 196, W, 74, P.ground);
  for (let x = 0; x < W; x += 9) R(x, 198 + (x * 13 % 5), 2, 3, P.speck);
}
function building(kind, seed, sea) {
  const r = srand(seed + 1), wall = pick(r, ['#e9e4d6', '#c9d6df', '#d9c7a5', '#b8c9a5', '#e2c9c0', '#a7b5c2']), roof = pick(r, ['#5a3b32', '#3a4a5a', '#4a4a4a', '#6b2e2e', '#2e4a3a']);
  const snowRoof = sea === 'winter';
  if (kind === 'trailer') {
    R(130, 150, 230, 52, wall); R(130, 146, 230, 6, roof); for (let x = 150; x < 340; x += 50) R(x, 162, 26, 18, '#3a5a7a');
    R(232, 168, 22, 34, '#7a5a3a'); R(130, 200, 230, 8, '#555'); for (let x = 140; x < 360; x += 30) R(x, 200, 3, 8, '#333');
    if (snowRoof) R(130, 142, 230, 5, '#f4f7fa'); return;
  }
  if (kind === 'hotel') {
    R(80, 70, 320, 136, wall); R(70, 60, 340, 12, roof); for (let y = 84; y < 180; y += 30) for (let x = 96; x < 390; x += 36) R(x, y, 20, 18, '#3a5a7a');
    R(220, 166, 40, 40, '#5a3a22'); R(200, 156, 80, 8, roof); T('HOTEL', 240, 146, '#f7c418', 7, 'center'); if (snowRoof) R(70, 56, 340, 5, '#f4f7fa'); return;
  }
  if (kind === 'business') {
    R(120, 100, 240, 106, wall); R(112, 94, 256, 10, roof); R(140, 140, 70, 50, '#3a5a7a'); R(270, 140, 70, 50, '#3a5a7a'); R(226, 150, 30, 56, '#5a3a22');
    R(170, 112, 140, 18, '#10151f'); T('OPEN', 240, 121, '#7dffb0', 7, 'center'); if (snowRoof) R(112, 90, 256, 5, '#f4f7fa'); return;
  }
  if (kind === 'campground') {
    for (let i = 0; i < 4; i++) { const x = 40 + i * 110; g.fillStyle = pick(r, ['#2e8a6a', '#d08a30', '#c0392b', '#2c6cd6']); g.beginPath(); g.moveTo(x, 200); g.lineTo(x + 30, 160); g.lineTo(x + 60, 200); g.fill(); }
    R(330, 130, 110, 72, '#8a6a4a'); R(322, 124, 126, 8, roof); T('BATHHOUSE', 385, 150, '#fff', 5, 'center'); R(374, 168, 22, 34, '#4a3020'); return;
  }
  const camp = kind === 'camp', farm = kind === 'farm';
  const x0 = camp ? 170 : 150, w = camp ? 150 : 190, wl = camp ? '#8a6a4a' : farm ? '#b8433a' : wall;
  R(x0, 108, w, 98, wl); for (let y = 112; y < 206; y += 6) R(x0, y, w, 1, '#00000018');
  g.fillStyle = roof; g.beginPath(); g.moveTo(x0 - 10, 110); g.lineTo(x0 + w / 2, 58); g.lineTo(x0 + w + 10, 110); g.fill();
  if (snowRoof) { g.fillStyle = '#f4f7fa'; g.beginPath(); g.moveTo(x0, 104); g.lineTo(x0 + w / 2, 58); g.lineTo(x0 + w, 104); g.lineTo(x0 + w - 10, 104); g.lineTo(x0 + w / 2, 64); g.lineTo(x0 + 10, 104); g.fill(); }
  R(x0 + 26, 130, 26, 30, '#3a5a7a'); R(x0 + w - 52, 130, 26, 30, '#3a5a7a'); R(x0 + w / 2 - 13, 148, 26, 58, '#6a2e2e'); R(x0 + w / 2 + 7, 176, 3, 3, '#d6b24a');
  if (farm) { R(370, 120, 80, 86, '#a8382e'); g.fillStyle = '#5a2a22'; g.beginPath(); g.moveTo(364, 122); g.lineTo(410, 92); g.lineTo(456, 122); g.fill(); R(396, 160, 28, 46, '#fff'); for (let x = 20; x < 140; x += 18) R(x, 186, 2, 16, '#8a6a4a'); R(20, 190, 120, 2, '#8a6a4a'); }
}
// ---------- real house art: 5 shapes, siding recolored per customer, small details on top ----------
// business + camp fronts (real art); door = where the customer stands
const EXT_ART = {
  business: [{ n: 'bg_diner', door: [322, 196] }, { n: 'bg_shop', door: [243, 226] }],
  camp: [{ n: 'bg_camp2', door: [349, 212] }, { n: 'bg_camp3', door: [205, 196] }],
};
for (const k in EXT_ART) EXT_ART[k].forEach(a => artImg(a.n));
const HOUSES = [{ n: 1, door: [310, 196] }, { n: 2, door: [288, 202] }, { n: 3, door: [315, 182] }, { n: 4, door: [315, 191] }, { n: 5, door: [356, 204] }];
const SIDING = [null, '#f2e6c8', '#e8c35a', '#a8322c', '#8fa37a', '#6f8fb0', '#9a9a96', '#7a5a3e', '#5f8f8a'];   // null = leave it white
let EXT_DOOR = { x: 260, y: 210 };   // where the customer stands, set by exterior()
const _houseC = {};
HOUSES.forEach(h => { artImg('bg_house' + h.n); artImg('bg_house' + h.n + '_siding'); });
function houseArt(seed) {
  const h = HOUSES[seed % HOUSES.length], base = artImg('bg_house' + h.n), sid = artImg('bg_house' + h.n + '_siding');
  if (!base) return null;
  const ci = 0, key = h.n + '_' + ci;   // siding recolor is OFF: the masks bled into clouds and window trim. The houses keep their painted colors.
  if (_houseC[key]) return { img: _houseC[key], h };
  if (ci && !sid) return { img: base, h };
  const c = document.createElement('canvas'); c.width = 480; c.height = 270; const k = c.getContext('2d'); k.drawImage(base, 0, 0);
  if (ci) {   // multiply the siding's shading by the paint color, then clip it back to the siding
    const t = document.createElement('canvas'); t.width = 480; t.height = 270; const tk = t.getContext('2d');
    tk.drawImage(sid, 0, 0); tk.globalCompositeOperation = 'multiply'; tk.fillStyle = SIDING[ci]; tk.fillRect(0, 0, 480, 270);
    tk.globalCompositeOperation = 'destination-in'; tk.drawImage(sid, 0, 0); k.drawImage(t, 0, 0);
  }
  return { img: (_houseC[key] = c), h };
}
function houseDetails(seed, month, h) {
  const r = srand(seed + 77), [dx, dy] = h.door;
  // mailbox with the house number, out by the road
  R(450, 214, 2, 18, '#5a3e26'); R(443, 206, 16, 9, ['#2a2a2a', '#3a5a8a', '#8a2a24', '#d9d4c8'][seed % 4]); R(457, 202, 2, 6, '#c0392b');
  { const mb = ['#2a2a2a', '#3a5a8a', '#8a2a24', '#d9d4c8'][seed % 4]; R(442, 205, 18, 11, mb); R(442, 205, 18, 2, 'rgba(255,255,255,.25)'); T(String(10 + seed % 190), 451, 211, seed % 4 === 3 ? '#222' : '#fff', 4, 'center', false); }   // the house number, on the mailbox itself
  if (r() < 0.5) { R(dx + 34, dy - 46, 1, 22, '#ccc'); R(dx + 35, dy - 46, 12, 8, '#b22234'); R(dx + 35, dy - 46, 5, 4, '#3c3b6e'); for (let i = 0; i < 3; i++) R(dx + 35, dy - 45 + i * 2.5, 12, 1, '#fff'); }   // flag
  if (r() < 0.4) { const bx = dx - 52, by = dy + 16; E(bx, by, 4, 4, '#222'); E(bx + 12, by, 4, 4, '#222'); R(bx, by - 5, 12, 2, ['#e85a8a', '#4ab0e0', '#7bd65b'][seed % 3]); R(bx + 10, by - 8, 2, 4, '#555'); }   // kid's bike
  if (r() < 0.4) { const wx = h.n === 3 ? 140 : dx - 90; for (let j = 0; j < 3; j++) for (let i = 0; i < 6 - j; i++) E(wx + i * 5 + j * 2.5, dy + 6 - j * 4, 2.6, 2.6, i % 2 ? '#8a5a2e' : '#a8743e'); }   // woodpile
  if (month === 11) { E(dx, dy - 22, 5, 5, '#2e6b34'); E(dx, dy - 22, 2, 2, '#1e4a24'); R(dx - 1, dy - 17, 3, 2, '#c0392b'); }   // wreath in December
}
function seasonOver(month) {   // until the winter/fall versions exist, dress the summer art for the season
  const P = DDT.seasonPal(month);
  if (P.snow) { g.fillStyle = 'rgba(150,175,205,.28)'; g.fillRect(0, 0, W, H); g.fillStyle = '#eef3f8'; g.fillRect(0, 203, W, 67); for (let x = 0; x < W; x += 6) R(x, 199 + (x * 13 % 5), 6, 5, '#eef3f8');   // solid snow: you can't see the lawn through it
    for (let i = 0; i < 26; i++) { const x = (i * 83) % W, y = 210 + (i * 37) % 54; R(x, y, 14 + (i * 7) % 16, 2, '#dfe7ef'); R(x + 3, y - 1, 8, 1, '#fff'); } }   // drifts and shadows
  else if (P.name === 'mud' || P.name === 'stick season') { g.fillStyle = 'rgba(110,90,60,.30)'; g.fillRect(0, 195, W, 75); g.fillStyle = 'rgba(120,110,100,.18)'; g.fillRect(0, 0, W, 195); }
}
function exterior(kind, seed, month) {
  if (kind === 'house') { const a = houseArt(seed); if (a) { g.drawImage(a.img, 0, 0); seasonOver(month); houseDetails(seed, month, a.h); EXT_DOOR = { x: a.h.door[0], y: a.h.door[1] + 10 };
    if (DDT.seasonPal(month).snow) { const t = performance.now() / 1000; for (let i = 0; i < 50; i++) R((i * 97 + Math.sin(t + i) * 8) % W, (i * 53 + t * (8 + i % 9)) % H, 1, 1, '#fff'); } return; } }
  if (EXT_ART[kind]) { const a = EXT_ART[kind][seed % EXT_ART[kind].length], img = artImg(a.n);
    if (img) { g.drawImage(img, 0, 0); seasonOver(month); EXT_DOOR = { x: a.door[0], y: a.door[1] + 10 }; return; } }
  EXT_DOOR = { x: 260, y: 210 };
  const sea = season(month); sky(sea); building(kind, seed, sea); if (sea === 'winter') { const t = performance.now() / 1000; for (let i = 0; i < 50; i++) R((i * 97 + Math.sin(t + i) * 8) % W, (i * 53 + t * (8 + i % 9)) % H, 1, 1, '#fff'); } placeholderTag(); }

// ---------- interiors ----------
// real room art: one of several versions per room type, picked by the customer (or forced with JOB.roomArt)
const ROOM_ART = {
  basement: ['bg_basement1', 'bg_basement2', 'bg_basement3', 'bg_basement4', 'bg_basement5'],
  bathroom: ['bg_bathroom1', 'bg_bathroom2', 'bg_bathroom5'],          // kids' (4) and camp (3) baths are picked per job
  kitchen: ['bg_kitchen1', 'bg_kitchen2'],                             // the holiday kitchen (3) is December's
  yard: ['bg_yard1', 'bg_yard2', 'bg_yard3'],
};
for (const k in ROOM_ART) ROOM_ART[k].forEach(artImg);
['bg_bathroom3', 'bg_bathroom4', 'bg_kitchen3', 'bg_commkitchen'].forEach(artImg);
const roomHasArt = kind => !!ROOM_ART[kind];
// the right room for the right job: camp jobs get the camp bathroom, restaurants get the commercial kitchen
function roomArtFor(job) {
  if (job.roomArt) return job.roomArt;
  if (job.ext === 'camp' && job.room === 'bathroom') return 'bg_bathroom3';
  if (job.ext === 'business' && (job.room === 'kitchen' || job.room === 'basement')) return 'bg_commkitchen';
  return null;
}
function interior(kind, seed, month, art) {
  if (ROOM_ART[kind]) { const L = ROOM_ART[kind], img = artImg(art || L[seed % L.length]); if (img) { g.drawImage(img, 0, 0); return; } }
  const r = srand(seed + 3);
  if (kind === 'yard') { sky(season(month)); R(300, 186, 34, 12, '#7a7f86'); E(317, 190, 14, 5, '#8a8f97'); T('LID?', 317, 176, '#f7c418', 5, 'center'); placeholderTag(); return; }
  if (kind === 'crawl') { R(0, 0, W, H, '#1a1612'); R(0, 0, W, 60, '#2a2420'); for (let x = 0; x < W; x += 30) R(x, 0, 6, 60, '#3a3028'); R(0, 150, W, 120, '#3a2a1e'); R(260, 70, 160, 8, '#555'); R(270, 78, 8, 30, '#555'); E(274, 112, 6, 3, '#4a3218'); T('DETACHED', 300, 96, '#e9665a', 5, 'center'); placeholderTag(); return; }
  const wall = pick(r, ['#c9d6df', '#e2d9c0', '#d9c7c0', '#b8c9b5', '#e9e4d6']);
  if (kind === 'basement') {
    R(0, 0, W, H, '#4a4a50'); for (let y = 0; y < 172; y += 14) for (let x = (y / 14 % 2) * 20; x < W; x += 40) R(x, y, 39, 13, '#55555c');
    R(0, 172, W, 98, '#3c3a38'); for (let i = 0; i < 8; i++) R(10 + i * 12, 46 + i * 16, 40, 4, '#6b5a40');
    R(360, 60, 44, 112, '#b9bec6'); R(436, 20, 14, 152, '#2b2b2b'); R(450, 140, 16, 14, '#b87333'); E(240, 172, 10, 3, '#222'); T('FLOOR DRAIN', 240, 162, '#9fb3d9', 4, 'center', false);
  } else if (kind === 'bathroom') {
    R(0, 0, W, 172, wall); R(0, 120, W, 52, '#e8ecf2'); for (let x = 0; x < W; x += 16) R(x, 120, 1, 52, '#c9ced6'); R(0, 172, W, 98, '#9aa3ad');
    for (let x = 0; x < W; x += 24) R(x, 172, 1, 98, '#8a939d');
    R(270, 128, 30, 44, '#f2f2f2'); E(285, 140, 18, 8, '#fafafa'); R(276, 98, 20, 30, '#f2f2f2'); R(100, 110, 60, 50, '#f2f2f2'); R(104, 114, 52, 14, '#c9ced6'); R(114, 60, 32, 40, '#9fd0e0'); R(360, 90, 100, 82, '#e8ecf2'); R(360, 86, 100, 4, '#c9ced6');
  } else if (kind === 'kitchen') {
    R(0, 0, W, 172, wall); R(0, 172, W, 98, pick(r, ['#8a6a4a', '#9aa3ad', '#6a5a4a']));
    R(40, 120, 400, 52, pick(r, ['#5a3a22', '#e9e4d6', '#2e4a5a'])); R(40, 114, 400, 8, '#d9d4ca'); R(220, 108, 50, 8, '#9aa3ad'); R(242, 92, 4, 16, '#9aa3ad');
    R(40, 40, 140, 50, '#6a4a2a'); R(300, 40, 140, 50, '#6a4a2a'); R(196, 30, 90, 60, '#9fd0e0');
  }
  placeholderTag();
}
// storefront for food stops
function storefront(stop) {
  sky('summer'); R(110, 90, 260, 116, stop.color || '#5a5a62'); R(100, 84, 280, 10, '#2a2a2a');
  R(140, 132, 70, 56, '#3a5a7a'); R(270, 132, 70, 56, '#3a5a7a'); R(224, 140, 32, 66, '#3a2a1a');
  R(130, 100, 220, 24, '#10151f'); T(stop.name, 240, 112, stop.sign || '#fff', stop.name.length > 14 ? 6 : 8, 'center');
  placeholderTag();
}
function counterRoom(stop) {
  R(0, 0, W, H, '#2a2620'); R(0, 0, W, 160, stop.color || '#5a5a62'); R(60, 30, 360, 60, '#10151f'); T(stop.name, 240, 48, stop.sign || '#fff', 8, 'center');
  T('MENU', 240, 70, '#9fb3d9', 6, 'center'); R(0, 140, W, 60, '#6b4a2a'); R(0, 136, W, 6, '#8a6a4a'); R(380, 112, 40, 24, '#c9ced6'); placeholderTag();
}
