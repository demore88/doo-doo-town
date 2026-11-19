// =====================================================================
// SONGS — every song in the game, which ones are unlocked, and which are in the van radio's rotation.
// Saved in localStorage 'ddt_songs' as { unl: [files unlocked], off: [files taken out of the rotation] }.
// =====================================================================
window.DDT_SONGS = window.DDT_SONGS || (() => {
  const ALL = [
    { file: 'doo_doo_town.mp3', name: 'DOO DOO TOWN' },
    { file: 'doo_doo_town_rock.mp3', name: 'DOO DOO TOWN ROCK' },
    { file: 'that_cloggin_sound.mp3', name: "THAT CLOGGIN' SOUND" },
    { file: 'brown_friday.mp3', name: 'BROWN FRIDAY' },
    { file: 'the_brown_note.mp3', name: 'THE BROWN NOTE' },
    { file: 'nightmares.mp3', name: 'NIGHTMARES' },
    { file: 'under_the_trailer.mp3', name: 'UNDER THE TRAILER', lock: 'Beat THE RAT KING under the trailer' },
    { file: 'foot_on_the_gas.mp3', name: 'FOOT ON THE GAS', lock: 'Drive past 300 miles in the Driving Game' },
    { file: 'too_sexy_for_this_truck.mp3', name: 'TOO SEXY FOR THIS TRUCK', lock: 'Win a DOWNHILL DRIFT race against the Clog Kings' },
  ];
  const load = () => { try { const o = JSON.parse(localStorage.getItem('ddt_songs') || '{}'); return { unl: o.unl || [], off: o.off || [] }; } catch (e) { return { unl: [], off: [] }; } };
  const save = o => { try { localStorage.setItem('ddt_songs', JSON.stringify(o)); } catch (e) {} };
  const isUnlocked = f => { const S = ALL.find(x => x.file === f); return !!S && (!S.lock || load().unl.includes(f)); };
  return {
    ALL,
    isUnlocked,
    inRotation: f => isUnlocked(f) && !load().off.includes(f),
    unlock(f) { const o = load(); if (o.unl.includes(f)) return false; o.unl.push(f); save(o); return true; },   /* true the first time: show the "unlocked!" banner */
    toggle(f) { const o = load(); o.off = o.off.includes(f) ? o.off.filter(x => x !== f) : [...o.off, f]; save(o); return !o.off.includes(f); },
    rotation() { const L = ALL.filter(x => isUnlocked(x.file) && !load().off.includes(x.file)); return L.length ? L : [ALL[0]]; },   /* never empty */
  };
})();
