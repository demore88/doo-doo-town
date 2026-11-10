// =====================================================================
// DOO DOO TOWN — shared save state. Every page includes this.
// Pages pass control around with ?ret=<root-relative url>; DDT.root is
// set by each page ('' at the top level, '../' inside story/ and arcade/).
// =====================================================================
const DDT = {
  KEY: 'ddt_save',
  root: '',
  fresh() {
    return {
      v: 2, month: 0, slot: 0, money: 80000, loan: 80000, rate: 0.08, interestPaid: 0, health: 100, stamina: 100, rep: 0, mood: 0,
      inv: {}, done: {}, step: 'startup',
      today: null, log: [], late: 0, jobs: 0, started: Date.now(),
    };
  },
  load() { try { return JSON.parse(localStorage.getItem(this.KEY)) || null; } catch (e) { return null; } },
  get() { return this.load() || this.fresh(); },
  save(s) { try { localStorage.setItem(this.KEY, JSON.stringify(s)); } catch (e) {} return s; },
  // apply a bag of effects: {health, stamina, rep, money, mood, item:{id:+n}}
  apply(fx = {}) {
    const s = this.get();
    for (const k of ['health', 'stamina', 'rep', 'money', 'mood']) if (fx[k]) s[k] += fx[k];
    s.health = Math.max(0, Math.min(100, s.health)); s.stamina = Math.max(0, Math.min(100, s.stamina));
    if (fx.item) for (const [id, n] of Object.entries(fx.item)) s.inv[id] = Math.max(0, (s.inv[id] || 0) + n);
    if (fx.note) s.log.push(fx.note);
    if (s.today && fx.time) s.today.time += fx.time;
    if (s.today && fx.jitters) s.today.jitters = true;
    return this.save(s);
  },
  param(k) { return new URLSearchParams(location.search).get(k); },
  // where should this page go when it's done?
  back(fallback = 'index.html') { return this.root + (this.param('ret') || fallback); },
  go(url) { this.nav(this.root + url); },
  // Change screens only once every finger is off the glass. Leaving a page mid-touch confuses Android Chrome:
  // the next page then ignores single taps until a second finger comes down.
  fingers: 0,
  nav(url) {
    const go = () => { location.href = url; };
    if (!this.fingers) return go();
    const t0 = Date.now(), iv = setInterval(() => { if (!this.fingers || Date.now() - t0 > 4000) { clearInterval(iv); setTimeout(go, 60); } }, 40);
  },
  inCampaign() { return !!this.param('ret'); },
  clock(min) { const h = Math.floor(min / 60), m = min % 60, hh = ((h + 11) % 12) + 1; return `${hh}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; },
};

// =====================================================================
// RELEASE SWITCH: set to false before sharing the game publicly.
// true  = SKIP buttons, DEV labels and the CUTSCENES menu are visible (for testing)
// false = clean player build
// =====================================================================
DDT.DEV = true;

// ---------- a New England year, month by month (0 = January) ----------
// leaf: canopy colors for leafy trees (null = bare branches). snow: snow on the ground.
(() => {
  const P = {
    winter: { name: 'winter', ground: '#eef2f6', speck: '#dde4ea', sky: ['#8fa8c0', '#dfe7ee'], mtn: '#8a9db0', pine: '#2f4a3a', leaf: null, snow: true },
    thaw:   { name: 'thaw', ground: '#dfe2d8', speck: '#8a7a5a', sky: ['#8fb0cc', '#e2e8ec'], mtn: '#8a9aa8', pine: '#2f4a3a', leaf: null, snow: true },
    mud:    { name: 'mud', ground: '#7a6a4a', speck: '#5a4a32', sky: ['#7fa6c8', '#d6e0e6'], mtn: '#7a8a9a', pine: '#2f4a3a', leaf: null, snow: false },
    spring: { name: 'spring', ground: '#7fb04f', speck: '#9fd06a', sky: ['#5fa2dc', '#cfe8f4'], mtn: '#6a8a9a', pine: '#2e5a34', leaf: ['#9fd06a', '#b8e07a', '#f2c6d8'], snow: false },
    summer: { name: 'summer', ground: '#5f9a43', speck: '#4e8a36', sky: ['#4f9ad8', '#bfe3f2'], mtn: '#5f7f8f', pine: '#2e5a34', leaf: ['#3f7a34', '#4e8a3a', '#356a2c'], snow: false },
    early:  { name: 'early fall', ground: '#7a9a43', speck: '#6a8a36', sky: ['#5f9ad0', '#e6e0c0'], mtn: '#6a8a9a', pine: '#2e5a34', leaf: ['#4e8a3a', '#d9922b', '#c0532b'], snow: false },
    peak:   { name: 'fall', ground: '#8a8a3a', speck: '#c0532b', sky: ['#5f9ad0', '#f2d9a8'], mtn: '#6a8a9a', pine: '#2e5a34', leaf: ['#c0532b', '#d9922b', '#b8382b', '#f2b01e'], snow: false },
    stick:  { name: 'stick season', ground: '#7a6e5a', speck: '#5e5444', sky: ['#8a9aaa', '#cfd4d8'], mtn: '#7a7f8a', pine: '#2f4a3a', leaf: null, snow: false },
  };
  const BY_MONTH = ['winter', 'winter', 'thaw', 'mud', 'spring', 'summer', 'summer', 'summer', 'early', 'peak', 'stick', 'winter'];
  DDT.seasonPal = m => P[BY_MONTH[Math.max(0, Math.min(11, m | 0))]];
})();

// ---------- "turn your phone sideways" for phones held upright ----------
(function rotateNotice() {
  const css = `
  #ddt-rotate{position:fixed;inset:0;z-index:99999;background:#0b0e15;color:#fff;display:none;flex-direction:column;align-items:center;justify-content:center;gap:28px;
    font-family:'Press Start 2P',monospace;text-align:center;font-size:14px;line-height:1.8;padding:24px}
  #ddt-rotate .ph{width:56px;height:100px;border:5px solid #f7c418;border-radius:10px;position:relative;animation:ddtrot 2s ease-in-out infinite}
  #ddt-rotate .ph:after{content:'';position:absolute;bottom:6px;left:50%;width:10px;height:3px;margin-left:-5px;background:#f7c418;border-radius:2px}
  #ddt-rotate small{color:#9fb3d9;font-size:10px}
  @keyframes ddtrot{0%,25%{transform:rotate(0)}55%,100%{transform:rotate(-90deg)}}
  @media (orientation:portrait) and (max-width:900px){#ddt-rotate{display:flex}}`;
  const add = () => {
    if (document.getElementById('ddt-rotate')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const d = document.createElement('div'); d.id = 'ddt-rotate';
    d.innerHTML = '<div class="ph"></div><div>TURN YOUR PHONE<br>SIDEWAYS</div><small>DOO DOO TOWN PLAYS IN LANDSCAPE</small>';
    document.body.appendChild(d);
  };
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
})();

// count fingers on the screen (for DDT.nav)
['touchstart', 'touchend', 'touchcancel'].forEach(ev => addEventListener(ev, e => { DDT.fingers = e.touches.length; }, { capture: true, passive: true }));
