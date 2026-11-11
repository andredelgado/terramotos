// Playback: filling the map in through time.
import { $ } from '../dom.js';
import { schedule } from '../drum.js';
import { fmtDate, fmtTime, L } from '../i18n.js';
import { unpin } from '../selection.js';
import { S } from '../state.js';
import { cum, T } from '../store.js';
import { lowerBound } from '../util.js';

// Playback: the map fills in from the start of its period to the end. play.t is the moment
// shown, or null when the whole period is on the map.
export const play = { on: false, t: null, last: 0 };
const playBtn = $('#playBtn'), scrub = $('#scrub');
export const playSeconds = () => { const d = Math.log10(Math.max(1, (S.mapTo - S.mapFrom) / 86400)); return Math.min(60, 10 + 3 * d * d); };
// The playhead is paced half by time and half by earthquakes, so that quiet decades pass quickly
// and busy weeks are not over in a blink. playFrac is how far through the playback a moment is.
export const playFrac = (t) => {
  const lo = lowerBound(T, S.mapFrom), n = cum[lowerBound(T, S.mapTo + 1)] - cum[lo];
  const byTime = Math.max(0, Math.min(1, (t - S.mapFrom) / Math.max(1, S.mapTo - S.mapFrom)));
  return n ? 0.5 * byTime + 0.5 * (cum[lowerBound(T, t)] - cum[lo]) / n : byTime;
};
export const playTime = (f) => {
  let a = S.mapFrom, b = S.mapTo;
  for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (playFrac(m) < f) a = m; else b = m; }
  return b;
};
export function playChrome() {
  playBtn.setAttribute('aria-pressed', String(play.on));
  playBtn.setAttribute('aria-label', play.on ? L.aPause : L.aPlay);
  playBtn.title = play.on ? L.aPause : L.aPlay;
  const icon = play.on ? 'M4 3h3v10H4zM9 3h3v10H9z' : 'M4.5 2.5v11l9-5.5z';
  if (playBtn.dataset.icon !== icon) { playBtn.dataset.icon = icon; playBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="${icon}" fill="currentColor"/></svg>`; }
  const t = play.t ?? S.mapTo;
  if (document.activeElement !== scrub || play.on) scrub.value = String(Math.round(1000 * (play.t == null ? 1 : playFrac(t))));
  $('#playAt').textContent = fmtDate(t) + (S.mapTo - S.mapFrom <= 3 * 86400 ? ' ' + fmtTime(t).slice(0, 5) : '');
  scrub.setAttribute('aria-valuetext', $('#playAt').textContent);
}
function setPlay(on) {
  if (on && (play.t == null || play.t >= S.mapTo)) play.t = S.mapFrom;
  if (on) unpin();
  play.on = on; play.last = 0;
  playChrome(); schedule();
}
export function stopPlay() { play.on = false; play.t = null; }
playBtn.addEventListener('click', () => setPlay(!play.on));
scrub.addEventListener('input', () => {
  const f = Number(scrub.value) / 1000;
  play.t = f >= 1 && !play.on ? null : playTime(f);
  play.last = 0; schedule();
});
