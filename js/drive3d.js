// =====================================================================
// DOO DOO TOWN — the drive to the job, OutRun / Lotus Turbo style.
// Pseudo-3D two-lane North Country highway: curves, frost heaves, slow
// trucks to pass, oncoming traffic in the other lane, moose, leaf peepers,
// seasons. drive3d(choice, opts) -> Promise<{ mins, crashes }>
//   choice 0 slow & steady · 1 normal · 2 hammer down
//   opts: { leave, due, from, to, route, clock(min) }
// Keyboard: ◀ ▶ steer · ▲ gas · ▼ brake.  Phone: hold the left/right side to steer,
// GAS / BRAKE buttons in the bottom corners (it cruises on its own).
// =====================================================================
function drive3d(choice, opts) {
  const SEA = DDT.seasonPal((DDT.get() || {}).month || 0);
  const FALL = SEA.name === 'early fall' || SEA.name === 'fall', SNOW = SEA.snow;
  const W = 480, H = 270, HORIZON = 96;
  const rc = document.getElementById('road'), r = rc.getContext('2d');
  const RS = 2;   // render at 2x (960x540) instead of 3x: less than half the pixels to paint each frame, same pixel-art look
  rc.width = 480 * RS; rc.height = 270 * RS; r.setTransform(RS, 0, 0, RS, 0, 0); r.imageSmoothingEnabled = false; rc.style.display = 'block';

  // ---------- tuning ----------
  const SEG = 200, ROADW = 1100, LANES = 2, DRAW = 140, CAMH = 900, DEPTH = 0.84, STEP = 1 / 60;
  const MAX = SEG / STEP, MPH = MAX / 72;                   // 12000 units/s = 72 mph on the dial
  // who's driving decides the top speed: Rod tops out at 40, Matt at 60
  const DRIVER = (opts.driver || ((DDT.get() || {}).today || {}).lead || 'rod') === 'matt' ? 'matt' : 'rod', TOP = (DRIVER === 'matt' ? 60 : 40) * MPH;
  // slow & steady = relaxed but long · normal = normal · hammer down = hard (more traffic, more critters, everyone's in a hurry)
  const MODE = [{ cruise: 0.72, cars: 6, onc: 0.35, crit: 3, blink: 0.015, trucks: 0.15 },     // cars = how many are around you at once
                { cruise: 0.86, cars: 9, onc: 0.4, crit: 5, blink: 0.03, trucks: 0.25 },
                { cruise: 1.0, cars: 10, onc: 0.4, crit: 8, blink: 0.05, trucks: 0.3 }][choice];
  const CRUISE = MODE.cruise * TOP * (choice === 2 ? 0.92 : 1), BOOST = TOP;
  const LANE = [-2 / 3, 0, 2 / 3];                           // left lane = oncoming · the two on the right go our way
  const TRACK = 1450;                                        // ~35-65 s depending on driver and mode
  const PZ = CAMH * DEPTH;                                   // player's distance in front of the camera
  const MIN_PER_S = 0.7;                                     // the clock runs a bit slower than real time so a longer drive isn't automatically late

  // ---------- build the road ----------
  const segs = [];
  const lastY = () => segs.length ? segs[segs.length - 1].p2.y : 0;
  function add(n, curve, hill) {
    const y0 = lastY();
    for (let i = 0; i < n; i++) {
      const t = i / n, e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const y1 = y0 + hill * (i === 0 ? 0 : (() => { const tp = (i - 1) / n; return tp < .5 ? 2 * tp * tp : 1 - Math.pow(-2 * tp + 2, 2) / 2; })());
      const y2 = y0 + hill * e;
      const k = segs.length;
      segs.push({ i: k, curve: curve * Math.sin(Math.PI * t), p1: { z: k * SEG, y: y1 }, p2: { z: (k + 1) * SEG, y: y2 }, sprites: [], cars: [], dark: Math.floor(k / 3) % 2 });
    }
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16), c = v => Math.max(0, Math.min(255, Math.round(v * f))); return `rgb(${c(n >> 16)},${c(n >> 8 & 255)},${c(n & 255)})`; };
  const G1 = SEA.ground, G2 = G1;   // no alternating ground bands: they strobe on a phone
  // ---------- the real roads: legs between towns, each with its own character ----------
  // mi = rough real mileage · curve/hill = how twisty/hilly · heave = frost heaves · climb = steady up (then down) · busy = traffic
  // scene: river (water beside the road), town (buildings, more traffic), mill (Berlin smokestacks), lake, notch (steep woods)
  const LEGS = [
    { a: 'MILAN', b: 'BERLIN', rt: 'RT 16', name: 'ALONG THE ANDROSCOGGIN', mi: 7, curve: 3, hill: 400, heave: 0.15, busy: 0.7, scene: ['river'] },
    { a: 'BERLIN', b: 'GORHAM', rt: 'RT 16', name: 'MAIN ST TO GORHAM', mi: 6, curve: 2, hill: 250, heave: 0.1, busy: 1.4, scene: ['town', 'mill', 'river'] },
    { a: 'GORHAM', b: 'SHELBURNE', rt: 'RT 2', name: 'THE RIVER ROAD', mi: 7, curve: 2.5, hill: 300, heave: 0.2, busy: 0.8, scene: ['river'] },
    { a: 'GORHAM', b: 'RANDOLPH', rt: 'RT 2', name: 'UP TO RANDOLPH', mi: 8, curve: 3, hill: 900, climb: 1, heave: 0.15, busy: 0.7, scene: ['views'],
      signs: [[0.55, ['APPALACHIA', 'TRAILHEAD'], '#5a3e26']] },
    { a: 'RANDOLPH', b: 'LANCASTER', rt: 'RT 2', name: 'JEFFERSON HIGHLANDS', mi: 18, curve: 3, hill: 1000, heave: 0.25, busy: 0.6, scene: ['views'] },
    { a: 'GORHAM', b: 'JACKSON', rt: 'RT 16', name: 'PINKHAM NOTCH', mi: 20, curve: 6, hill: 1300, climb: 1, heave: 0.1, busy: 1.0, scene: ['notch'],
      signs: [[0.3, ['MT WASHINGTON', 'AUTO ROAD'], '#5a3e26'], [0.45, ['WILDCAT', 'MTN'], '#5a3e26'], [0.55, ['PINKHAM NOTCH', 'ELEV 2032'], '#1e6b3a'], [0.68, ['GLEN ELLIS', 'FALLS'], '#5a3e26']] },
    { a: 'JACKSON', b: 'BARTLETT', rt: 'RT 302', name: 'THROUGH GLEN', mi: 7, curve: 3.5, hill: 500, heave: 0.15, busy: 1.0, scene: ['river'],
      signs: [[0.4, ['STORY LAND'], '#c0392b']] },
    { a: 'JACKSON', b: 'CONWAY', rt: 'RT 16', name: 'THE NORTH CONWAY STRIP', mi: 13, curve: 2, hill: 350, heave: 0.1, busy: 1.8, scene: ['town'],
      signs: [[0.08, ['JACKSON', 'COVERED BRIDGE'], '#5a3e26'], [0.5, ['NORTH', 'CONWAY'], '#2a5ab0'], [0.62, ['OUTLETS', 'NEXT RIGHT'], '#2a5ab0']] },
    { a: 'BARTLETT', b: 'CONWAY', rt: 'RT 302', name: 'ALONG THE SACO', mi: 10, curve: 3, hill: 400, heave: 0.2, busy: 1.1, scene: ['river'] },
    { a: 'CONWAY', b: 'FRYEBURG', rt: 'RT 302', name: 'INTO MAINE', mi: 9, curve: 1.5, hill: 250, heave: 0.15, busy: 0.9, scene: [],
      signs: [[0.5, ['WELCOME TO', 'MAINE'], '#2a5ab0']] },
    { a: 'CONWAY', b: 'FREEDOM', rt: 'RT 153', name: 'THE BACK ROAD', mi: 15, curve: 6, hill: 900, heave: 0.35, busy: 0.4, scene: ['lake'] },
    { a: 'CONWAY', b: 'TAMWORTH', rt: 'RT 113', name: 'THROUGH THE WOODS', mi: 15, curve: 4.5, hill: 700, heave: 0.3, busy: 0.5, scene: [] },
    { a: 'CONWAY', b: 'OSSIPEE', rt: 'RT 16', name: 'SOUTH ON 16', mi: 20, curve: 2, hill: 500, heave: 0.15, busy: 1.2, scene: ['lake'],
      signs: [[0.6, ['OSSIPEE', 'LAKE'], '#5a3e26']] },
    { a: 'TAMWORTH', b: 'OSSIPEE', rt: 'RT 25', name: 'OVER TO OSSIPEE', mi: 8, curve: 3, hill: 400, heave: 0.2, busy: 0.6, scene: ['lake'] },
    { a: 'FREEDOM', b: 'OSSIPEE', rt: 'RT 25', name: 'AROUND THE LAKE', mi: 10, curve: 3.5, hill: 450, heave: 0.25, busy: 0.6, scene: ['lake'] },
  ];
  // shortest real path between the two towns (Dijkstra on the little road map above)
  function routeLegs(A, B) {
    if (A === B) return [];
    const dist = { [A]: 0 }, prev = {}, todo = new Set([A]);
    while (todo.size) { let u = null; for (const t of todo) if (u === null || dist[t] < dist[u]) u = t; todo.delete(u); if (u === B) break;
      for (const L of LEGS) { const v = L.a === u ? L.b : L.b === u ? L.a : null; if (!v) continue; const d = dist[u] + L.mi;
        if (dist[v] === undefined || d < dist[v]) { dist[v] = d; prev[v] = { u, L }; todo.add(v); } } }
    if (dist[B] === undefined) return null;
    const out = []; for (let v = B; v !== A; v = prev[v].u) out.unshift({ ...prev[v].L, rev: prev[v].L.a !== prev[v].u });
    return out;
  }
  const FROM = (opts.from || 'BERLIN').toUpperCase(), TO = (opts.to || 'RANDOLPH').toUpperCase();
  let LEGS_HERE = routeLegs(FROM, TO);
  if (!LEGS_HERE || !LEGS_HERE.length) LEGS_HERE = [{ rt: (opts.route || 'Route 16').toUpperCase().replace('ROUTE', 'RT'), name: '', mi: 12, curve: 3.5, hill: 700, heave: 0.2, busy: 1, scene: [] }];
  const TOTAL_MI = LEGS_HERE.reduce((a, L) => a + L.mi, 0);
  const SEG_PER_MI = Math.max(48, Math.min(110, 1450 / TOTAL_MI));            // short hops still feel like a drive; long hauls don't drag forever
  const legAt = [];   // which leg each segment belongs to
  add(40, 0, 0); for (let i = 0; i < 40; i++) legAt.push(0);
  LEGS_HERE.forEach((L, li) => {
    const n = Math.round(L.mi * SEG_PER_MI), start = segs.length;
    while (segs.length - start < n) {
      const u = (segs.length - start) / n, left = n - (segs.length - start), r = Math.random();
      const up = L.climb ? (u < (L.rev ? 0.4 : 0.6) ? (L.rev ? -1 : 1) : (L.rev ? 1 : -1)) : 0;   // a notch: up one side, down the other
      const len = Math.min(left, Math.floor(rnd(25, 70)));
      if (r < L.heave) { for (let h = 0; h < 4 && segs.length - start < n; h++) add(8, 0, (h % 2 ? -1 : 1) * 220); }
      else if (r < 0.55) add(len, rnd(-L.curve, L.curve), up * L.hill * 0.6 + rnd(-L.hill, L.hill) * 0.4);
      else add(len, rnd(-L.curve * 0.3, L.curve * 0.3), up * L.hill * 0.8 + rnd(-L.hill, L.hill) * 0.3);
      while (legAt.length < segs.length) legAt.push(li);
    }
  });
  add(60, 0, -lastY()); while (legAt.length < segs.length) legAt.push(LEGS_HERE.length - 1);   // level out at the destination
  segs.forEach((sg, k) => { const L = LEGS_HERE[legAt[k]]; sg.leg = legAt[k]; sg.river = L.scene.includes('river') && !(k % 1) ; sg.lake = L.scene.includes('lake'); });
  const N = segs.length, LEN = N * SEG;

  // ---------- sprite art (drawn once into little canvases) ----------
  function art(w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; const k = c.getContext('2d'); fn(k, (x, y, ww, hh, col) => { k.fillStyle = col; k.fillRect(x, y, ww, hh); }); return c; }
  const PINE = art(32, 64, (k, P) => { P(14, 52, 4, 12, '#4a3020'); for (let i = 0; i < 12; i++) P(16 - i * 1.2, 4 + i * 4, i * 2.4 + 1, 4, i % 2 ? SEA.pine : '#24452c'); if (SNOW) for (let i = 1; i < 12; i += 3) P(16 - i * 1.2, 4 + i * 4, i * 1.4, 1, '#fff'); });
  const MAPLE = (c1, c2) => art(40, 56, (k, P) => { P(18, 30, 5, 26, '#4a3020');
    if (SEA.leaf) { P(4, 6, 32, 22, c1); P(8, 2, 24, 6, c1); P(0, 14, 40, 10, c2); P(10, 24, 20, 6, c2); }
    else {   // bare tree: every branch grows out of the trunk (no floating sticks)
      P(18, 10, 5, 22, '#4a3020');
      k.strokeStyle = '#4a3020'; k.lineCap = 'round';
      for (const [x0, y0, x1, y1, w] of [[20, 26, 6, 12, 3], [21, 22, 34, 8, 3], [20, 16, 12, 2, 2], [21, 14, 28, 2, 2], [9, 15, 4, 8, 1.5], [31, 11, 37, 6, 1.5], [14, 7, 10, 2, 1], [25, 6, 31, 1, 1]]) { k.lineWidth = w; k.beginPath(); k.moveTo(x0, y0); k.lineTo(x1, y1); k.stroke(); }
      if (SNOW) { k.strokeStyle = '#fff'; k.lineWidth = 1; k.beginPath(); k.moveTo(8, 13); k.lineTo(19, 24); k.moveTo(22, 20); k.lineTo(33, 9); k.stroke(); } } });
  const MAPLES = SEA.leaf ? SEA.leaf.map((c, i) => MAPLE(c, SEA.leaf[(i + 1) % SEA.leaf.length])) : [MAPLE('#000', '#000')];
  const BIRCH = art(24, 60, (k, P) => { P(11, 14, 3, 46, '#eeeae0'); for (let y = 20; y < 58; y += 8) P(11, y, 2, 1, '#333');
    k.strokeStyle = '#6a5a4a'; k.lineWidth = 1; k.beginPath(); for (const [x0, y0, x1, y1] of [[12, 22, 4, 12], [13, 18, 21, 8], [12, 30, 5, 22], [13, 28, 20, 20], [12, 14, 9, 4], [13, 14, 16, 3]]) { k.moveTo(x0, y0); k.lineTo(x1, y1); } k.stroke();
    if (SEA.leaf) { P(2, 2, 20, 18, SEA.leaf[0]); P(0, 9, 24, 9, SEA.leaf[SEA.leaf.length - 1]); } });
  const BANK = art(96, 22, (k, P) => {   // a plowed snowbank: lumpy mound, lit from above, gray-blue in the shadow, a little road grit at the base
    for (let x = 0; x < 96; x++) { const h = 9 + 5 * Math.sin(x * 0.11) + 3 * Math.sin(x * 0.37 + 1) + 2 * Math.sin(x * 0.9), top = 22 - h;
      P(x, top, 1, h, '#dfe6ee'); P(x, top, 1, 2, '#ffffff'); P(x, 22 - h * 0.35, 1, h * 0.35, '#c4cfdb'); if (x % 7 === 0) P(x, 20, 2, 2, '#8a8f94'); } });
  const MAILBOX = art(10, 22, (k, P) => { P(4, 8, 2, 14, '#5a3e26'); P(0, 2, 10, 7, '#2a2a2a'); P(8, 0, 2, 4, '#c0392b'); });
  function sign(lines, bg = '#1e6b3a') { return art(64, 40, (k, P) => { P(10, 26, 3, 14, '#777'); P(51, 26, 3, 14, '#777'); P(0, 0, 64, 28, '#fff'); P(1, 1, 62, 26, bg);
    k.fillStyle = '#fff'; k.font = '6px "Press Start 2P", monospace'; k.textAlign = 'center'; k.textBaseline = 'middle'; lines.forEach((l, i) => k.fillText(l, 32, 8 + i * 10 + (lines.length === 1 ? 5 : 0))); }); }
  const HOUSES_ART = ['#e8e4d8', '#c0392b', '#2a5ab0', '#f2c12e', '#7f8c8d'].map(col => art(40, 34, (k, P) => {   // little roadside houses/shops for town stretches
    P(4, 12, 32, 22, col); P(0, 10, 40, 4, '#4a3a2e'); k.fillStyle = '#4a3a2e'; k.beginPath(); k.moveTo(2, 12); k.lineTo(20, 0); k.lineTo(38, 12); k.fill();
    P(8, 17, 7, 6, '#2b3a48'); P(25, 17, 7, 6, '#2b3a48'); P(17, 22, 6, 12, '#5a3e26'); if (SNOW) { P(2, 9, 36, 2, '#fff'); k.fillStyle = '#fff'; k.beginPath(); k.moveTo(6, 10); k.lineTo(20, 1); k.lineTo(34, 10); k.lineTo(30, 10); k.lineTo(20, 4); k.lineTo(10, 10); k.fill(); } }));
  const STACK = art(28, 90, (k, P) => { P(10, 10, 9, 80, '#8a5a4a'); for (let y = 16; y < 90; y += 12) P(10, y, 9, 2, '#6a4a3a'); P(8, 8, 13, 4, '#5a3a2e');   // the Berlin mill smokestack, puffing
    k.fillStyle = 'rgba(230,230,235,.75)'; for (let i = 0; i < 4; i++) { k.beginPath(); k.arc(14 + i * 3, 4 - i * 2, 4 + i, 0, 7); k.fill(); } });
  const MILL = art(90, 90, (k, P) => {   // the Berlin paper mill: brick buildings, two stacks, steam
    P(4, 52, 82, 38, '#8a5a4a'); P(4, 52, 82, 4, '#6a4a3a'); for (let x = 10; x < 84; x += 12) P(x, 62, 7, 8, '#2b3a48');
    P(46, 40, 36, 14, '#7a4f40'); P(46, 40, 36, 3, '#5a3a2e'); for (let x = 50; x < 80; x += 10) P(x, 45, 6, 5, '#2b3a48');
    P(14, 8, 8, 46, '#8a5a4a'); P(12, 6, 12, 4, '#5a3a2e'); P(30, 20, 6, 34, '#7a4f40'); P(28, 18, 10, 3, '#5a3a2e');
    if (SNOW) { P(4, 50, 82, 2, '#fff'); P(46, 38, 36, 2, '#fff'); }
    k.fillStyle = 'rgba(230,230,235,.7)'; for (let i = 0; i < 4; i++) { k.beginPath(); k.arc(18 + i * 4, 4 - i * 2, 4 + i, 0, 7); k.fill(); } });
  const MOOSESIGN = art(40, 44, (k, P) => { P(18, 26, 3, 18, '#777'); k.fillStyle = '#f2c12e'; k.beginPath(); k.moveTo(20, 0); k.lineTo(40, 20); k.lineTo(20, 40); k.lineTo(0, 20); k.fill(); P(13, 16, 14, 7, '#111'); P(25, 13, 4, 5, '#111'); P(14, 23, 2, 6, '#111'); P(24, 23, 2, 6, '#111'); });
  function carBack(col) { return art(40, 30, (k, P) => { P(2, 6, 36, 20, '#111'); P(3, 7, 34, 18, col); P(7, 1, 26, 8, '#111'); P(8, 2, 24, 6, '#2b3a48'); P(4, 16, 6, 3, '#c0392b'); P(30, 16, 6, 3, '#c0392b'); P(14, 18, 12, 4, '#ddd'); P(3, 26, 8, 4, '#111'); P(29, 26, 8, 4, '#111'); }); }
  function carFront(col) { return art(40, 30, (k, P) => { P(2, 6, 36, 20, '#111'); P(3, 7, 34, 18, col); P(7, 1, 26, 8, '#111'); P(8, 2, 24, 6, '#6a8aa8'); P(4, 15, 7, 4, '#fff3b0'); P(29, 15, 7, 4, '#fff3b0'); P(13, 18, 14, 4, '#333'); P(3, 26, 8, 4, '#111'); P(29, 26, 8, 4, '#111'); }); }
  const LOGTRUCK = art(48, 40, (k, P) => { P(2, 4, 44, 30, '#111'); P(3, 5, 42, 28, '#5a3e26'); for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { P(6 + i * 10, 8 + j * 8, 8, 7, '#c9a36a'); P(8 + i * 10, 10 + j * 8, 4, 3, '#8a6a3e'); } P(4, 30, 6, 3, '#c0392b'); P(38, 30, 6, 3, '#c0392b'); P(4, 34, 10, 6, '#111'); P(34, 34, 10, 6, '#111'); });
  const COLS = ['#c0392b', '#2e86de', '#e5e5e5', '#27ae60', '#7f8c8d', '#8e44ad', '#d35400', '#222'];
  const BACKS = COLS.map(carBack), FRONTS = COLS.map(carFront);
  // ---------- the drawn sprite sheets (assets/drive): seasonal trees, shoulders, buildings, mountains, traffic, animals ----------
  const SK = SNOW ? 'winter' : FALL ? 'fall' : SEA.name === 'summer' ? 'summer' : 'spring';
  const DROOT = (window.DDT && DDT.root || '') + 'assets/drive/', DL = [];
  const DI = n => { const i = new Image(); i.onerror = () => { i.failed = true; }; i.src = DROOT + n + '.png'; DL.push(i); return i; };
  const T_PINES = (SK === 'fall' ? ['pine'] : ['pine', 'fir', 'spruce']).map(n => DI(`tree_${SK}_${n}`));
  const T_LEAF = (SK === 'fall' ? ['maple_r', 'maple_o', 'maple_y'] : ['maple']).map(n => DI(`tree_${SK}_${n}`));
  const T_BIRCH = DI(`tree_${SK}_birch`), T_SHRUB = DI(`tree_${SK}_shrub`);
  const SHOULDER = [0, 1, 2].map(i => DI(`shoulder_${SK}_${i}`));
  const BLDG = [0, 1, 2, 3, 4].map(i => DI(`bldg_${SNOW ? 'winter' : 'summer'}_${i}`));
  const MTN_IMG = DI(`mtn_${SK}`);
  const CAR_B = [...Array(12).keys()].map(i => DI(`car_back_${i}`)), CAR_F = [...Array(12).keys()].map(i => DI(`car_front_${i}`));
  const LOG_B = DI('logtruck_back'), LOG_F = DI('logtruck_front');
  const ANIM = { moose: [DI('moose_0'), DI('moose_1')], deer: [DI('deer_0'), DI('deer_1')], turkeys: [DI('turkey_0'), DI('turkey_1')] };
  const artReady = () => DL.every(i => i.failed || (i.complete && i.naturalWidth > 0));
  const flipC = new Map(), flipped = img => { if (!img.width) return img; let c = flipC.get(img); if (!c) { c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const k = c.getContext('2d'); k.scale(-1, 1); k.drawImage(img, -img.width, 0); flipC.set(img, c); } return c; };
  const MOOSE = art(56, 44, (k, P) => { P(10, 12, 34, 18, '#3a2416'); P(12, 30, 4, 14, '#2a180e'); P(20, 30, 4, 14, '#2a180e'); P(32, 30, 4, 14, '#2a180e'); P(40, 30, 4, 14, '#2a180e'); P(42, 8, 10, 12, '#3a2416'); P(48, 16, 6, 6, '#4a3020'); P(38, 2, 18, 4, '#d9c8a0'); P(36, 0, 3, 4, '#d9c8a0'); P(54, 0, 2, 4, '#d9c8a0'); });
  const DEER = art(40, 36, (k, P) => { P(8, 10, 24, 12, '#b88a55'); P(10, 22, 3, 14, '#8a6440'); P(28, 22, 3, 14, '#8a6440'); P(30, 2, 8, 10, '#b88a55'); P(6, 10, 4, 4, '#fff'); });
  const TURKEY = art(20, 20, (k, P) => { P(4, 6, 12, 10, '#3a2a22'); P(0, 2, 8, 14, '#5a3a22'); P(14, 2, 4, 6, '#8a5a30'); P(16, 6, 2, 3, '#c0392b'); P(7, 16, 2, 4, '#c98a3e'); P(11, 16, 2, 4, '#c98a3e'); });
  const PEEPER = art(16, 34, (k, P) => { P(4, 10, 8, 12, '#e85a8a'); P(5, 3, 6, 7, '#e8b48a'); P(4, 2, 8, 2, '#c9b48a'); P(10, 12, 6, 4, '#222'); P(5, 22, 2, 12, '#333'); P(9, 22, 2, 12, '#333'); });
  const FLASH = art(12, 12, (k, P) => { P(4, 0, 4, 12, '#fff'); P(0, 4, 12, 4, '#fff'); });
  // our van from behind
  const VAN = art(72, 52, (k, P) => {
    P(4, 4, 64, 40, '#111'); P(5, 5, 62, 38, '#f2f2ee'); P(5, 5, 62, 6, '#d9d9d4');
    P(5, 22, 62, 8, '#f7c418'); P(5, 30, 62, 4, '#2a5ab0');            // the yellow + blue stripe
    P(35, 6, 2, 37, '#9a9a96'); P(9, 9, 22, 10, '#2b3a48'); P(41, 9, 22, 10, '#2b3a48');
    P(6, 34, 6, 6, '#c0392b'); P(60, 34, 6, 6, '#c0392b'); P(24, 38, 24, 6, '#333'); P(28, 39, 16, 4, '#f4f1ea');
    P(6, 44, 14, 8, '#111'); P(52, 44, 14, 8, '#111'); P(20, 44, 32, 3, '#222');
    k.fillStyle = '#10151f'; k.font = '4px "Press Start 2P", monospace'; k.textAlign = 'center'; k.fillText('DRAIN', 36, 27);
  });
  const VANBRAKE = art(72, 52, (k, P) => { k.drawImage(VAN, 0, 0); P(5, 33, 8, 8, '#ff3b2f'); P(59, 33, 8, 8, '#ff3b2f'); });
  // the real van, from behind: 6 frames (straight / lean right / lean left, then the same with brake lights). Falls back to the drawn one.
  const VANS = new Image(); let vanFail = false; VANS.onerror = () => { vanFail = true; }; VANS.src = (window.DDT && DDT.root || '') + 'assets/van_back.png';
  const vanReady = () => vanFail || (VANS.complete && VANS.naturalWidth > 0);
  let helpSeen = false; try { helpSeen = localStorage.getItem('ddt_drive_help2') === '1'; } catch (e) {} const VCW = 104, VCH = 98;   // drawn size; the sheet itself is 2x for the 2x canvas

  // ---------- dress the roadside ----------
  const put = (n, img, off, scale = 1, kind) => { if (segs[n]) segs[n].sprites.push({ img, off, scale, kind }); };
  let millPut = false;
  for (let n = 20; n < N - 20; n++) {
    const L = LEGS_HERE[segs[n].leg] || LEGS_HERE[0], sc = L.scene, wet = sc.includes('river') || sc.includes('lake');
    const treeSide = () => wet ? -1 : (Math.random() < .5 ? -1 : 1);                  // water is on the right, so the woods crowd the left
    const dense = sc.includes('notch') ? 4 : sc.includes('town') ? 10 : 6;               // the notch is wall-to-wall woods
    if (n % dense === 0) { const side = treeSide(), d = sc.includes('notch') ? rnd(1.35, 2.2) : rnd(1.4, 3.2);
      const pick = Math.random(); put(n, pick < (sc.includes('notch') ? .8 : .55) ? T_PINES[n % T_PINES.length] : pick < .93 ? T_LEAF[n % T_LEAF.length] : T_BIRCH, side * d, rnd(0.7, 1.05) * (sc.includes('notch') ? 1.25 : 1)); }
    if (n % 11 === 5) put(n, T_SHRUB, treeSide() * rnd(1.3, 1.9), rnd(0.55, 0.8));
    if (n % 16 === 0) put(n, T_PINES[0], treeSide() * rnd(3.5, 6), rnd(0.95, 1.35));
    if (sc.includes('town') && n % 9 === 0) put(n, BLDG[(n / 9 | 0) % BLDG.length], (n % 18 ? -1 : 1) * rnd(2.5, 3.4), rnd(0.85, 1.05));
    if (sc.includes('mill') && !millPut && segs[n].leg === LEGS_HERE.findIndex(q => q.scene.includes('mill')) && (n - 40) % 400 === 140) { millPut = true; put(n, MILL, 5.5, 2.2); }   // one paper mill, set back from the road
    {   // shoulder piles: scattered by a hash, not a metronome, so the eye has nothing to lock onto
      const hs = k => { let x = (n * 374761393 + k * 668265263) | 0; x = (x ^ (x >>> 13)) * 1274126177; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
      const p = SNOW ? 0.11 : 0.07, sc = SNOW ? 0.62 : 0.5;
      for (const side of [-1, 1]) { const r = hs(side + 3); if (r < p) put(n, SHOULDER[r < p * 0.15 ? 2 : (hs(side + 9) < 0.5 ? 0 : 1)], side * ((SNOW ? 1.53 : 1.45) + hs(side + 5) * 0.14), sc * (0.85 + hs(side + 7) * 0.3)); }
    }   // snowbanks / mud, grass, wildflowers, leaf piles
    if (n % 97 === 0) put(n, MAILBOX, 1.3, 0.8);
    if (n % 211 === 0) put(n, MOOSESIGN, -1.5, 1);
  }
  const from = FROM, to = TO;
  put(30, sign(['LEAVING', from]), 1.5, 1.4);
  for (const f of [0.33, 0.66]) { const n = Math.floor(N * f); put(n, sign([to, `${Math.max(1, Math.round((1 - f) * TOTAL_MI))} MI`]), 1.5, 1.4); }   // real miles to go
  { let s0 = 40; LEGS_HERE.forEach((L, li) => { const n = Math.round(L.mi * SEG_PER_MI);
      if (li > 0 || L.rt) put(s0 + 6, sign([L.rt + (L.rev ? '' : ''), L.name ? L.name.split(' ').slice(0, 2).join(' ') : ''], '#2a5ab0'), -1.5, 1.2);   // route marker at the start of each leg
      (L.signs || []).forEach(([f, lines, col]) => put(s0 + Math.floor((L.rev ? 1 - f : f) * n), sign(lines, col), (lines.length > 1 ? 1.5 : -1.5), 1.3));
      s0 += n; }); }
  put(N - 70, sign(['WELCOME TO', to], '#2a5ab0'), 1.5, 1.6);
  if (FALL) for (let n = 80; n < N - 80; n += 160) put(n, sign(['SCENIC', 'VIEW'], '#5a3e26'), -1.5, 1.2);

  // ---------- the rival: the CLOG KINGS van, racing you to the same job ----------
  const RIVAL = !!opts.rival;
  let rz = PZ + 5 * SEG, rv = 0, roff = LANE[1], rivalWon = false, rivalImg = null, rivalBump = 0;
  function makeRival() {   // repaint our van in Clog Kings colors (blue->red, yellow->black) once the art has loaded
    if (rivalImg || !(VANS.complete && VANS.naturalWidth)) return;
    const c = document.createElement('canvas'); c.width = VCW; c.height = VCH; const k = c.getContext('2d'); k.imageSmoothingEnabled = true; k.drawImage(VANS, 0, 0, VANS.width / 6, VANS.height, 0, 0, VCW, VCH);
    const d = k.getImageData(0, 0, VCW, VCH), p = d.data;
    for (let i = 0; i < p.length; i += 4) { const r0 = p[i], g0 = p[i + 1], b0 = p[i + 2];
      if (b0 > r0 + 30 && b0 > g0) { p[i] = Math.min(255, b0 + 20); p[i + 1] = g0 * 0.3; p[i + 2] = r0 * 0.3; }            // blue wrap -> red
      else if (r0 > 150 && g0 > 130 && b0 < 110) { p[i] = 40; p[i + 1] = 40; p[i + 2] = 44; } }                                // yellow -> black
    k.putImageData(d, 0, 0); rivalImg = c;
  }

  // ---------- traffic + critters ----------
  const cars = [];   // { z, off, speed, img, onc }
  function addCar(z, onc) {
    const c = Math.floor(Math.random() * CAR_B.length), truck = Math.random() < MODE.trucks * (onc ? 0.5 : 1), sc = truck ? 1.6 : 1.3, img = onc ? (truck ? LOG_F : CAR_F[c]) : truck ? LOG_B : CAR_B[c];
    const lane = onc ? 0 : Math.random() < 0.65 ? 2 : 1;
    // our-way traffic is slower than us (you catch up and pass); log trucks crawl
    return { z, lane, off: LANE[lane], tgt: LANE[lane], speed: onc ? -rnd(25, 45) * MPH : (truck ? rnd(18, 24) : rnd(22, 34)) * MPH * (DRIVER === 'rod' ? 0.8 : 1),
      img, onc, hw: (img.width || (truck ? 50 : 44)) * sc / 320, sc, truck, blink: 0 };
  }
  // traffic lives in a window around the van: anything that falls behind gets sent back up the road (so it never runs dry)
  const BUSY_MAX = Math.max(...LEGS_HERE.map(L => L.busy || 1));
  for (let i = 0; i < Math.round(MODE.cars * Math.min(1, Math.max(0.6, BUSY_MAX))); i++) { let c, tries = 0; do { c = addCar(rnd(14, DRAW) * SEG, Math.random() < MODE.onc); tries++; } while (tries < 10 && cars.some(o => o.lane === c.lane && Math.abs(o.z - c.z) < 4 * SEG)); cars.push(c); }
  if (typeof DDT !== 'undefined' && DDT.DEV) window.__cars = cars;   // dev: lets the test harness check for overlaps
  const respawn = (c, base) => {   // reappear far up the road (out at the horizon), in a lane with room, and never in the last stretch before town
    const z = base + rnd(DRAW * 0.85, DRAW) * SEG;
    if (z > (N - 60) * SEG) { c.z = -1e12; c.parked = true; return; }
    const busy = (LEGS_HERE[(segAt(z) || {}).leg || 0] || {}).busy ?? 1;
    if (Math.random() > Math.min(1, busy)) { c.z = -1e12; c.parked = true; c.retry = 1; return; }   // quiet back roads: fewer cars come back
    const n = addCar(z, Math.random() < MODE.onc);
    if (cars.some(o => o !== c && !o.parked && o.lane === n.lane && Math.abs(o.z - z) < 4 * SEG)) { c.z = -1e12; c.parked = true; c.retry = 1; return; }
    Object.assign(c, n, { parked: false });
  };
  const critters = [];
  const CK = FALL ? ['peeper', 'peeper', 'moose', 'deer', 'turkeys'] : ['moose', 'deer', 'turkeys', 'moose'];
  for (let i = 0; i < MODE.crit; i++) critters.push({ seg: Math.floor(rnd(0.12, 0.92) * N), kind: CK[Math.floor(Math.random() * CK.length)], off: Math.random() < .5 ? -1.6 : 1.6, dir: 0, hit: false, snap: 0, flash: 0 });
  const CIMG = { moose: ANIM.moose[0], deer: ANIM.deer[0], turkeys: ANIM.turkeys[0], peeper: PEEPER }, CW = { moose: 0.36, deer: 0.18, turkeys: 0.1, peeper: 0.08 },   // half-widths, matching how big they're drawn
       
        CSPD = { moose: 0.25, deer: 0.9, turkeys: 0.3, peeper: 0.35 }, PEN = { moose: 20, deer: 12, turkeys: 5, peeper: 8 };

  // ---------- state + input ----------
  let artOK = false, wasLive = false, offT = 0, pos = 0, speed = 0, px = LANE[2], t = 0, play = 0, crashes = 0, penalty = 0, inv = 0, shake = 0, msg = '', msgT = 0, done = false, last = null, bounce = 0, skyX = 0;
  const key = { L: 0, R: 0, U: 0, D: 0 }, touch = { L: 0, R: 0, U: 0, D: 0 };
  const KM = { arrowleft: 'L', a: 'L', arrowright: 'R', d: 'R', arrowup: 'U', w: 'U', arrowdown: 'D', s: 'D', ' ': 'D' };
  const kd = e => { if (e.key === ']') key.skip = 1; const k = KM[e.key.toLowerCase()]; if (k) { e.preventDefault(); key[k] = 1; } };
  const ku = e => { const k = KM[e.key.toLowerCase()]; if (k) key[k] = 0; };
  addEventListener('keydown', kd); addEventListener('keyup', ku);
  const pts = new Map();
  function zone(e) { const b = rc.getBoundingClientRect(), x = (e.clientX - b.left) / b.width, y = (e.clientY - b.top) / b.height;
    if (y > 0.74 && (x < 0.22 || x > 0.78)) return 'D'; return x < 0.5 ? 'L' : 'R'; }   // brake in both bottom corners, steer with either side
  // phone: one thumb steers. Both thumbs down (left AND right) = gas. No thumbs = cruise.
  function retouch() { touch.L = touch.R = touch.U = touch.D = 0; for (const z of pts.values()) touch[z] = 1; if (touch.L && touch.R && !touch.D) touch.U = 1; }
  const TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  rc.onpointerdown = e => { e.preventDefault(); if (e.isPrimary) pts.clear(); /* a fresh touch: forget any finger the phone never told us was lifted */ pts.set(e.pointerId, zone(e)); try { rc.setPointerCapture(e.pointerId); } catch (_) {} retouch(); };
  rc.onpointermove = e => { if (pts.has(e.pointerId)) { pts.set(e.pointerId, zone(e)); retouch(); } };
  rc.onpointerup = rc.onpointercancel = rc.onlostpointercapture = e => { pts.delete(e.pointerId); retouch(); };
  addEventListener('pointerup', e => { if (pts.delete(e.pointerId)) retouch(); }); addEventListener('blur', () => { pts.clear(); retouch(); });
  const say = (m, s = 1.4) => { msg = m; msgT = s; };
  const sfx = (n, o) => { if (window.DDTSfx) DDTSfx.play(n, o); };

  // ---------- projection ----------
  function project(p, camX, camY, camZ) {
    const cz = p.z - camZ, sc = DEPTH / Math.max(1, cz);
    p.sx = Math.round(W / 2 + sc * (p.wx - camX) * W / 2); p.sy = Math.round(H / 2 - sc * (p.y - camY) * H / 2 + (HORIZON - H / 2)); p.sw = Math.round(sc * ROADW * W / 2); p.sc = sc;
  }
  const segAt = z => segs[((Math.floor((z || 0) / SEG) % N) + N) % N];
  function poly(x1, y1, w1, x2, y2, w2, col) { r.fillStyle = col; r.beginPath(); r.moveTo(x1 - w1, y1 + 1); r.lineTo(x2 - w2, y2); r.lineTo(x2 + w2, y2); r.lineTo(x1 + w1, y1 + 1); r.closePath(); r.fill(); }

  // ---------- backdrop: sky, the Presidentials, a few clouds ----------
  const MTN = art(960, 80, (k, P) => {
    k.fillStyle = SEA.mtn; k.beginPath(); k.moveTo(0, 80);
    const peaks = [[0, 60], [80, 34], [150, 50], [230, 12], [300, 30], [360, 20], [430, 44], [520, 28], [600, 50], [690, 16], [760, 36], [840, 26], [960, 60]];
    peaks.forEach(([x, y]) => k.lineTo(x, y)); k.lineTo(960, 80); k.fill();
    if (SNOW || SEA.name === 'stick season' || SEA.name === 'mud') { k.fillStyle = '#f4f7fa'; for (const [x, y] of [[230, 12], [690, 16], [360, 20], [840, 26]]) { k.beginPath(); k.moveTo(x - 14, y + 10); k.lineTo(x, y); k.lineTo(x + 14, y + 10); k.fill(); } }
    k.fillStyle = 'rgba(0,0,0,.18)'; k.beginPath(); k.moveTo(0, 80); for (let x = 0; x <= 960; x += 40) k.lineTo(x, 62 + Math.sin(x * 0.05) * 6); k.lineTo(960, 80); k.fill();
  });

  // ---------- the loop ----------
  return new Promise(res => {
    function frame(ms) {
      if (done) return;
      if (last === null) last = ms;
      const dt = Math.min(0.05, (ms - last) / 1000); last = ms; if (vanReady() && artReady()) { if (!artOK) { artOK = true; for (const c of cars) c.hw = (c.img.width || 44) * c.sc / 320; } t += dt; }   /* the clock doesn't start until the art is in */
      const live = t > 1.2;   /* hands on the wheel at GO, not before */
      if (live && !wasLive) { wasLive = true; pts.clear(); retouch(); }   /* forget any tap from before GO: you start with no fingers down */
      if (t > 2 && !helpSeen) { helpSeen = true; try { localStorage.setItem('ddt_drive_help2', '1'); } catch (e) {} }
      if (typeof DDT !== 'undefined' && DDT.DEV && key.skip) pos = (N - 40) * SEG;   // dev shortcut: ] jumps to the finish
      const L = key.L || touch.L, Rr = key.R || touch.R, gas = live && (key.U || touch.U), brake = live && (key.D || touch.D);
      const seg = segAt(pos + PZ), ratio = speed / MAX;
      // speed: cruise on its own, GAS to push it, BRAKE to slow
      const target = !live ? 0 : brake ? 0 : gas ? BOOST : CRUISE;
      speed += (target - speed) * Math.min(1, dt * (brake ? 2.6 : target > speed ? 0.7 : 0.9)); speed = Math.max(0, speed);
      // steering + the curve trying to throw you off the road
      const steer = live ? (Rr ? 1 : 0) - (L ? 1 : 0) : 0;
      px += steer * dt * 2.1 * (0.35 + 0.65 * ratio);
      px -= seg.curve * ratio * ratio * dt * 0.42;
      // off the road: grass (or a snowbank) slows you down hard
      if (Math.abs(px) > 1) { const deep = SNOW && Math.abs(px) > 1.1, floor = (deep ? 0.07 : SNOW ? 0.15 : 0.22) * MAX; if (live) { penalty += dt * (deep ? 0.9 : 0.4); offT = (offT || 0) + dt; } /* stuck in it: minutes tick away */ if (speed > floor) speed = floor + (speed - floor) * Math.pow(0.1, dt); /* grass/snow drags you to a crawl, never backwards */ shake = Math.max(shake, 0.08); if (SNOW && Math.abs(px) > 1.15) { px = Math.sign(px) * 1.15; if (msgT <= 0) say('SNOWBANK!', 0.8); } }
      px = Math.max(-1.6, Math.min(1.6, px));
      if (live) { pos += speed * dt; play += dt; }
      // frost heaves bounce the van
      const dy = seg.p2.y - seg.p1.y; bounce = bounce * 0.86 + Math.max(0, dy) * 0.012 * ratio;
      skyX -= seg.curve * ratio * dt * 6;
      // traffic
      for (const c of cars) {
        if (c.parked) { if (c.retry && Math.random() < dt * 0.4) respawn(c, pos + PZ); continue; }
        if (c.z - (pos + PZ) < -8 * SEG) respawn(c, pos + PZ);
        const ahead = c.z - (pos + PZ);
        // slow cars in our lane brake for critters + peepers in fall
        let v = c.speed;
        if (!c.onc && FALL && !c.peep && ahead > 400 && ahead < 9000 && Math.random() < dt * 0.04) { c.peep = 1.6; if (Math.abs(ahead) < 6000) say('LEAF PEEPER! BRAKES!'); }
        if (c.peep > 0) { c.peep -= dt; v *= 0.15; }
        if (!c.onc) for (const o of cars) if (o !== c && !o.onc && !o.parked && Math.abs(o.off - c.off) < 0.3 && o.z > c.z && o.z - c.z < 2.5 * SEG) v = Math.min(v, o.speed * (o.peep > 0 ? 0.15 : 1));
        c.z += v * dt;
        // our-way cars change lanes: blinker for a second and a half first, then they drift over
        if (!c.onc && !c.blink && c.off === c.tgt && ahead > 0 && ahead < 40 * SEG && Math.random() < dt * MODE.blink * 10) {
          const nl = c.lane === 2 ? 1 : 2; if (!cars.some(o => o !== c && !o.parked && !o.onc && Math.abs(o.z - c.z) < 4 * SEG)) { c.blink = 1.5; c.next = nl; } }
        if (c.blink > 0) { c.blink -= dt; if (c.blink <= 0) { c.lane = c.next; c.tgt = LANE[c.lane]; c.blink = -1.2; } }
        else if (c.blink < 0) c.blink = Math.min(0, c.blink + dt);
        if (c.spin > 0) { c.spin -= dt; c.rot = (c.rot || 0) + c.spinDir * dt * 14 * Math.min(1, c.spin); c.off += c.spinDir * dt * 0.9; c.tgt = c.off; if (c.spin <= 0) { c.z = -1e12; c.parked = true; c.retry = 1; c.rot = 0; } continue; }
        if (c.off !== c.tgt) { const d = c.tgt - c.off; c.off += Math.sign(d) * Math.min(Math.abs(d), dt * 0.55); }
        const VAN_HW = 0.16;   // the van, measured the same way as the cars it can hit
        if (live && inv <= 0 && ahead > -SEG * 0.6 && ahead < SEG * (c.truck ? 1.6 : 1.1) && Math.abs(px - c.off) < c.hw + VAN_HW - 0.03) {
          crashes++; inv = 1.4; shake = c.onc ? 0.6 : 0.35;
          const p = c.onc ? 20 : c.truck ? 14 : 10; /* a crash costs real time: exchanging info, checking the bumper */ penalty += p; speed = c.onc ? 0 : Math.min(speed, Math.abs(c.speed) * 0.6);
          if (!c.truck) { c.spin = 1.6; c.spinDir = px < c.off ? 1 : -1; c.speed *= 0.3; }   // the car you hit spins out (log trucks just shrug)
          px += c.onc ? (px < c.off ? -0.4 : 0.4) : (px < c.off ? -0.3 : 0.3);
          sfx(c.onc ? 'horn_angry' : 'horn'); say(c.onc ? `HEAD-ON! +${p} MIN` : c.truck ? `LOG TRUCK! +${p} MIN` : `BONK! +${p} MIN`);
        }
      }
      // ---- no car can ever be inside another car ----
      // anything sharing a lane with a car just ahead of it is held back a safe gap and matches its speed;
      // a car drifting into a lane that isn't clear gives up and slides back where it came from
      const live2 = cars.filter(c => !c.parked && !(c.spin > 0));
      for (const c of live2) {
        if (c.off !== c.tgt) { const clash = live2.some(o => o !== c && o.onc === c.onc && Math.abs(o.off - c.tgt) < 0.3 && Math.abs(o.z - c.z) < 3 * SEG);
          if (clash) { c.lane = c.lane === 2 ? 1 : 2; c.tgt = LANE[c.lane]; c.blink = 0; } }
      }
      for (let pass = 0; pass < 2; pass++) for (const c of live2) for (const o of live2) {
        if (o === c || o.onc !== c.onc) continue;
        if (Math.abs(o.off - c.off) > c.hw + o.hw - 0.04) continue;                     // not side by side enough to touch
        const gap = (c.truck || o.truck ? 2.2 : 1.6) * SEG, ahead = c.onc ? c.z - o.z : o.z - c.z;   // oncoming traffic drives the other way
        if (ahead >= 0 && ahead < gap) { if (c.onc) c.z = o.z + gap; else c.z = o.z - gap; c.speed = c.onc ? Math.max(c.speed, o.speed) : Math.min(c.speed, o.speed); }
      }
      // never more than two abreast on our side (two lanes = two cars), and a car mid lane-change has nobody beside it
      { const ours = live2.filter(c => !c.onc).sort((a, b) => b.z - a.z), W2 = 2.5 * SEG;
        for (let i = 0; i < ours.length; i++) { const c = ours[i];
          const near = ours.slice(0, i).filter(o => c.z > o.z - W2);                       // cars ahead of it, close enough to look side by side
          if (RIVAL && rz >= c.z && rz - c.z < W2) near.push({ z: rz, off: roff, tgt: roff });
          const moving = o => Math.abs(o.off - o.tgt) > 0.01;
          if (near.length >= 2 || (near.length && (moving(c) || near.some(moving) || near.some(o => Math.abs(o.off - c.off) < 0.3)))) {
            const lead = near.reduce((m, o) => o.z < m.z ? o : m); c.z = Math.min(c.z, lead.z - W2); c.speed = Math.min(c.speed, (lead.speed || c.speed)); } } }
      if (RIVAL) for (const o of live2) if (!o.onc && Math.abs(o.off - roff) < 0.16 + o.hw && o.z > rz && o.z - rz < 1.6 * SEG) { rz = o.z - 1.6 * SEG; rv = Math.min(rv, o.speed); }
      // the rival: fast, takes the left lane, slows for traffic, and never lets the race get boring (rubber band)
      if (RIVAL && live) {
        const gap = (rz - (pos + PZ)) / SEG;
        let want = TOP * 0.93 * (gap > 25 ? 0.82 : gap < -20 ? 1.12 : 1);
        for (const o of cars) if (!o.onc && !o.parked && Math.abs(o.off - roff) < 0.3 && o.z > rz && o.z - rz < 3 * SEG) { const other = roff === LANE[1] ? LANE[2] : LANE[1];   // pass it if the other lane is open, otherwise wait
          if (!cars.some(q => q !== o && !q.onc && !q.parked && Math.abs(q.off - other) < 0.3 && Math.abs(q.z - rz) < 4 * SEG)) roff += (other - roff) * Math.min(1, dt * 3); else want = Math.min(want, o.speed); }
        rivalBump = Math.max(0, rivalBump - dt); if (rivalBump > 0) want *= 0.4;
        rv += (want - rv) * Math.min(1, dt * 0.8); rz += rv * dt;
        if (inv <= 0 && Math.abs(rz - (pos + PZ)) < SEG * 1.0 && Math.abs(px - roff) < 0.16 + 0.17) {   // trading paint
          inv = 1.0; shake = 0.4; rivalBump = 1.2; speed *= 0.6; px += px < roff ? -0.25 : 0.25; sfx('horn_angry'); say('TRADING PAINT WITH THE CLOG KINGS!', 1.2); }
        if (!rivalWon && rz >= (N - 40) * SEG && pos < (N - 40) * SEG) { rivalWon = true; say('THE CLOG KINGS GOT THERE FIRST!', 2.5); sfx('horn_angry'); }
      }
      // critters wander onto the road when you get close
      for (const cr of critters) {
        const dz = cr.seg * SEG - pos;
        if (!cr.dir && dz > 0 && dz < 60 * SEG) { cr.dir = -Math.sign(cr.off); say({ moose: 'MOOSE!', deer: 'DEER!', turkeys: 'TURKEYS!', peeper: 'LEAF PEEPER IN THE ROAD!' }[cr.kind]); }
        if (cr.fly > 0) { cr.fly += dt; continue; }
        if (cr.dir) {
          if (cr.kind === 'peeper' && !cr.snapped && Math.abs(cr.off) < 0.4) { cr.snapped = true; cr.snap = 1.6; }
          if (cr.snap > 0) { cr.snap -= dt; cr.flash = (cr.flash + dt) % 0.4; } else cr.off += cr.dir * CSPD[cr.kind] * dt * 1.4;
        }
        if (live && !cr.hit && inv <= 0 && Math.abs(dz - PZ) < SEG * 1.1 && Math.abs(px - cr.off) < CW[cr.kind] + 0.1) {
          cr.hit = true; crashes++; inv = 1.4; shake = cr.kind === 'moose' ? 0.7 : 0.3; penalty += PEN[cr.kind]; speed *= cr.kind === 'moose' ? 0.1 : 0.4;
          cr.dir = Math.sign(cr.off - px) || 1; cr.snap = 0;
          if (cr.kind !== 'moose') { cr.fly = 0.001; cr.flyDir = cr.dir; }   // up and over the roof
          sfx(cr.kind === 'moose' ? 'horn_angry' : 'horn');
          say({ moose: 'HIT THE MOOSE! +20 MIN', deer: 'OH DEER. +12 MIN', turkeys: 'FEATHERS! +5 MIN', peeper: 'SLAMMED THE BRAKES! +8 MIN' }[cr.kind]);
        }
      }
      inv = Math.max(0, inv - dt); msgT = Math.max(0, msgT - dt); shake = Math.max(0, shake - dt);
      if (window.DRV && DRV.src) DRV.src.playbackRate.value = 0.7 + 0.6 * ratio;
      draw(gas, brake, steer);
      if (pos >= (N - 40) * SEG) {
        done = true; removeEventListener('keydown', kd); removeEventListener('keyup', ku); rc.onpointerdown = rc.onpointerup = rc.onpointermove = rc.onpointercancel = null;
        const mins = Math.round(opts.leave + play * MIN_PER_S + penalty);
        say('MADE IT!', 2); draw(false, true, 0);
        setTimeout(() => { rc.style.display = 'none'; res({ crashes, mins, rivalWon }); }, 700); return;
      }
      requestAnimationFrame(frame);
    }

    function draw(gas, brake, steer) {
      r.save();
      if (shake > 0) r.translate((Math.random() - .5) * 6 * shake * 2, (Math.random() - .5) * 4 * shake * 2);
      // sky
      if (!draw.sky) { draw.sky = r.createLinearGradient(0, 0, 0, HORIZON + 10); draw.sky.addColorStop(0, SEA.sky[0]); draw.sky.addColorStop(1, SEA.sky[1]); }
      r.fillStyle = draw.sky; r.fillRect(-10, -10, W + 20, HORIZON + 30);
      if (MTN_IMG.width) {   // the real range, tiled with every other copy mirrored so the seams always line up
        const mw = 380, mh = MTN_IMG.height * mw / MTN_IMG.width, my = HORIZON + 12 - mh, m2 = ((skyX % (mw * 2)) + mw * 2) % (mw * 2);
        for (let k = -1; k < 2; k++) { const x0 = k * mw * 2 - m2; r.drawImage(MTN_IMG, x0, my, mw, mh); r.save(); r.translate(x0 + mw * 2, my); r.scale(-1, 1); r.drawImage(MTN_IMG, 0, 0, mw, mh); r.restore(); }
      } else { const mx = ((skyX % 480) + 480) % 480; r.drawImage(MTN, -mx, HORIZON - 70); r.drawImage(MTN, 480 - mx, HORIZON - 70); r.drawImage(MTN, -480 - mx, HORIZON - 70); }
      r.fillStyle = SEA.ground; r.fillRect(-10, HORIZON + 8, W + 20, H);
      // road, far to near clipped
      const base = segAt(pos), pct = (pos % SEG) / SEG, playerY = (base.p1.y + (base.p2.y - base.p1.y) * pct);
      const camY = playerY + CAMH, camZ = pos - (pos >= LEN ? LEN : 0);
      let x = 0, dx = -(base.curve * pct), maxy = H;
      const drawn = [];
      for (let n = 0; n < DRAW; n++) {
        const sg = segs[(base.i + n) % N], loop = sg.i < base.i ? LEN : 0;
        const p1 = { z: sg.p1.z + loop, y: sg.p1.y, wx: x }, p2 = { z: sg.p2.z + loop, y: sg.p2.y, wx: x + dx };
        project(p1, px * ROADW, camY, camZ); project(p2, px * ROADW, camY, camZ);
        x += dx; dx += sg.curve;
        sg.clip = maxy; sg.s1 = p1; sg.s2 = p2; drawn.push(sg);
        if (p1.z - camZ <= DEPTH || p2.sy >= maxy || p2.sy >= p1.sy) continue;
        r.fillStyle = sg.dark ? G2 : G1; r.fillRect(-10, p2.sy, W + 20, p1.sy - p2.sy + 1);
        const rum = w => w * 0.08, lane = w => w * 0.022;
        if (sg.river || sg.lake) { const wc = SNOW ? '#7896af' : '#4574a6';   // the river (or lake) off to the right
          poly(p1.sx + p1.sw * (sg.lake ? 3.4 : 2.6), p1.sy, p1.sw * (sg.lake ? 1.4 : 0.7), p2.sx + p2.sw * (sg.lake ? 3.4 : 2.6), p2.sy, p2.sw * (sg.lake ? 1.4 : 0.7), wc); }
        poly(p1.sx, p1.sy, p1.sw * 1.16, p2.sx, p2.sy, p2.sw * 1.16, SNOW ? '#95908a' : '#7f674a');   // dirt (or slushy sand) shoulder, one solid color
        poly(p1.sx, p1.sy, p1.sw, p2.sx, p2.sy, p2.sw, '#4f5258');   /* asphalt: one solid color */                                                                // asphalt
        for (const e of [-1, 1]) poly(p1.sx + e * p1.sw * 0.95, p1.sy, Math.max(0.5, p1.sw * 0.012), p2.sx + e * p2.sw * 0.95, p2.sy, Math.max(0.5, p2.sw * 0.012), '#e8eaec');   // solid white edge line
        // (snow lives on the shoulder now, so the white edge line stays readable)
        { const yx = w => -w / 3;   // double yellow: oncoming lane on the left
          poly(p1.sx + yx(p1.sw) - lane(p1.sw) * 1.4, p1.sy, lane(p1.sw) * 0.6, p2.sx + yx(p2.sw) - lane(p2.sw) * 1.4, p2.sy, lane(p2.sw) * 0.6, '#f2c12e');
          poly(p1.sx + yx(p1.sw) + lane(p1.sw) * 1.4, p1.sy, lane(p1.sw) * 0.6, p2.sx + yx(p2.sw) + lane(p2.sw) * 1.4, p2.sy, lane(p2.sw) * 0.6, '#f2c12e');
          if (Math.floor(sg.i / 3) % 4 === 0) poly(p1.sx + p1.sw / 3, p1.sy, lane(p1.sw) * 0.8, p2.sx + p2.sw / 3, p2.sy, lane(p2.sw) * 0.8, '#eef0f2'); }   // dashed white between our two lanes: short dash, long gap
        maxy = p1.sy;
      }
      // sprites, cars, critters back to front
      const S = (img, sc, sx, sy, off, sw, clip, rot) => {
        const wpx = img.width * sc * sw / 160, hpx = img.height * sc * sw / 160, X = sx + sw * off - wpx / 2, Y = sy - hpx;
        if (wpx < 1 || Y > H || (hpx > 190 && !rot)) return;   // anything taller than the screen is whooshing past: skip it rather than smear giant pixels
        if (rot) { r.save(); r.translate(X + wpx / 2, Y + hpx / 2); r.rotate(rot); r.drawImage(img, -wpx / 2, -hpx / 2, wpx, hpx); r.restore(); return { X, Y, w: wpx, h: hpx }; }
        const ch = clip != null ? Math.max(0, Y + hpx - clip) : 0; if (ch >= hpx || (ch > hpx * 0.45 && !rot)) return;
        const srcH = img.height * (1 - ch / hpx);
        r.drawImage(img, 0, 0, img.width, srcH, Math.round(X), Math.round(Y), Math.round(wpx), Math.round(hpx - ch));
        return { X, Y, w: wpx, h: hpx - ch };
      };
      for (let n = drawn.length - 1; n > 0; n--) {
        const sg = drawn[n], p = sg.s1; if (!p || p.sc <= 0) continue;
        for (const sp of sg.sprites) S(sp.img, sp.scale * 2.6, p.sx, p.sy, sp.off, p.sw, sg.clip);
        if (RIVAL && rz > pos && segAt(rz) === sg) { makeRival(); if (rivalImg) S(rivalImg, 0.62, p.sx, p.sy, roff, p.sw, sg.clip); }
        for (const c of cars) if (!c.parked && segAt(c.z) === sg) { const b = S(c.img, c.sc, p.sx, p.sy, c.off, p.sw, sg.clip, c.rot);
          if (b && c.blink > 0 && Math.floor(t * 4) % 2) { const bw = Math.max(2, b.w * 0.16), bh = Math.max(2, b.w * 0.1), bx = c.next < c.lane ? b.X - bw * 0.3 : b.X + b.w - bw * 0.7;
            r.fillStyle = '#ffb020'; r.fillRect(bx, b.Y + b.h * 0.5, bw, bh); r.fillStyle = 'rgba(255,176,32,.35)'; r.fillRect(bx - bw * 0.5, b.Y + b.h * 0.5 - bh * 0.5, bw * 2, bh * 2); } }
        for (const cr of critters) if (!cr.fly && cr.seg === sg.i && Math.abs(cr.off) < 3) {
          { let im = ANIM[cr.kind] ? ANIM[cr.kind][cr.dir && !cr.snap ? Math.floor(t * 6) % 2 : 0] : CIMG[cr.kind]; if (cr.dir < 0 && ANIM[cr.kind]) im = flipped(im);   // walk cycle, facing the way it's going
            S(im, cr.kind === 'moose' ? 2.1 : cr.kind === 'turkeys' ? 0.9 : 1.5, p.sx, p.sy, cr.off, p.sw, sg.clip); }
          if (cr.kind === 'peeper' && cr.snap > 0 && cr.flash < 0.15) S(FLASH, 1, p.sx, p.sy - p.sw * 0.1, cr.off + 0.08, p.sw, sg.clip);
        }
      }
      // falling snow
      if (SNOW) { r.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 60; i++) r.fillRect((i * 97 + t * 30 * (1 + i % 3) + px * 40) % W, (i * 53 + t * (40 + i % 7 * 9)) % H, 1, 1); }
      // our van
      if (!(inv > 0 && Math.floor(t * 10) % 2)) {
        const vx = W / 2 - 36 + steer * 6, vy = H - 58 - bounce * 6 + (Math.abs(px) > 1 ? (Math.random() - .5) * 3 : 0);
        if (VANS.complete && VANS.naturalWidth) { const fi = (brake ? 3 : 0) + (steer > 0 ? 2 : steer < 0 ? 1 : 0);   /* right turn shows the van's right side */
          r.drawImage(VANS, fi * VANS.width / 6, 0, VANS.width / 6, VANS.height, Math.round(vx + 36 - VCW / 2), Math.round(vy + 52 - VCH), VCW, VCH); }
        else if (vanFail) { r.save(); r.translate(vx + 36, vy + 52); r.rotate(steer * 0.04); r.scale(1.35, 1.35); r.drawImage(brake ? VANBRAKE : VAN, -36, -52); r.restore(); }
        if (gas && speed > CRUISE * 0.9) { r.fillStyle = 'rgba(200,200,205,.6)'; for (let i = 0; i < 3; i++) r.fillRect(vx + 20 + Math.random() * 4, vy + 50 + i * 3, 3, 2); }
      }
      for (const cr of critters) if (cr.fly > 0 && cr.fly < 1.3) {
        const k = cr.fly / 1.3, img = CIMG[cr.kind], sc = (cr.kind === 'deer' ? 2.4 : 2) * (1.4 - k * 0.9);
        const fx = W / 2 + cr.flyDir * (20 + 140 * k), fy = H - 60 - Math.sin(k * Math.PI) * 170 + k * 20;
        r.save(); r.translate(fx, fy); r.rotate(cr.flyDir * k * 9); r.drawImage(img, -img.width * sc / 2, -img.height * sc / 2, img.width * sc, img.height * sc); r.restore();
        if (k < 0.3) { r.fillStyle = 'rgba(255,255,255,.8)'; for (let i = 0; i < 6; i++) r.fillRect(W / 2 + (i - 3) * 9, H - 70 - i * 3 - k * 60, 3, 3); }   // fur and feathers
      }
      r.restore();
      // HUD
      const mins = Math.round(opts.leave + play * MIN_PER_S + penalty), late = mins > opts.due;
      r.fillStyle = 'rgba(16,21,31,.92)'; r.fillRect(0, 0, W, 20);
      r.font = '8px "Press Start 2P", monospace'; r.textBaseline = 'middle'; r.textAlign = 'left';
      r.fillStyle = late ? '#e9665a' : '#fff'; r.fillText(opts.clock(mins), 6, 10);
      r.fillStyle = '#f7c418'; r.fillText('DUE ' + opts.clock(opts.due).replace(/ ?[AP]M/, ''), 82, 10);
      r.fillStyle = '#fff'; r.fillText(from.slice(0, 8), 166, 10); r.textAlign = 'right'; r.fillText(to.slice(0, 9), 474, 10); r.textAlign = 'left';
      const prog = Math.min(1, pos / ((N - 40) * SEG));
      { const L = LEGS_HERE[(segAt(pos) || {}).leg || 0]; if (L) { r.font = '6px "Press Start 2P", monospace'; r.textAlign = 'left'; r.fillStyle = 'rgba(16,21,31,.7)'; r.fillRect(4, 24, 8 + (L.rt + '  ' + L.name).length * 6, 12); r.fillStyle = '#f7c418'; r.fillText(L.rt + '  ' + L.name, 8, 30); r.font = '8px "Press Start 2P", monospace'; } }
      if (RIVAL) { const rp = Math.min(1, rz / ((N - 40) * SEG)); r.fillStyle = '#e9665a'; r.fillRect(236 + 150 * rp, 3, 4, 14);
        r.font = '6px "Press Start 2P", monospace'; r.textAlign = 'center'; r.fillStyle = rz > pos + PZ ? '#e9665a' : '#7bd65b';
        r.fillText(rz > pos + PZ ? `CLOG KINGS AHEAD ${Math.round((rz - pos - PZ) / SEG)}` : 'YOU LEAD!', 313, 28); r.font = '8px "Press Start 2P", monospace'; r.textAlign = 'left'; }
      r.fillStyle = '#2c3326'; r.fillRect(238, 7, 150, 6); r.fillStyle = '#7bd65b'; r.fillRect(238, 7, 150 * prog, 6); r.fillStyle = '#f7c418'; r.fillRect(236 + 150 * prog, 5, 4, 10);
      // speedometer
      const mph = Math.round(speed / MPH);
      r.fillStyle = 'rgba(16,21,31,.7)'; r.fillRect(W - 78, 26, 72, 18); r.fillStyle = speed > TOP * 0.97 ? '#f7c418' : '#7bd65b'; r.textAlign = 'right'; r.fillText(mph + ' MPH', W - 10, 35); r.textAlign = 'left';
      if (crashes) { r.fillStyle = '#e9665a'; r.textAlign = 'right'; r.fillText('CRASHES ' + crashes, W - 6, 52); r.textAlign = 'left'; }
      // phone buttons (also show what the keys do)
      if (true) {   // brake in both corners, gas = both thumbs (keyboard: ▲)
        r.fillStyle = brake ? 'rgba(233,102,90,.6)' : 'rgba(16,21,31,.45)'; r.fillRect(4, H - 46, 92, 40); r.fillRect(W - 96, H - 46, 92, 40);
        r.fillStyle = '#fff'; r.textAlign = 'center'; r.fillText(brake ? 'BRAKE!' : '▼ BRAKE', 50, H - 26); r.fillText(brake ? 'BRAKE!' : '▼ BRAKE', W - 50, H - 26);
        if (gas) { r.fillStyle = '#7bd65b'; r.textAlign = 'right'; r.fillText('GAS!', W - 10, crashes ? 66 : 52); } r.textAlign = 'left';
      } else {
        r.fillStyle = gas ? 'rgba(123,214,91,.6)' : 'rgba(16,21,31,.45)'; r.fillRect(4, H - 46, 92, 40);
        r.fillStyle = brake ? 'rgba(233,102,90,.6)' : 'rgba(16,21,31,.45)'; r.fillRect(W - 96, H - 46, 92, 40);
        r.fillStyle = '#fff'; r.textAlign = 'center'; r.fillText(gas ? 'GAS!' : '▲ GAS', 50, H - 26); r.fillText(brake ? 'BRAKE!' : '▼ BRAKE', W - 50, H - 26); r.textAlign = 'left';
      }
      if (t < 2.0 && helpSeen) {   // seen the controls before: just the road name and the go signal
        r.fillStyle = 'rgba(16,21,31,.85)'; r.fillRect(150, 80, 180, RIVAL ? 58 : 46); r.textAlign = 'center';
        const L0 = LEGS_HERE[0]; r.fillStyle = '#9fb3d9'; r.fillText(L0 && L0.name ? `${L0.rt} · ${L0.name}` : (opts.route || 'ROUTE 2').toUpperCase(), 240, 94);
        if (RIVAL) { r.fillStyle = '#e9665a'; r.fillText('RACE THE CLOG KINGS!', 240, 108); }
        r.fillStyle = '#f7c418'; r.font = '12px "Press Start 2P", monospace'; r.fillText(t < 1.2 ? 'READY' : 'GO!', 240, RIVAL ? 126 : 114); r.font = '8px "Press Start 2P", monospace'; r.textAlign = 'left';
      } else if (t < 2.0) {
        r.fillStyle = 'rgba(16,21,31,.9)'; r.fillRect(110, 70, 260, 90);
        r.fillStyle = '#f7c418'; r.textAlign = 'center'; r.fillText((opts.route || 'ROUTE 2').toUpperCase(), 240, 86);
        r.fillStyle = '#fff'; r.fillText(TOUCH ? 'ONE THUMB STEERS · BOTH = GAS' : '◀ ▶ STEER   ▲ GAS   ▼ BRAKE', 240, 106);
        if (RIVAL) { r.fillStyle = '#e9665a'; r.fillText('RACE THE CLOG KINGS!', 240, 96); }
        r.fillStyle = '#9fb3d9'; r.fillText(`${DRIVER === 'matt' ? 'MATT' : 'ROD'} DRIVES · TOP ${DRIVER === 'matt' ? 60 : 40} MPH`, 240, 124); r.fillText('WATCH FOR BLINKERS + MOOSE', 240, 138);
        r.fillStyle = '#f7c418'; r.font = '12px "Press Start 2P", monospace'; r.fillText(t < 1.2 ? 'READY' : 'GO!', 240, 154); r.textAlign = 'left';
      }
      if (msgT > 0) { r.font = '10px "Press Start 2P", monospace'; r.textAlign = 'center'; r.fillStyle = '#000'; r.fillText(msg, 241, 69); r.fillStyle = '#f7c418'; r.fillText(msg, 240, 68); r.textAlign = 'left'; }
    }
    requestAnimationFrame(frame);
  });
}
