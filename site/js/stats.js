// The statistics view.
import { STAT_PERIODS } from './config.js';
import { $, statsBox } from './dom.js';
import { schedule } from './drum.js';
import { fmtDate, fmtDec, fmtNum, L, lang, MON, placeName, REGION } from './i18n.js';
import { S } from './state.js';
import { CHUNKS, E, ensureYears, FAILED, MAG, mask, N, REG, T } from './store.js';
import { writeHash } from './url.js';
import { esc, lowerBound, pref, yearOf } from './util.js';

export let statsPeriod = Object.hasOwn(STAT_PERIODS, pref('seis.stats') || '') ? pref('seis.stats') : 'all';
S.statsKey = '';
export function setStatsPeriod(period) {
  statsPeriod = period; pref('seis.stats', period);
  document.querySelectorAll('#speriods button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sp === period)));
  schedule(); writeHash();
}
document.querySelectorAll('#speriods button').forEach((b) => b.addEventListener('click', () => setStatsPeriod(b.dataset.sp)));
const filterHash = (parts) => '#' + [S.minMag !== 'all' ? 'm=' + S.minMag : '', S.region !== 'all' ? 'r=' + S.region : '', ...parts].filter(Boolean).join('&');
const drumHash = (s, t) => filterHash(['s=' + s, 't=' + new Date(Math.min(S.END, t) * 1000).toISOString().slice(0, 13)]);
export function renderStats() {
  if (!S.META) return;
  const b = S.END, a = statsPeriod === 'all' ? S.FIRST : Math.max(S.FIRST, b - STAT_PERIODS[statsPeriod]);
  const years = [], missing = [];
  for (let y = yearOf(a); y <= yearOf(b); y++) if (S.META.years[y]) { years.push(y); if (!CHUNKS.has(y)) missing.push(y); }
  ensureYears(missing);
  if (missing.some((y) => FAILED.has(y))) setTimeout(schedule, 21000);
  $('#range').innerHTML = `<b>${fmtDate(a)} – ${fmtDate(b)}</b>`;
  $('#inview').textContent = missing.some((y) => FAILED.has(y)) ? L.failedY(missing.find((y) => FAILED.has(y))) : '';
  const key = [statsPeriod, S.minMag, S.region, lang, N, missing.length, Math.floor(b / 600)].join();
  if (key === S.statsKey) return;
  S.statsKey = key;
  if (missing.length) { statsBox.innerHTML = `<p class="stats-wait">${L.stLoading(years.length - missing.length, years.length)}</p>`; return; }

  // bins: years for the whole record, months for ten years or one, days for thirty days
  const unit = statsPeriod === 'all' ? 'year' : statsPeriod === '30d' ? 'day' : 'month';
  const first = new Date(a * 1000), starts = [], names = [];
  for (let k = 0; ; k++) {
    const t = Date.UTC(first.getUTCFullYear() + (unit === 'year' ? k : 0), unit === 'year' ? 0 : first.getUTCMonth() + (unit === 'month' ? k : 0), unit === 'day' ? first.getUTCDate() + k : 1) / 1000;
    if (t > b) break;
    const d = new Date(t * 1000);
    starts.push(t);
    names.push(unit === 'year' ? String(d.getUTCFullYear()) : unit === 'month' ? `${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}` : fmtDate(t));
  }
  const counts = new Array(starts.length).fill(0), energy = new Array(starts.length).fill(0), buckets = new Array(7).fill(0), days = new Map();
  let k = 0, n = 0, top = -1, joules = 0;
  for (let e = lowerBound(T, a), hi = lowerBound(T, b + 1); e < hi; e++) {
    if (!mask[e]) continue;
    while (k + 1 < starts.length && T[e] >= starts[k + 1]) k++;
    n++; counts[k]++;
    const m = MAG[e];
    if (Number.isNaN(m)) buckets[0]++;
    else {
      buckets[m < 2 ? 1 : Math.min(6, Math.floor(m + 1e-6))]++;
      const j = Math.pow(10, 1.5 * m + 4.8);
      energy[k] += j; joules += j;
      if (top < 0 || m > MAG[top]) top = e;
    }
    const day = Math.floor(T[e] / 86400);
    days.set(day, (days.get(day) || 0) + 1);
  }
  if (!n) { statsBox.innerHTML = `<p class="stats-wait">${L.none}</p>`; return; }
  const asMag = (j) => (j > 0 ? Math.max(0, (Math.log10(j) - 4.8) / 1.5) : 0);
  const busiest = [...days].sort((p, q) => q[1] - p[1] || q[0] - p[0]).slice(0, 5);
  const perDay = n / Math.max(1, (b - a) / 86400);
  const openSpan = unit === 'year' ? '1w' : unit === 'month' ? '1d' : '3h';
  const chart = (values, text, label) => {
    const max = Math.max(...values), peak = values.indexOf(max);
    let html = `<p class="note">${L.stPeak(names[peak], text(max))}</p><div class="bars${values.length <= 40 ? ' wide' : ''}" role="img" aria-label="${esc(label)}. ${esc(L.stPeak(names[peak], text(max)))}">`;
    values.forEach((v, i) => {
      const mid = (starts[i] + (starts[i + 1] ?? b)) / 2;
      html += `<i style="height:${v ? Math.max(1.5, 100 * v / max).toFixed(1) : 0}%" title="${esc(names[i])}: ${v ? text(v) : '0'}" data-go="${drumHash(openSpan, mid)}"></i>`;
    });
    return html + `</div><div class="axis"><span>${names[0]}</span><span>${names[names.length >> 1]}</span><span>${names.at(-1)}</span></div>`;
  };
  const largest = top < 0 ? '' : `<span class="k">${L.stLargest}</span><b>M ${fmtDec(MAG[top], 1)}</b><small>${fmtDate(T[top])} · ${esc(placeName(E[top].place) || REGION[REG[top]])}</small>`;
  const magRows = [[`${L.stBelow2}`, buckets[1]], ...[2, 3, 4, 5].map((m) => [`${m} – ${fmtDec(m + 0.9, 1)}`, buckets[m]]), ['6+', buckets[6]], [L.stNoMag, buckets[0]]];
  const magMax = Math.max(...buckets);
  statsBox.innerHTML =
    `<div class="tiles"><div><span class="k">${L.stCount}</span><b>${fmtNum(n)}</b><small>${perDay >= 1 ? L.stPerDay(fmtDec(perDay, 1)) : L.stPerYear(fmtDec(perDay * 365.25, 1))}</small></div>` +
    (top < 0 ? '' : /^\d{8}-/.test(E[top].id) ? `<a href="${filterHash(['q=' + E[top].id])}">${largest}</a>` : `<div>${largest}</div>`) +
    `<div><span class="k">${L.stBusiest}</span><b>${fmtNum(busiest[0][1])}</b><small>${fmtDate(busiest[0][0] * 86400)}</small></div>` +
    (top < 0 ? '' : `<div><span class="k">${L.stEnergy}</span><b>≈ M ${fmtDec(asMag(joules), 1)}</b><small>${L.stEnergySub(Math.round(100 * Math.pow(10, 1.5 * MAG[top] + 4.8) / joules))}</small></div>`) +
    `</div><section><h2>${L.stPer[unit]}</h2>${chart(counts, fmtNum, L.stPer[unit])}</section>` +
    (top < 0 ? '' : `<section><h2>${L.stEnergyPer[unit]}</h2><p class="note">${L.stEnergyNote}</p>${chart(energy.map(asMag), (v) => '≈ M ' + fmtDec(v, 1), L.stEnergyPer[unit])}</section>`) +
    `<section><h2>${L.stMag}</h2><ul class="hbars">${magRows.map(([name, v]) => `<li><span class="k">${name}</span><span><i style="width:${(100 * v / magMax).toFixed(1)}%"></i></span><b>${fmtNum(v)}</b></li>`).join('')}</ul></section>` +
    `<section><h2>${L.stDays}</h2><ul class="hbars">${busiest.map(([day, v]) => `<li><span class="k"><a href="${drumHash('3h', day * 86400 + 43200)}">${fmtDate(day * 86400)}</a></span><span><i style="width:${(100 * v / busiest[0][1]).toFixed(1)}%"></i></span><b>${fmtNum(v)}</b></li>`).join('')}</ul></section>` +
    `<p class="note">${L.stNote}</p>`;
}
statsBox.addEventListener('click', (ev) => { const bar = ev.target.closest('[data-go]'); if (bar) location.hash = bar.dataset.go; });
