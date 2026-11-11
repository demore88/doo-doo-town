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
  const LANE = [-2 / 3, 0, 2 / 3, 4 / 3, 2, -4 / 3];   /* 0 and 5 come at you (5 only where the road opens up); 1-4 go your way (3 and 4 only where it opens up) */                           // left lane = oncoming · the two on the right go our way
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
  if (opts.endless) {   /* the Driving Game: wander the real roads leg after leg, as far as you can get */
    LEGS_HERE = []; let at = 'BERLIN', last = null, mi = 0;
    while (mi < 220) { const opt = LEGS.filter(L => (L.a === at || L.b === at) && L !== last), L = opt[Math.floor(Math.random() * opt.length)] || LEGS[0], rev = L.a !== at;
      LEGS_HERE.push({ ...L, rev }); mi += L.mi; at = rev ? L.a : L.b; last = L; } }
  if (!LEGS_HERE || !LEGS_HERE.length) LEGS_HERE = [{ rt: (opts.route || 'Route 16').toUpperCase().replace('ROUTE', 'RT'), name: '', mi: 12, curve: 3.5, hill: 700, heave: 0.2, busy: 1, scene: [] }];
  const TOTAL_MI = LEGS_HERE.reduce((a, L) => a + L.mi, 0);
  const RACE = !!opts.rival;   // racing the Clog Kings: a long open-road run, about two minutes flat out
  const SEG_PER_MI = RACE ? (125 * TOP * 0.88 / SEG) / TOTAL_MI : opts.endless ? 40 : Math.max(48, Math.min(110, 1450 / TOTAL_MI));            // short hops still feel like a drive; long hauls don't drag forever
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
  segs.forEach((sg, k) => { sg.rt = 1; sg.lt = -1; if (opts.endless) { const mi = k / SEG_PER_MI, w = (a, b) => Math.max(0, Math.min(1, (mi - a) / (b - a))); sg.lt = -1 - (2 / 3) * w(12, 13); sg.rt = 1 + (4 / 3) * w(35, 36.5); } });   /* mile 12: two lanes each way · mile 35: four your way, still two coming at you (six in all) */
  const N = segs.length, LEN = N * SEG;
  const sgAt = z => segs[Math.max(0, Math.min(segs.length - 1, Math.floor(z / SEG)))], rtAt = z => { const sg = sgAt(z); return sg ? sg.rt : 1; }, ltAt = z => { const sg = sgAt(z); return sg ? sg.lt : -1; };
  const ourLanes = z => Math.max(2, Math.round((rtAt(z) + 1) / (2 / 3)) - 1), oncLanes = z => ltAt(z) < -1.5 ? 2 : 1;   /* how many lanes each way here */

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
  const DSPLAT = DI('deer_splat');
  const FEATH = DI('feathers');
  const CRASH = DI('crash');
  const MREACT = DI('moose_react'), MFR = [];   // the moose, unimpressed (6 frames, faces left)
  const mooseFrame = i => { if (!(MREACT.complete && MREACT.naturalWidth)) return null; if (!MFR.length) { const fw = MREACT.width / 6; for (let k = 0; k < 6; k++) { const c = document.createElement('canvas'); c.width = fw; c.height = MREACT.height; c.getContext('2d').drawImage(MREACT, k * fw, 0, fw, MREACT.height, 0, 0, fw, MREACT.height); MFR.push(c); } } return MFR[i]; };   // bumper-hit burst (6 frames, 2x sheet)
  const bursts = [];   // the turkey family, all at once (6 frames, 2x sheet)   // the deer, face on the windshield (6 frames, sliding down)
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
  let rz = PZ + 45 * SEG, rv = 0, roff = LANE[1], rivalWon = false, rivalImg = null, rivalBump = 0;
  let rivalLane = LANE[1], rivalT = 0, rivalSlip = 0;
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
    const nOur = ourLanes(z), lane = onc ? (oncLanes(z) > 1 && Math.random() < 0.5 ? 5 : 0) : nOur <= 2 ? (Math.random() < 0.65 ? 2 : 1) : 1 + Math.floor(Math.random() * nOur);
    // our-way traffic is slower than us (you catch up and pass); log trucks crawl
    return { z, lane, off: LANE[lane], tgt: LANE[lane], speed: onc ? -rnd(25, 45) * MPH : (truck ? rnd(18, 24) : rnd(22, 34)) * MPH * (DRIVER === 'rod' ? 0.8 : 1),
      img, onc, hw: (img.width || (truck ? 50 : 44)) * sc / 320, sc, truck, blink: 0 };
  }
  // traffic lives in a window around the van: anything that falls behind gets sent back up the road (so it never runs dry)
  const BUSY_MAX = Math.max(...LEGS_HERE.map(L => L.busy || 1));
  if (RACE) { MODE.cars = Math.max(2, Math.round(MODE.cars * 0.45)); MODE.crit = Math.max(1, Math.round(MODE.crit * 0.5)); }   // less traffic in the way of the race
  for (let i = 0; i < Math.round(MODE.cars * Math.min(1, Math.max(0.6, BUSY_MAX))); i++) { let c, tries = 0; do { c = addCar(rnd(14, DRAW) * SEG, Math.random() < MODE.onc); tries++; } while (tries < 10 && cars.some(o => o.lane === c.lane && Math.abs(o.z - c.z) < 4 * SEG)); cars.push(c); }
  if (typeof DDT !== 'undefined' && DDT.DEV) window.__cars = cars;
  if (typeof DDT !== 'undefined' && DDT.DEV) window.__jump = mi => { pos = mi * SEG_PER_MI * SEG; };   /* dev: jump down the road */   // dev: lets the test harness check for overlaps
  const respawn = (c, base) => {   // reappear far up the road (out at the horizon), in a lane with room, and never in the last stretch before town
    const z = base + rnd(DRAW * 0.85, DRAW) * SEG;
    if (z > (N - 60) * SEG) { c.z = -1e12; c.parked = true; return; }
    const busy = (LEGS_HERE[(segAt(z) || {}).leg || 0] || {}).busy ?? 1;
    if (Math.random() > Math.min(1, busy)) { c.z = -1e12; c.parked = true; c.retry = 1; return; }   // quiet back roads: fewer cars come back
    const n = addCar(z, Math.random() < MODE.onc);
    if (cars.some(o => o !== c && !o.parked && o.lane === n.lane && Math.abs(o.z - z) < 4 * SEG)) { c.z = -1e12; c.parked = true; c.retry = 1; return; }
    Object.assign(c, n, { parked: false, nm: 0, prevAhead: undefined });
  };
  const critters = [];
  const CK = FALL ? ['peeper', 'peeper', 'moose', 'deer', 'turkeys'] : ['moose', 'deer', 'turkeys', 'moose'];
  if (!opts.endless) for (let i = 0; i < MODE.crit; i++) critters.push({ seg: Math.floor(rnd(0.12, 0.92) * N), kind: CK[Math.floor(Math.random() * CK.length)], off: Math.random() < .5 ? -1.6 : 1.6, dir: 0, hit: false, snap: 0, flash: 0 });
  else for (let mi = 0.6; mi < N / SEG_PER_MI - 1; mi += 1) {   /* the Driving Game: turkeys first, then deer join in, then moose; more of them the farther you go */
    const n = Math.min(4, Math.floor(0.4 + mi / 9 + Math.random()));
    for (let j = 0; j < n; j++) { const sg0 = Math.floor((mi + Math.random()) * SEG_PER_MI), pool = mi < 5 ? ['turkeys'] : mi < 14 ? ['turkeys', 'deer', 'deer'] : ['turkeys', 'deer', 'deer', 'moose'], sgo = segs[sg0] || {};
      const kind = pool[Math.floor(Math.random() * pool.length)];
      critters.push({ seg: sg0, kind, spd: kind === 'deer' ? Math.min(1.7, 1 + mi * 0.025) : 1, off: Math.random() < .5 ? (sgo.lt || -1) - 0.6 : (sgo.rt || 1) + 0.6, dir: 0, hit: false, snap: 0, flash: 0 }); } }   /* deer get quicker the farther you go, topping out at 1.7x */
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
  if (typeof DDT !== 'undefined' && DDT.DEV) window.__moose = () => { const c = { kind: 'moose', seg: Math.floor((pos + PZ) / SEG), off: px, dir: -1, hit: true, react: 0.001 }; critters.push(c); }; window.__crash = () => bursts.push({ t: 0, side: 0.3, big: false }); window.__turk = () => critters.push({ kind: 'turkeys', seg: 0, off: 0, dir: 1, hit: true, fly: 0.001, flyDir: 1 }); window.__deer = (d = 1) => critters.push({ kind: 'deer', seg: 0, off: 0, dir: d, hit: true, fly: 0.001, flyDir: d });   // dev: test the windshield deer
  const sfx = (n, o) => { if (window.DDTSfx) DDTSfx.play(n, o); };
  // ---------- the windshield: cracks that stick around (and grow with every hit), bugs, mud, and now and then some weather ----------
  let glass = 0; if (!opts.arcade) try { glass = (DDT.get() || {}).glass || 0; } catch (e) {}   /* menu drives start with clean glass */
  // the Driving Game: score, near misses, and toolboxes on the road that patch the van back up
  let score = 0, combo = 0, comboT = 0; const KITS = [], KIT_IMG = new Image(); KIT_IMG.src = (typeof ART !== 'undefined' ? ART : 'assets/') + 'mg/sr2_toolbox.png';
  if (opts.endless) for (let z = 1.2 * SEG_PER_MI * SEG; z < (N - 80) * SEG; z += rnd(0.9, 1.6) * SEG_PER_MI * SEG) { const n = ourLanes(z); KITS.push({ z, off: LANE[1 + Math.floor(Math.random() * n)], got: false }); }
  const STATS = { cars: 0, trucks: 0, headons: 0, deer: 0, moose: 0, turkeys: 0, peeper: 0, lost: 0, cracks: 0 };   // this drive's tally, added to the player's record at the end
  let DEERINS = false; try { DEERINS = !!((DDT.get() || {}).inv || {}).deerins; } catch (e) {}
  const hurtGlass = n => { if (!n) return; STATS.cracks += n; glass = Math.min(14, glass + n); if (!opts.arcade) try { const s = DDT.get(); s.glass = glass; DDT.save(s); } catch (e) {} };
  const rng = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  // where each new crack lands, in order: around the edges first, so the road ahead stays readable longest
  const CRACK_AT = [[408, 64], [66, 84], [446, 168], [34, 206], [338, 42], [132, 46], [462, 236], [18, 132], [292, 58], [196, 52], [424, 112], [70, 244], [244, 40], [372, 222]];
  const CRACKS = CRACK_AT.map(([cx, cy], i) => { const R = rng(97 + i * 131), rays = [];
    const n = 5 + Math.floor(R() * 4), big = 22 + R() * 34;
    for (let k = 0; k < n; k++) { let a = (k / n) * Math.PI * 2 + R() * 0.6, x = cx, y = cy; const pts = [[x, y]], len = big * (0.5 + R() * 0.7);
      for (let d = 0; d < len; d += 6 + R() * 6) { a += (R() - 0.5) * 0.5; x += Math.cos(a) * 8; y += Math.sin(a) * 8; pts.push([x, y]); }
      rays.push(pts); }
    return { cx, cy, rays, ring: 5 + R() * 5 }; });
  const ZONE = SNOW ? 'snow' : SEA.name === 'mud' ? 'mud' : ['spring', 'summer', 'early fall'].includes(SEA.name) ? 'bugs' : 'none';
  const events = [];   // { at: progress 0-1, kind }
  if (ZONE === 'bugs' && Math.random() < 0.4) { const n = 1 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) events.push({ at: 0.1 + Math.random() * 0.75, kind: 'bug' }); }
  if ((ZONE === 'mud' || SEA.name === 'thaw') && Math.random() < 0.45) { const n = 1 + (Math.random() < 0.35 ? 1 : 0); for (let i = 0; i < n; i++) events.push({ at: 0.12 + Math.random() * 0.7, kind: 'mud' }); }
  const WXF = typeof DDT !== 'undefined' && DDT.DEV && DDT.param && DDT.param('wx');   // dev: ?wx=rain|fog|squall
  const WX = WXF ? WXF : Math.random() < 0.16 ? (SNOW ? 'squall' : Math.random() < 0.6 ? 'rain' : 'fog') : null;   // weather: only once in a while
  const wxFrom = WXF ? 0 : 0.1 + Math.random() * 0.45, wxTo = Math.min(0.95, wxFrom + 0.25 + Math.random() * 0.3);
  const bugs = [], muds = [], drops = []; let rainSnd = null;
  function splatBug() { const x = 40 + Math.random() * 400, y = 30 + Math.random() * 170, R = rng(1 + Math.floor(Math.random() * 99999)), big = Math.random() < 0.3;
    const dots = []; for (let i = 0; i < (big ? 22 : 13); i++) { const a = R() * 7, d = Math.pow(R(), 1.5) * (big ? 16 : 10); dots.push([Math.cos(a) * d, Math.sin(a) * d * 0.8, Math.max(1, (big ? 5 : 3.5) * (1 - d / (big ? 16 : 10)) + R())]); }
    bugs.push({ x, y, dots, col: ['#cfd94a', '#b8c83a', '#e0c83a', '#9fbf3a'][Math.floor(R() * 4)], big, t: 0 }); sfx('squish', { vol: 0.6 }); if (Math.random() < 0.4) say(big ? 'JUNE BUG. GROSS.' : 'BUG!', 1); }
  function splatMud() { const R = rng(1 + Math.floor(Math.random() * 99999)), side = Math.random() < 0.5 ? -1 : 1, blobs = [];
    const cx = W / 2 + side * (60 + R() * 120), cy = 150 + R() * 70;
    for (let i = 0; i < 90; i++) { const a = R() * 7, d = Math.pow(R(), 1.6) * 110; blobs.push([cx + Math.cos(a) * d * 1.3, cy + Math.sin(a) * d * 0.7, Math.max(0.8, (1 - d / 110) * (1.5 + R() * 5)), R()]); }
    muds.push({ blobs, t: 0 }); sfx('splash', { vol: 0.7 }); say('MUD!', 1); }
  let glassT = 0;
  if (typeof DDT !== 'undefined' && DDT.DEV) { window.__bug = () => splatBug(); window.__mud = () => splatMud(); window.__glass = n => { glass = n; }; }
  const glassFor = { car: 1, truck: 2, onc: 3, moose: 3, deer: 2, turkeys: 1, peeper: 0 };

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
      const RT = seg.rt || 1, LT = seg.lt || -1, offR = px < LT || px > RT, outBy = px < LT ? LT - px : px - RT;
      if (offR) { const deep = SNOW && outBy > 0.1, floor = (deep ? 0.07 : SNOW ? 0.15 : 0.22) * MAX; if (live) { penalty += dt * (deep ? 0.9 : 0.4); offT = (offT || 0) + dt; } /* stuck in it: minutes tick away */ if (speed > floor) speed = floor + (speed - floor) * Math.pow(0.1, dt); /* grass/snow drags you to a crawl, never backwards */ shake = Math.max(shake, 0.08); if (SNOW && Math.abs(px) > 1.15) { px = Math.sign(px) * 1.15; if (msgT <= 0) say('SNOWBANK!', 0.8); } }
      px = Math.max(LT - 0.6, Math.min(RT + 0.6, px));
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
          const max = ourLanes(c.z), opts2 = [c.lane - 1, c.lane + 1].filter(l => l >= 1 && l <= max), nl = opts2[Math.floor(Math.random() * opts2.length)] || c.lane; if (nl !== c.lane && !cars.some(o => o !== c && !o.parked && !o.onc && Math.abs(o.z - c.z) < 4 * SEG && Math.abs(o.off - LANE[nl]) < 0.3)) { c.blink = 1.5; c.next = nl; c.prev = c.lane; } }
        if (c.blink > 0) { c.blink -= dt; if (c.blink <= 0) { c.lane = c.next; c.tgt = LANE[c.lane]; c.blink = -1.2; } }
        else if (c.blink < 0) c.blink = Math.min(0, c.blink + dt);
        if (c.spin > 0) { c.spin -= dt; c.rot = (c.rot || 0) + c.spinDir * dt * 14 * Math.min(1, c.spin); c.off += c.spinDir * dt * 0.9; c.tgt = c.off; if (c.spin <= 0) { c.z = -1e12; c.parked = true; c.retry = 1; c.rot = 0; } continue; }
        if (c.off !== c.tgt) { const d = c.tgt - c.off; c.off += Math.sign(d) * Math.min(Math.abs(d), dt * 0.55); }
        const VAN_HW = 0.16;   // the van, measured the same way as the cars it can hit
        if (opts.endless && live && c.prevAhead > 0 && ahead <= 0 && !c.nm) { const gap = Math.abs(px - c.off) - (c.hw + VAN_HW); c.nm = 1;
          if (gap > -0.02 && gap < 0.2 && inv <= 0) { combo = comboT > 0 ? combo + 1 : 1; comboT = 2.5; const pts = 100 * combo * (c.onc ? 2 : 1); score += pts; say(`${c.onc ? 'WHOA! ' : ''}NEAR MISS +${pts}${combo > 1 ? ` (x${combo})` : ''}`, 1); } }   /* threading the needle pays */
        c.prevAhead = ahead;
        if (live && inv <= 0 && ahead > -SEG * 0.6 && ahead < SEG * (c.truck ? 1.6 : 1.1) && Math.abs(px - c.off) < c.hw + VAN_HW - 0.03) {
          bursts.push({ t: 0, side: Math.max(-1, Math.min(1, (c.off - px) * 2.5)), big: c.onc || c.truck }); crashes++; inv = 1.4; shake = c.onc ? 0.6 : 0.35; hurtGlass(glassFor[c.onc ? 'onc' : c.truck ? 'truck' : 'car']);
          const p = c.onc ? 20 : c.truck ? 14 : 10; /* a crash costs real time: exchanging info, checking the bumper */ penalty += p; STATS[c.onc ? 'headons' : c.truck ? 'trucks' : 'cars']++; STATS.lost += p; speed = c.onc ? 0 : Math.min(speed, Math.abs(c.speed) * 0.6);
          if (!c.truck) { c.spin = 1.6; c.spinDir = px < c.off ? 1 : -1; c.speed *= 0.3; }   // the car you hit spins out (log trucks just shrug)
          px += c.onc ? (px < c.off ? -0.4 : 0.4) : (px < c.off ? -0.3 : 0.3);
          sfx(c.onc ? 'horn_angry' : 'horn'); say(c.onc ? `HEAD-ON! +${p} MIN` : c.truck ? `LOG TRUCK! +${p} MIN` : `BONK! +${p} MIN`);
        }
      }
      if (opts.endless) {
        const want = Math.round(MODE.cars * (1 + 0.65 * (ourLanes(pos + PZ) + oncLanes(pos + PZ) - 3)) * (1 + Math.min(1, pos / SEG / SEG_PER_MI / 60) * 0.5)), have = cars.filter(c => !c.parked).length;
        if (have < want && Math.random() < dt * 2) { const z = pos + PZ + rnd(DRAW * 0.85, DRAW) * SEG, n = addCar(z, Math.random() < MODE.onc); if (!cars.some(o => !o.parked && o.lane === n.lane && Math.abs(o.z - z) < 4 * SEG)) cars.push(n); }   /* more lanes, more traffic */
        comboT = Math.max(0, comboT - dt);
        for (const k of KITS) if (!k.got && live && Math.abs(k.z - (pos + PZ)) < SEG * 0.7 && Math.abs(px - k.off) < 0.3) { k.got = true; const fix = Math.min(2, crashes); crashes -= fix; glass = Math.max(0, glass - 3); score += 250; sfx('horn'); say(fix ? `TOOLBOX! PATCHED ${fix} DENT${fix > 1 ? 'S' : ''} +250` : 'TOOLBOX! +250', 1.4); }
      }
      // ---- no car can ever be inside another car ----
      // anything sharing a lane with a car just ahead of it is held back a safe gap and matches its speed;
      // a car drifting into a lane that isn't clear gives up and slides back where it came from
      const live2 = cars.filter(c => !c.parked && !(c.spin > 0));
      for (const c of live2) {
        if (c.off !== c.tgt) { const clash = live2.some(o => o !== c && o.onc === c.onc && Math.abs(o.off - c.tgt) < 0.3 && Math.abs(o.z - c.z) < 3 * SEG);
          if (clash) { c.lane = c.prev != null ? c.prev : c.lane === 2 ? 1 : 2; c.tgt = LANE[c.lane]; c.blink = 0; } }
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
      // the rival: weaves through traffic to get around slow cars, gets boxed in and slowed down, and can be beaten
      if (RIVAL && live) {
        const gap = (rz - (pos + PZ)) / SEG;
        let want = TOP * (gap > 120 ? 0.62 : gap > 40 ? 0.76 : gap > 3 ? 0.84 : gap < -30 ? 1.0 : 0.9);   // when they're ahead they run a bit under your top speed, so holding the pedal down reels them in slowly
        rivalT = (rivalT || 0) - dt; rivalSlip = Math.max(0, (rivalSlip || 0) - dt);
        const blocking = cars.filter(o => !o.parked && Math.abs(o.off - rivalLane) < 0.3 && o.z > rz && o.z - rz < 3.2 * SEG && !o.onc);
        if (blocking.length) {
          const lead = blocking.reduce((m, o) => o.z < m.z ? o : m);
          const clear = L => !cars.some(q => !q.parked && Math.abs(q.off - L) < 0.3 && q.z > rz - 1.5 * SEG && q.z < rz + (L === LANE[0] ? 7 : 4) * SEG);   // the oncoming lane needs a much bigger gap
          const tries = rivalLane === LANE[0] ? [LANE[1], LANE[2]] : [rivalLane === LANE[1] ? LANE[2] : LANE[1], LANE[0]];
          const go = rivalT <= 0 && tries.find(clear);
          if (go != null) { rivalLane = go; rivalT = 0.9; if (go === LANE[0] && gap > -6 && gap < 14) say('THE CLOG KINGS ARE PASSING IN THE ONCOMING LANE!', 1.4); }
          else { want = Math.min(want, lead.speed * 0.85); if (lead.z - rz < 1.3 * SEG) rivalSlip = 0.8; }   // boxed in: stuck behind it, and has to brake
        } else if (rivalLane === LANE[0] && rivalT <= 0) { const back = [LANE[1], LANE[2]].find(L => !cars.some(q => !q.parked && Math.abs(q.off - L) < 0.3 && Math.abs(q.z - rz) < 2.5 * SEG)); if (back != null) { rivalLane = back; rivalT = 0.9; } }
        if (rivalLane === LANE[0] && cars.some(q => q.onc && q.z > rz && q.z - rz < 4 * SEG)) { want *= 0.5; rivalSlip = 0.6; }   // chickened out of a head-on
        if (rivalSlip > 0) want *= 0.6;
        roff += (rivalLane - roff) * Math.min(1, dt * 2.6);   // the swerve itself
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
        if (cr.react > 0) { cr.react += dt; if (cr.react < 2.6) continue; }   // the moose takes its time
        if (cr.dir) {
          if (cr.kind === 'peeper' && !cr.snapped && Math.abs(cr.off) < 0.4) { cr.snapped = true; cr.snap = 1.6; }
          if (cr.snap > 0) { cr.snap -= dt; cr.flash = (cr.flash + dt) % 0.4; } else cr.off += cr.dir * CSPD[cr.kind] * (cr.spd || 1) * dt * 1.4;
        }
        if (live && !cr.hit && inv <= 0 && Math.abs(dz - PZ) < SEG * 1.1 && Math.abs(px - cr.off) < CW[cr.kind] + 0.1) {
          const covered = cr.kind === 'deer' && DEERINS;   // deer insurance: no lost time, no cracked glass
          cr.hit = true; if (!covered) crashes++; STATS[cr.kind] = (STATS[cr.kind] || 0) + 1; if (!covered) { hurtGlass(glassFor[cr.kind]); penalty += PEN[cr.kind]; STATS.lost += PEN[cr.kind]; } inv = 1.4; shake = cr.kind === 'moose' ? 0.7 : 0.3; speed *= cr.kind === 'moose' ? 0.1 : covered ? 0.92 : 0.4;
          cr.dir = Math.sign(cr.off - px) || 1; cr.snap = 0;
          if (cr.kind !== 'moose') { cr.fly = 0.001; cr.flyDir = cr.dir; }   /* up and over the roof; the moose just keeps walking */
          sfx(cr.kind === 'moose' ? 'horn_angry' : 'horn');
          say({ moose: 'HIT THE MOOSE! +20 MIN', deer: covered ? 'OH DEER. INSURANCE HAS IT!' : 'OH DEER. +12 MIN', turkeys: 'FEATHERS! +5 MIN', peeper: 'SLAMMED THE BRAKES! +8 MIN' }[cr.kind]);
        }
      }
      inv = Math.max(0, inv - dt); msgT = Math.max(0, msgT - dt); shake = Math.max(0, shake - dt);
      if (window.DRV && DRV.src) DRV.src.playbackRate.value = 0.7 + 0.6 * ratio;
      draw(gas, brake, steer);
      if (opts.endless) { const mi = pos / SEG / SEG_PER_MI; if (crashes >= 20 || pos >= (N - 40) * SEG) { done = true; removeEventListener('keydown', kd); removeEventListener('keyup', ku); rc.onpointerdown = rc.onpointerup = rc.onpointermove = rc.onpointercancel = null;
          say(crashes >= 20 ? 'THE VAN IS TOTALED.' : 'YOU DROVE OFF THE MAP!', 2.5); draw(false, true, 0); if (rainSnd) { rainSnd.stop(); rainSnd = null; }
          setTimeout(() => { rc.style.display = 'none'; res({ crashes, mins: 0, miles: mi, score: score + Math.floor(mi * 100) }); }, 1400); return; } }   /* the Driving Game: three crashes and you're done */
      if (!opts.endless && pos >= (N - 40) * SEG) {
        done = true; removeEventListener('keydown', kd); removeEventListener('keyup', ku); rc.onpointerdown = rc.onpointerup = rc.onpointermove = rc.onpointercancel = null;
        const mins = Math.round(opts.leave + play * MIN_PER_S + penalty);
        say('MADE IT!', 2); draw(false, true, 0);
        if (!opts.arcade) try { const sv = DDT.get(), T = sv.stats = sv.stats || {}; for (const k in STATS) T[k] = (T[k] || 0) + STATS[k]; T.drives = (T.drives || 0) + 1; T.miles = (T.miles || 0) + Math.round(TOTAL_MI); if (RIVAL) T[rivalWon ? 'racesLost' : 'racesWon'] = (T[rivalWon ? 'racesLost' : 'racesWon'] || 0) + 1; DDT.save(sv); } catch (e) {}
        if (rainSnd) { rainSnd.stop(); rainSnd = null; } setTimeout(() => { rc.style.display = 'none'; res({ crashes, mins, rivalWon }); }, 700); return;
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
        const rt = sg.rt || 1, lt = sg.lt || -1, cc = (rt + lt) / 2, hh = (rt - lt) / 2;   /* the road's centre and half-width: wider where it opens up */
        if (sg.river || sg.lake) { const wc = SNOW ? '#7896af' : '#4574a6';   // the river (or lake) off to the right
          poly(p1.sx + p1.sw * ((sg.lake ? 3.4 : 2.6) + rt - 1), p1.sy, p1.sw * (sg.lake ? 1.4 : 0.7), p2.sx + p2.sw * ((sg.lake ? 3.4 : 2.6) + rt - 1), p2.sy, p2.sw * (sg.lake ? 1.4 : 0.7), wc); }
        poly(p1.sx + cc * p1.sw, p1.sy, p1.sw * (hh + 0.16), p2.sx + cc * p2.sw, p2.sy, p2.sw * (hh + 0.16), SNOW ? '#95908a' : '#7f674a');   // dirt (or slushy sand) shoulder
        poly(p1.sx + cc * p1.sw, p1.sy, p1.sw * hh, p2.sx + cc * p2.sw, p2.sy, p2.sw * hh, '#4f5258');   /* asphalt */
        for (const e of [lt + 0.05, rt - 0.05]) poly(p1.sx + e * p1.sw, p1.sy, Math.max(0.5, p1.sw * 0.012), p2.sx + e * p2.sw, p2.sy, Math.max(0.5, p2.sw * 0.012), '#e8eaec');   // solid white edge lines
        // (snow lives on the shoulder now, so the white edge line stays readable)
        { const yx = w => -w / 3;   // double yellow: oncoming lane on the left
          poly(p1.sx + yx(p1.sw) - lane(p1.sw) * 1.4, p1.sy, lane(p1.sw) * 0.6, p2.sx + yx(p2.sw) - lane(p2.sw) * 1.4, p2.sy, lane(p2.sw) * 0.6, '#f2c12e');
          poly(p1.sx + yx(p1.sw) + lane(p1.sw) * 1.4, p1.sy, lane(p1.sw) * 0.6, p2.sx + yx(p2.sw) + lane(p2.sw) * 1.4, p2.sy, lane(p2.sw) * 0.6, '#f2c12e');
          if (Math.floor(sg.i / 3) % 4 === 0) for (let lx = lt < -1.5 ? -1 : 1 / 3; lx < rt - 0.2; lx += lx < 0 ? 4 / 3 : 2 / 3) poly(p1.sx + p1.sw * lx, p1.sy, lane(p1.sw) * 0.8, p2.sx + p2.sw * lx, p2.sy, lane(p2.sw) * 0.8, '#eef0f2'); }   /* dashed white between every lane going our way */   // dashed white between our two lanes: short dash, long gap
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
        for (const sp of sg.sprites) S(sp.img, sp.scale * 2.6, p.sx, p.sy, sp.off > 0 ? sp.off + (sg.rt || 1) - 1 : sp.off + (sg.lt || -1) + 1, p.sw, sg.clip);
        if (KITS.length && KIT_IMG.complete && KIT_IMG.naturalWidth) for (const k of KITS) if (!k.got && segAt(k.z) === sg) S(KIT_IMG, 0.09, p.sx, p.sy, k.off, p.sw, sg.clip);   /* a toolbox lying in the lane */
        if (RIVAL && rz > pos && segAt(rz) === sg) { makeRival(); if (rivalImg) S(rivalImg, 0.62, p.sx, p.sy, roff, p.sw, sg.clip); }
        for (const c of cars) if (!c.parked && segAt(c.z) === sg) { const b = S(c.img, c.sc, p.sx, p.sy, c.off, p.sw, sg.clip, c.rot);
          if (b && c.blink > 0 && Math.floor(t * 4) % 2) { const bw = Math.max(2, b.w * 0.16), bh = Math.max(2, b.w * 0.1), bx = c.next < c.lane ? b.X - bw * 0.3 : b.X + b.w - bw * 0.7;
            r.fillStyle = '#ffb020'; r.fillRect(bx, b.Y + b.h * 0.5, bw, bh); r.fillStyle = 'rgba(255,176,32,.35)'; r.fillRect(bx - bw * 0.5, b.Y + b.h * 0.5 - bh * 0.5, bw * 2, bh * 2); } }
        for (const cr of critters) if (!cr.fly && cr.seg === sg.i && Math.abs(cr.off) < 3) {
          { let im = ANIM[cr.kind] ? ANIM[cr.kind][cr.dir && !cr.snap ? Math.floor(t * 6) % 2 : 0] : CIMG[cr.kind]; if (cr.dir < 0 && ANIM[cr.kind]) im = flipped(im);   // walk cycle, facing the way it's going
            let sc = cr.kind === 'moose' ? 2.1 : cr.kind === 'turkeys' ? 0.9 : 1.5;
            if (cr.react > 0 && cr.react < 2.6 && mooseFrame(0)) continue;   // drawn up close, in front of the van, below
            S(im, sc, p.sx, p.sy, cr.off, p.sw, sg.clip); }
          if (cr.kind === 'peeper' && cr.snap > 0 && cr.flash < 0.15) S(FLASH, 1, p.sx, p.sy - p.sw * 0.1, cr.off + 0.08, p.sw, sg.clip);
        }
      }
      // falling snow
      if (SNOW) { r.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 60; i++) r.fillRect((i * 97 + t * 30 * (1 + i % 3) + px * 40) % W, (i * 53 + t * (40 + i % 7 * 9)) % H, 1, 1); }
      // the moose you just bumped: right in front of the van, staring you down, not moving
      for (const cr of critters) if (cr.react > 0 && cr.react < 2.6) { const mf = mooseFrame(Math.min(5, Math.floor(cr.react / 0.42))); if (!mf) continue;
        const dh = 170, dw = mf.width * dh / mf.height, cx = W / 2 + steer * 6 + Math.max(-60, Math.min(60, (cr.off - px) * 90)), by = H - 30;
        r.save(); if (cr.react < 0.25) r.translate((Math.random() - 0.5) * 3, 0); if (cr.dir > 0) { r.translate(cx, 0); r.scale(-1, 1); r.drawImage(mf, -dw / 2, by - dh, dw, dh); } else r.drawImage(mf, cx - dw / 2, by - dh, dw, dh); r.restore(); }
      // our van
      if (!(inv > 0 && Math.floor(t * 10) % 2)) {
        const vx = W / 2 - 36 + steer * 6, vy = H - 58 - bounce * 6 + (Math.abs(px) > 1 ? (Math.random() - .5) * 3 : 0);
        if (VANS.complete && VANS.naturalWidth) { const fi = (brake ? 3 : 0) + (steer > 0 ? 2 : steer < 0 ? 1 : 0);   /* right turn shows the van's right side */
          r.drawImage(VANS, fi * VANS.width / 6, 0, VANS.width / 6, VANS.height, Math.round(vx + 36 - VCW / 2), Math.round(vy + 52 - VCH), VCW, VCH); }
        else if (vanFail) { r.save(); r.translate(vx + 36, vy + 52); r.rotate(steer * 0.04); r.scale(1.35, 1.35); r.drawImage(brake ? VANBRAKE : VAN, -36, -52); r.restore(); }
        if (gas && speed > CRUISE * 0.9) { r.fillStyle = 'rgba(200,200,205,.6)'; for (let i = 0; i < 3; i++) r.fillRect(vx + 20 + Math.random() * 4, vy + 50 + i * 3, 3, 2); }
      }
      for (const cr of critters) if (cr.kind === 'deer' && cr.fly > 0 && cr.fly < 3.8) {   // the deer: spins up over the hood and lands face-first on the windshield
        const img = CIMG.deer, f = cr.fly, HIT = 0.75, side = cr.flyDir < 0 ? -1 : 1;
        if (f < HIT) {   // tumbling up and toward us, getting huge
          const k = f / HIT, sc = 1.2 + k * 1.8, fx = W / 2 + 10 * side + (side > 0 ? W - 80 - W / 2 : 80 - W / 2) * k, fy = H - 70 - Math.sin(k * Math.PI * 0.9) * 120;
          r.save(); r.translate(fx, fy); r.rotate(side * k * Math.PI * 4); r.drawImage(img, -img.width * sc / 2, -img.height * sc / 2, img.width * sc, img.height * sc); r.restore();
        } else if (DSPLAT.complete && DSPLAT.naturalWidth) {   // SPLAT: face on the glass, licking it, sliding down out of view
          const e = f - HIT, fi = Math.min(5, Math.floor(e / 0.4)), fade = e > 2.6 ? Math.max(0, 1 - (e - 2.6) / 0.45) : 1;
          if (!cr.splat) { cr.splat = 1; shake = Math.max(shake, 0.35); sfx('horn'); say('SPLAT!', 1.4); }
          const fw = DSPLAT.width / 6, fh = DSPLAT.height, dw = fw / 2, dh = fh / 2, pop = e < 0.12 ? 1.12 - e : 1;   /* sheet is 2x for the 2x canvas */
          const x0 = side > 0 ? W - 6 - dw : 6, nx = x0 + (side > 0 ? dw * 0.89 : dw * 0.11), ny = H - dh + dh * 0.31;
          r.save(); r.globalAlpha = 0.8 * fade; r.fillStyle = '#e8eef2';   // star crack where the nose hit
          for (let a = 0; a < 7; a++) { const an = a * 0.9 + 0.2; for (let d = 4; d < 34; d += 2) r.fillRect(Math.round(nx + Math.cos(an) * d), Math.round(ny + Math.sin(an) * d * 0.8), 1.5, 1.5); }
          r.globalAlpha = fade; r.translate(side > 0 ? x0 + dw : x0, H); r.scale(side * pop, pop);   // anchored at the bottom corner; mirrored on the left side
          r.drawImage(DSPLAT, fi * fw, 0, fw, fh, -dw, -dh, dw, dh);
          r.restore();
        }
      }
      for (const cr of critters) if (cr.kind === 'turkeys' && cr.fly > 0 && cr.fly < 1.4 && FEATH.complete && FEATH.naturalWidth) {   // FEATHERS: the whole family explodes off the grille
        const fi = Math.min(5, Math.floor(cr.fly / 0.22)), fw = FEATH.width / 6, fh = FEATH.height, dw = fw / 2, dh = fh / 2;   // 1:1 on the 2x canvas
        const cx = W / 2 + steer * 6 + cr.flyDir * 10, by = H - 26 + Math.min(20, cr.fly * 30);   // drifting down a little as it fades
        r.save(); r.globalAlpha = cr.fly > 1.1 ? Math.max(0, 1 - (cr.fly - 1.1) / 0.3) : 1; r.drawImage(FEATH, fi * fw, 0, fw, fh, Math.round(cx - dw / 2), Math.round(by - dh), dw, dh); r.restore();
      }
      for (const cr of critters) if (cr.kind !== 'deer' && !(cr.kind === 'turkeys' && FEATH.complete && FEATH.naturalWidth) && cr.fly > 0 && cr.fly < 1.3) {
        const k = cr.fly / 1.3, img = CIMG[cr.kind], sc = (cr.kind === 'deer' ? 2.4 : 2) * (1.4 - k * 0.9);
        const fx = W / 2 + cr.flyDir * (20 + 140 * k), fy = H - 60 - Math.sin(k * Math.PI) * 170 + k * 20;
        r.save(); r.translate(fx, fy); r.rotate(cr.flyDir * k * 9); r.drawImage(img, -img.width * sc / 2, -img.height * sc / 2, img.width * sc, img.height * sc); r.restore();
        if (k < 0.3) { r.fillStyle = 'rgba(255,255,255,.8)'; for (let i = 0; i < 6; i++) r.fillRect(W / 2 + (i - 3) * 9, H - 70 - i * 3 - k * 60, 3, 3); }   // fur and feathers
      }
      r.restore();
      // ---------- crash bursts, right where the van meets the bumper ----------
      if (CRASH.complete && CRASH.naturalWidth) for (let i = bursts.length - 1; i >= 0; i--) { const b = bursts[i]; b.t += Math.min(0.05, Math.max(0, t - (b.last ?? t))); b.last = t;
        const fi = Math.floor(b.t / 0.1); if (fi > 5) { bursts.splice(i, 1); continue; }
        const fw = CRASH.width / 6, fh = CRASH.height, sc = b.big ? 1.25 : 1, dw = fw / 2 * sc, dh = fh / 2 * sc, cx = W / 2 + steer * 6 + b.side * 30, cy = H - 114;   // the front of the van, where the bumper is
        r.drawImage(CRASH, fi * fw, 0, fw, fh, Math.round(cx - dw / 2), Math.round(cy - dh * 0.54), Math.round(dw), Math.round(dh)); }
      // ---------- the windshield ----------
      { const pr = pos / ((N - 40) * SEG), dt = Math.min(0.05, Math.max(0, t - glassT)); glassT = t;
        for (const e of events) if (!e.done && pr >= e.at) { e.done = true; e.kind === 'bug' ? splatBug() : splatMud(); }
        const wxK = WX ? Math.max(0, Math.min(1, (pr - wxFrom) / 0.05, (wxTo - pr) / 0.05)) : 0;
        if (WX === 'rain') { if (wxK > 0 && !rainSnd && window.DDTSfx) rainSnd = DDTSfx.loop ? DDTSfx.loop('rain_loop') : null; if (wxK <= 0 && rainSnd) { rainSnd.stop(); rainSnd = null; } }
        if (wxK > 0) {
          if (WX === 'fog') { const gr = r.createLinearGradient(0, HORIZON - 30, 0, H); gr.addColorStop(0, `rgba(214,220,224,${0.92 * wxK})`); gr.addColorStop(0.45, `rgba(214,220,224,${0.7 * wxK})`); gr.addColorStop(1, `rgba(214,220,224,${0.15 * wxK})`); r.fillStyle = gr; r.fillRect(0, 0, W, H); }
          if (WX === 'rain') { r.fillStyle = `rgba(60,70,85,${0.25 * wxK})`; r.fillRect(0, 0, W, H); r.strokeStyle = `rgba(200,215,230,${0.55 * wxK})`; r.lineWidth = 1; r.beginPath();
            for (let i = 0; i < 90; i++) { const x = (i * 53 + t * 260 + i * i) % (W + 40) - 20, y = (i * 37 + t * 520 * (1 + i % 3 * 0.2)) % H; r.moveTo(x, y); r.lineTo(x - 4, y + 12); } r.stroke();
            if (Math.random() < dt * 14 * wxK) drops.push({ x: Math.random() * W, y: 20 + Math.random() * (H - 30), r: 1.5 + Math.random() * 2.5, t: 0 }); }
          if (WX === 'squall') { r.fillStyle = `rgba(235,240,245,${0.35 * wxK})`; r.fillRect(0, 0, W, H); r.fillStyle = `rgba(255,255,255,${0.9 * wxK})`;
            for (let i = 0; i < 160; i++) r.fillRect((i * 97 + t * 220 * (1 + i % 4 * 0.3) + px * 60) % W, (i * 61 + t * 90 * (1 + i % 5 * 0.2)) % H, 1.5, 1.5); }
        }
        for (let i = drops.length - 1; i >= 0; i--) { const d = drops[i]; d.t += dt; d.y += d.t > 1.2 ? dt * 30 : 0; if (d.t > 3.5 || d.y > H) { drops.splice(i, 1); continue; }   // raindrops sit, then run down
          r.fillStyle = 'rgba(180,200,220,.45)'; r.beginPath(); r.arc(d.x, d.y, d.r, 0, 7); r.fill(); r.fillStyle = 'rgba(255,255,255,.7)'; r.fillRect(d.x - d.r * 0.4, d.y - d.r * 0.5, 1, 1); }
        for (let i = muds.length - 1; i >= 0; i--) { const m = muds[i]; m.t += dt; const a = m.t < 3 ? 0.9 : 0.9 - (m.t - 3) / 2.5; if (a <= 0) { muds.splice(i, 1); continue; }   // mud runs down, then the wipers finally win
          r.globalAlpha = a * 0.92; for (const [x, y, rr, k] of m.blobs) { const dy = rr > 3 ? Math.min(30, m.t * 5 * (0.3 + k)) : 0; r.fillStyle = k < 0.4 ? '#4e3820' : k < 0.8 ? '#644a2c' : '#7a5e3a';
            r.fillRect(Math.round(x - rr), Math.round(y - rr * 0.8), Math.ceil(rr * 2), Math.ceil(rr * 1.6)); if (rr > 2.5) r.fillRect(Math.round(x - rr * 0.6), Math.round(y - rr * 1.2), Math.ceil(rr * 1.2), Math.ceil(rr * 2.4)); if (dy) r.fillRect(Math.round(x - 1), Math.round(y), 2, dy); } r.globalAlpha = 1; }
        for (const b of bugs) { b.t += dt; for (const [dx, dy, rr] of b.dots) { r.fillStyle = b.col; r.fillRect(b.x + dx - rr / 2, b.y + dy - rr / 2, rr, rr); }   // guts, then the bug bits
          r.fillStyle = 'rgba(40,40,30,.9)'; r.fillRect(b.x - 2, b.y - 1, b.big ? 5 : 3, b.big ? 3 : 2); r.fillRect(b.x - 5, b.y + 1, 2, 1); r.fillRect(b.x + 3, b.y - 2, 2, 1); r.fillRect(b.x - 4, b.y - 3, 1, 2); r.fillStyle = 'rgba(220,235,255,.5)'; r.fillRect(b.x - 3, b.y - 4, 3, 2); }   // body, legs, a wing
        const nc = Math.min(CRACKS.length, Math.floor(glass));
        for (let i = 0; i < nc; i++) { const c = CRACKS[i];   // spider cracks: a dark line and a bright edge, like real broken glass
          for (const [col, off] of [['rgba(30,40,50,.45)', 0.6], ['rgba(240,248,255,.85)', 0]]) { r.strokeStyle = col; r.lineWidth = 0.7; r.beginPath();
            for (const pts of c.rays) { r.moveTo(pts[0][0] + off, pts[0][1] + off); for (const [x, y] of pts) r.lineTo(x + off, y + off); }
            r.stroke(); }
          r.fillStyle = 'rgba(255,255,255,.9)'; r.fillRect(c.cx - 1, c.cy - 1, 2, 2); }
      }
      // HUD
      const mins = Math.round(opts.leave + play * MIN_PER_S + penalty), late = mins > opts.due;
      r.fillStyle = 'rgba(16,21,31,.92)'; r.fillRect(0, 0, W, 20);
      r.font = '8px "Press Start 2P", monospace'; r.textBaseline = 'middle'; r.textAlign = 'left';
      if (opts.endless) { const mi = pos / SEG / SEG_PER_MI, lanes = ourLanes(pos + PZ) + oncLanes(pos + PZ); r.fillStyle = '#f7c418'; r.fillText('THE DRIVING GAME', 6, 10); r.textAlign = 'right'; r.fillStyle = lanes > 3 ? '#e9665a' : '#fff'; r.fillText(`${lanes} LANES`, 474, 10); r.textAlign = 'left'; }   /* no clock, no destination: just the road */
      else {
      r.fillStyle = late ? '#e9665a' : '#fff'; r.fillText(opts.clock(mins), 6, 10);
      r.fillStyle = '#f7c418'; r.fillText('DUE ' + opts.clock(opts.due).replace(/ ?[AP]M/, ''), 82, 10);
      r.fillStyle = '#fff'; r.fillText(from.slice(0, 8), 166, 10); r.textAlign = 'right'; r.fillText(to.slice(0, 9), 474, 10); r.textAlign = 'left'; }
      const prog = Math.min(1, pos / ((N - 40) * SEG));
      { const L = LEGS_HERE[(segAt(pos) || {}).leg || 0]; if (L) { r.font = '6px "Press Start 2P", monospace'; r.textAlign = 'left'; r.fillStyle = 'rgba(16,21,31,.7)'; r.fillRect(4, 24, 8 + (L.rt + '  ' + L.name).length * 6, 12); r.fillStyle = '#f7c418'; r.fillText(L.rt + '  ' + L.name, 8, 30); r.font = '8px "Press Start 2P", monospace'; } }
      if (RIVAL) { const rp = Math.min(1, rz / ((N - 40) * SEG)); r.fillStyle = '#e9665a'; r.fillRect(236 + 150 * rp, 3, 4, 14);
        r.font = '6px "Press Start 2P", monospace'; r.textAlign = 'center'; r.fillStyle = rz > pos + PZ ? '#e9665a' : '#7bd65b';
        r.fillText(rz > pos + PZ ? `CLOG KINGS AHEAD ${Math.round((rz - pos - PZ) / SEG)}` : 'YOU LEAD!', 313, 28); r.font = '8px "Press Start 2P", monospace'; r.textAlign = 'left'; }
      if (!opts.endless) { r.fillStyle = '#2c3326'; r.fillRect(238, 7, 150, 6); r.fillStyle = '#7bd65b'; r.fillRect(238, 7, 150 * prog, 6); r.fillStyle = '#f7c418'; r.fillRect(236 + 150 * prog, 5, 4, 10); }
      // speedometer
      const mph = Math.round(speed / MPH);
      r.fillStyle = 'rgba(16,21,31,.7)'; r.fillRect(W - 78, 26, 72, 18); r.fillStyle = speed > TOP * 0.97 ? '#f7c418' : '#7bd65b'; r.textAlign = 'right'; r.fillText(mph + ' MPH', W - 10, 35); r.textAlign = 'left';
      if (crashes) { r.fillStyle = '#e9665a'; r.textAlign = 'right'; r.fillText('CRASHES ' + crashes, W - 6, 52); r.textAlign = 'left'; }
      if (opts.endless) { const mi = pos / SEG / SEG_PER_MI; r.fillStyle = '#7dffb0'; r.textAlign = 'center'; r.fillText(`${mi.toFixed(1)} MI   SCORE ${(score + Math.floor(mi * 100)).toLocaleString()}`, W / 2, 52);   /* the Driving Game score */
        r.fillStyle = 'rgba(0,0,0,.55)'; r.fillRect(W / 2 - 50, 58, 100, 6); r.fillStyle = crashes > 14 ? '#e9665a' : crashes > 8 ? '#f7c418' : '#7dffb0'; r.fillRect(W / 2 - 50, 58, 100 * (1 - crashes / 20), 6); r.fillStyle = '#fff'; r.font = r.font; r.fillText(`VAN ${20 - crashes}/20`, W / 2, 72); r.textAlign = 'left'; }
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
