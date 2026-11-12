// =====================================================================
// DOO DOO TOWN — real sound effects (assets/sfx/*.mp3).
// Sound effects from https://www.zapsplat.com (attribution required; see CREDITS).
//   DDTSfx.play('flush')             one-shot
//   const h = DDTSfx.loop('drill_loop'); h.stop()
//   DDTSfx.patch(SND)                swap a page's synth beeps for the real thing
// Independent of the music: the ♪ button only turns the music off.
// =====================================================================
const DDTSfx = (() => {
  const NAMES = ['carl_laugh', 'carl_sigh', 'carl_cough', 'carl_scream', 'ut_crawl', 'ut_wedding', 'bead_pop1', 'bead_pop2', 'bead_pop3', 'bead_pop4', 'bead_pop5', 'bead_chain', 'bead_drop', 'ut_levelup', 'ut_get', 'ut_buy', 'ut_knight', 'ut_flee', 'ut_wake', 'ut_win', 'ut_amb_a', 'ut_amb_b', 'ut_battle', 'possum_hiss', 'rat_screech', 'wrench_hit', 'spider', 'alien_ship', 'teleporter', 'inside_alien_ship', 'alien_voice', 'tv_static', 'moose', 'raccoon', 'animal_hit', 'animal_hit_2', 'car_crash', 'squirrel_death_1', 'squirrel_death_2', 'squirrel_death_3', 'deer_glass', 'flush', 'flush_big', 'clog', 'gurgle', 'drain', 'splash', 'squish', 'bubble', 'bubbles_loop', 'drips_loop',
    'drill_loop', 'drill_burst', 'drill_stop', 'door', 'click', 'faucet', 'van_arrive', 'rain_loop', 'jackhammer',
    'van_drive_loop', 'engine_start', 'seatbelt', 'van_door_open', 'van_door_close', 'slide_door', 'horn', 'horn_angry', 'phone_ring', 'vm_ping', 'ui_tap', 'ui_select', 'espresso_loop'];
  const VOL = { carl_laugh: 0.5, carl_sigh: 0.55, carl_cough: 0.4, carl_scream: 0.3, ut_crawl: 0.28, ut_wedding: 0.45, bead_pop1: 0.7, bead_pop2: 0.7, bead_pop3: 0.7, bead_pop4: 0.7, bead_pop5: 0.7, bead_chain: 0.75, bead_drop: 0.45, ut_levelup: 0.6, ut_get: 0.6, ut_buy: 0.6, ut_knight: 0.6, ut_flee: 0.6, ut_wake: 0.5, ut_win: 0.6, ut_amb_a: 0.15, ut_amb_b: 0.30, ut_battle: 0.32, possum_hiss: 0.7, rat_screech: 0.7, wrench_hit: 0.85, spider: 0.7, alien_ship: 0.22, inside_alien_ship: 0.16, tv_static: 0.07, teleporter: 0.7, alien_voice: 0.6, moose: 0.95, raccoon: 0.9, animal_hit: 0.9, animal_hit_2: 0.9, car_crash: 0.85, squirrel_death_1: 0.9, squirrel_death_2: 0.9, squirrel_death_3: 0.9, deer_glass: 0.9, flush: 0.8, flush_big: 0.8, clog: 0.7, gurgle: 0.8, drain: 0.7, splash: 0.9, squish: 0.8, bubble: 0.7, bubbles_loop: 0.5, drips_loop: 0.45,
    drill_loop: 0.45, drill_burst: 0.6, drill_stop: 0.6, door: 0.8, click: 0.5, faucet: 0.6, van_arrive: 0.55, rain_loop: 0.45, jackhammer: 0.5,
    van_drive_loop: 0.35, engine_start: 0.55, seatbelt: 0.6, van_door_open: 0.7, van_door_close: 0.75, slide_door: 0.6, horn: 0.5, horn_angry: 0.5,
    phone_ring: 0.6, vm_ping: 0.6, ui_tap: 0.45, ui_select: 0.5, espresso_loop: 0.04 };
  let root = '';
  try { const s = document.currentScript && document.currentScript.src; if (s) root = s.replace(/js\/sfx\.js.*$/, ''); } catch (e) {}
  let ac = null, out = null; const buf = {}, loading = {};
  const muted = () => { try { return localStorage.getItem('ddt_sfx_mute') === '1'; } catch (e) { return false; } };
  function ctx() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); out = ac.createGain(); out.gain.value = 1; out.connect(ac.destination); } catch (e) { return null; } }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }
  function get(name) {
    if (buf[name]) return Promise.resolve(buf[name]);
    if (loading[name]) return loading[name];
    if (!ctx()) return Promise.resolve(null);
    return (loading[name] = fetch(`${root}assets/sfx/${name}.mp3`).then(r => r.arrayBuffer()).then(a => new Promise((res, rej) => ac.decodeAudioData(a, res, rej)))
      .then(b => (buf[name] = b)).catch(() => null));
  }
  function start(name, { vol = 1, loop = false, rate = 1, offset = 0, dur = 0 } = {}) {   /* offset/dur: play just a slice of a longer clip */
    const h = { src: null, stopped: false, stop() { this.stopped = true; try { this.src && this.src.stop(); } catch (e) {} } };
    if (muted()) return h;
    get(name).then(b => {
      if (!b || h.stopped || !ctx()) return;
      const s = ac.createBufferSource(), v = ac.createGain(); s.buffer = b; s.loop = loop; s.playbackRate.value = rate;
      if (loop) { s.loopStart = 0.05; s.loopEnd = b.duration - 0.05; }
      const gv = (VOL[name] ?? 0.7) * vol; v.gain.value = gv; s.connect(v).connect(out);
      if (dur > 0) { const o = Math.min(offset, Math.max(0, b.duration - dur)), t0 = ac.currentTime; v.gain.setValueAtTime(0, t0); v.gain.linearRampToValueAtTime(gv, t0 + 0.04); v.gain.setValueAtTime(gv, t0 + dur - 0.12); v.gain.linearRampToValueAtTime(0, t0 + dur); s.start(t0, o, dur); }
      else s.start(0, offset); h.src = s;
    });
    return h;
  }
  // warm the cache once the page has had a tap (browsers block audio before that)
  const warm = () => { if (ctx()) NAMES.forEach(get); removeEventListener('pointerdown', warm, true); removeEventListener('keydown', warm, true); };
  addEventListener('pointerdown', warm, true); addEventListener('keydown', warm, true);
  try { if (navigator.userActivation && navigator.userActivation.hasBeenActive) setTimeout(warm, 0); } catch (e) {}

  return {
    play: (name, o) => start(name, o),
    loop: (name, o) => start(name, { ...(o || {}), loop: true }),
    // swap a story page's synth sounds for recorded ones (keeps the synth for anything not listed)
    patch(SND) {
      if (!SND) return;
      SND.flush = () => start('flush');
      SND.gurgle = () => start('gurgle');
      SND.snag = () => start('drill_stop', { vol: 0.8 });
      const blip = SND.blip; SND.blip = () => { start('click'); };
      SND.splash = () => start('splash');
    },
  };
})();
