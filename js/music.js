// =====================================================================
// DOO DOO TOWN — little chiptune loops, made live with Web Audio (no files).
// Placeholder soundtrack until the real tracks are uploaded.
//   DDTMusic.play('van' | 'job' | 'stop' | 'spooky')     DDTMusic.stop()
// A small ♪ button (top right) mutes/unmutes; the choice is remembered.
// =====================================================================
const DDTMusic = (() => {
  // ---------- the van radio: the real Doo Doo Town tracks, one playlist that keeps going from page to page ----------
  const BASE = (() => { try { return document.currentScript.src.replace(/js\/music\.js.*$/, 'assets/music/'); } catch (e) { return 'assets/music/'; } })();
  const TRACKS = [
    { file: 'doo_doo_town_rock.mp3', name: 'DOO DOO TOWN ROCK' },
    { file: 'that_cloggin_sound.mp3', name: "THAT CLOGGIN' SOUND" },
    { file: 'brown_friday.mp3', name: 'BROWN FRIDAY' },
    { file: 'the_brown_note.mp3', name: 'THE BROWN NOTE' },
    { file: 'nightmares.mp3', name: 'NIGHTMARES' },
  ];
  const START = { van: 0, job: 3, stop: 1, spooky: 4 };   // where a fresh radio starts, by kind of scene
  const radio = new Audio(); radio.preload = 'auto'; radio.volume = 0.5;
  let rIdx = -1, rOn = false;
  const rState = () => { try { return JSON.parse(sessionStorage.getItem('ddt_radio')) || null; } catch (e) { return null; } };
  const rSave = () => { if (rIdx < 0) return; try { sessionStorage.setItem('ddt_radio', JSON.stringify({ i: rIdx, t: radio.currentTime || 0, at: Date.now() })); } catch (e) {} };
  function nowPlaying(name) {
    if (!document.body) return; let el = document.getElementById('ddt-np');
    if (!el) { el = document.createElement('div'); el.id = 'ddt-np'; el.style.cssText = 'position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:9000;font:9px "Press Start 2P",monospace;color:#f7c418;background:#10151fdd;border:2px solid #f7c418;padding:6px 10px;pointer-events:none;transition:opacity .6s'; document.body.appendChild(el); }
    el.textContent = '♪ ' + name; el.style.opacity = 1; clearTimeout(nowPlaying.t); nowPlaying.t = setTimeout(() => { el.style.opacity = 0; }, 3200);
  }
  function rLoad(i, t) { rIdx = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length; radio.src = BASE + TRACKS[rIdx].file; try { radio.currentTime = t || 0; } catch (e) {} if (t != null && t < 1) nowPlaying(TRACKS[rIdx].name); }
  radio.addEventListener('loadedmetadata', () => { const st = rState(); if (st && st.i === rIdx && st.t > 0 && radio.currentTime < 0.5) { const t = st.t + Math.min(30, (Date.now() - st.at) / 1000); if (t < radio.duration - 2) radio.currentTime = t; } });
  radio.addEventListener('ended', () => { rLoad(rIdx + 1, 0); if (rOn && !muted) radio.play().catch(() => {}); });
  addEventListener('pagehide', rSave); setInterval(rSave, 1000);
  document.addEventListener('visibilitychange', () => { if (!rOn) return; if (document.hidden) radio.pause(); else if (!muted) radio.play().catch(() => {}); });
  function radioOn(kind) {
    rOn = true; const st = rState();
    if (rIdx < 0 || (!st && (radio.currentTime || 0) < 0.5 && (START[kind] || 0) !== rIdx)) { if (st) { rLoad(st.i, st.t); } else rLoad(START[kind] || 0, 0); }
    radio.muted = muted; if (!muted) radio.play().then(() => { if (!rState()) nowPlaying(TRACKS[rIdx].name); }).catch(() => {});
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, () => { if (rOn && !muted && radio.paused) radio.play().catch(() => {}); }, { capture: true }));

  const SONGS = {
    // 8 steps per bar (eighth notes). '-' rest, '.' hold. Lead / bass / drums (k kick, s snare, h hat)
    van: { bpm: 116, lead:
      'C5 E5 G5 E5 A5 G5 E5 D5  C5 E5 G5 A5 G5 . E5 -  F5 A5 C6 A5 G5 E5 C5 D5  E5 D5 C5 D5 C5 . - -',
      bass: 'C3 . C3 . G2 . G2 .  A2 . A2 . E2 . E2 .  F2 . F2 . C3 . C3 .  G2 . G2 . C3 . - -',
      drum: 'k h s h k h s h  k h s h k h s h  k h s h k h s h  k h s h k s s s' },
    job: { bpm: 98, lead:
      'A4 - C5 - E5 D5 C5 -  A4 - G4 - A4 . - -  A4 - C5 - E5 G5 E5 D5  C5 . A4 . - - - -',
      bass: 'A2 . A2 A2 - A2 G2 .  F2 . F2 F2 - F2 E2 .  A2 . A2 A2 - A2 G2 .  F2 . E2 . E2 . E2 .',
      drum: 'k - h - s - h h  k - h k s - h -  k - h - s - h h  k - h k s s h s' },
    stop: { bpm: 104, lead:
      'E5 . G5 . A5 G5 E5 .  D5 . E5 . C5 . - -  E5 . G5 . A5 C6 A5 .  G5 . E5 . D5 . - -',
      bass: 'C3 - G2 - A2 - E2 -  F2 - C3 - G2 - G2 -  C3 - G2 - A2 - E2 -  F2 - G2 - C3 - - -',
      drum: 'k h h h s h h h  k h h h s h k h  k h h h s h h h  k h h h s h s h' },
    spooky: { bpm: 84, lead:
      'E5 - D#5 - E5 - B4 -  C5 . . - - - - -  A4 - G#4 - A4 - E4 -  F4 . . - - - - -',
      bass: 'E2 . . . . . . .  A2 . . . . . . .  D2 . . . . . . .  E2 . . . . . . .',
      drum: 'k - - - h - - -  k - - - h - - -  k - - - h - - -  k - - h h - h -' },
  };
  const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  const freq = n => { const m = n.match(/^([A-G]#?)(\d)$/); return m ? 440 * Math.pow(2, (NOTE[m[1]] + (+m[2] + 1) * 12 - 69) / 12) : 0; };
  const parse = str => str.trim().split(/\s+/);
  let ac = null, master = null, timer = null, song = null, step = 0, nextT = 0, muted = false, wanted = null, noise = null;
  try { muted = localStorage.getItem('ddt_mute') === '1'; } catch (e) {}

  function ctx() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = muted ? 0 : 0.6; master.connect(ac.destination); } catch (e) { return null; } }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }
  function voice(type, f, t, dur, vol) {
    const o = ac.createOscillator(), v = ac.createGain(); o.type = type; o.frequency.value = f;
    v.gain.setValueAtTime(vol, t); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(v).connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function drum(k, t) {
    if (!noise) { noise = ac.createBuffer(1, ac.sampleRate * 0.2, ac.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    if (k === 'k') { const o = ac.createOscillator(), v = ac.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12); v.gain.setValueAtTime(0.09, t); v.gain.exponentialRampToValueAtTime(0.0001, t + 0.14); o.connect(v).connect(master); o.start(t); o.stop(t + 0.15); return; }
    const s = ac.createBufferSource(), v = ac.createGain(), fl = ac.createBiquadFilter(); s.buffer = noise;
    fl.type = 'highpass'; fl.frequency.value = k === 'h' ? 7000 : 1500;
    const dur = k === 'h' ? 0.03 : 0.1; v.gain.setValueAtTime(k === 'h' ? 0.02 : 0.05, t); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(v).connect(master); s.start(t); s.stop(t + dur + 0.01);
  }
  function tick() {
    if (!song || !ac) return;
    const spb = 60 / song.bpm / 2;   // eighth notes
    while (nextT < ac.currentTime + 0.15) {
      const i = step % song.lead.length;
      const hold = (arr, j) => { let n = 1; while (arr[(j + n) % arr.length] === '.' && n < 8) n++; return n; };
      const L = song.lead[i], B = song.bass[i % song.bass.length], D = song.drum[i % song.drum.length];
      if (freq(L)) voice('square', freq(L), nextT, spb * hold(song.lead, i) * 0.9, 0.028);
      if (freq(B)) voice('triangle', freq(B), nextT, spb * hold(song.bass, i % song.bass.length) * 0.95, 0.07);
      if (D && D !== '-') drum(D, nextT);
      nextT += spb; step++;
    }
  }
  function start(name) {
    const S = SONGS[name]; if (!S) return; wanted = name;
    if (!ctx()) return;
    song = { bpm: S.bpm, lead: parse(S.lead), bass: parse(S.bass), drum: parse(S.drum) }; step = 0; nextT = ac.currentTime + 0.1;
    clearInterval(timer); timer = setInterval(tick, 40);
  }
  // browsers only allow sound after a tap: try now, and again on the first tap
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, () => { if (wanted && (!ac || ac.state !== 'running')) { ctx(); if (!song) start(wanted); } }, { capture: true }));

  function toggleMute() {
    muted = !muted; try { localStorage.setItem('ddt_mute', muted ? '1' : '0'); } catch (_) {}
    if (ctx()) master.gain.value = muted ? 0 : 0.6; radio.muted = muted; if (rOn && !muted) radio.play().catch(() => {});
    if (button.label) button.label();
    return muted;
  }
  addEventListener('keydown', e => { if ((e.key === 'm' || e.key === 'M') && !e.repeat) toggleMute(); });   // M mutes anywhere
  function button() {
    if (document.getElementById('ddt-mute')) return;
    const b = document.createElement('button'); b.id = 'ddt-mute';
    b.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:9000;font:10px "Press Start 2P",monospace;background:#10151fcc;color:#fff;border:2px solid #fff;padding:4px 7px;cursor:pointer';
    const label = () => { b.textContent = muted ? '♪ OFF' : '♪ ON'; };
    b.onclick = e => { e.stopPropagation(); toggleMute(); };
    button.label = label;
    b.addEventListener('pointerdown', e => e.stopPropagation());
    label(); document.body.appendChild(b);
  }
  return {
    play(name) {
      song = null; wanted = null; clearInterval(timer);
      if (name === 'spooky') { rOn = true; rLoad(4, 0); radio.muted = muted; if (!muted) radio.play().catch(() => {}); }   // the alien night gets Nightmares
      else radioOn(name);
      if (document.body) button(); else addEventListener('DOMContentLoaded', button);
    },
    stop() { song = null; wanted = null; clearInterval(timer); rOn = false; radio.pause(); rSave(); },
    radio, tracks: TRACKS, radioOn, save: rSave, toggleMute, nowName: () => (rIdx >= 0 ? TRACKS[rIdx].name : ''),
    get muted() { return muted; },
  };
})();
