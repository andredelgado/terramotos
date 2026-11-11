// The stories dialog.
import { STORIES } from './content/stories.js';
import { $ } from './dom.js';
import { fmtDate, fmtDec, fmtTime, L, lang } from './i18n.js';
import { S } from './state.js';
import { CHUNKS, ensureYear } from './store.js';
import { writeHash } from './url.js';
import { esc, yearOf } from './util.js';

/* ---------- stories ---------- */
export const storyDlg = $('#story');
export let storyOpen = null; // null: closed; '': the list of stories; otherwise a story's key
export function renderStory() {
  const body = $('#storyBody');
  if (!storyOpen) {
    body.innerHTML = `<h2 id="storyTitle">${L.stories}</h2><p>${L.storiesIntro}</p><ul class="story-list">` +
      STORIES.map((st) => `<li><button type="button" data-story="${st.key}"><b>${esc(st[lang].title)}</b><span>${esc(st[lang].line)}</span></button></li>`).join('') + '</ul>';
    return;
  }
  const st = STORIES.find((x) => x.key === storyOpen), text = st[lang];
  const ev = CHUNKS.get(yearOf(st.t))?.events.find((x) => x.id === st.id);
  const iso = (t) => new Date(t * 1000).toISOString();
  body.innerHTML = `<p><button class="back" type="button">${L.storyAll}</button></p><h2 id="storyTitle">${esc(text.title)}</h2>` +
    `<p class="story-meta">${ev && !Number.isNaN(ev.m) ? `M ${fmtDec(ev.m, 1)} · ` : ''}${fmtDate(st.t)} · ${fmtTime(st.t).slice(0, 5)} UTC</p>` +
    text.body.map((p) => `<p>${esc(p)}</p>`).join('') +
    `<p class="story-links"><a href="#s=1d&q=${st.id}">${L.onDrum}</a>` +
    `<a href="#v=map&from=${iso(st.t - 86400)}&to=${iso(st.t + 30 * 86400)}&q=${st.id}">${L.onMap}</a>` +
    `<a href="#v=list&q=${st.id}">${L.onList}</a></p>`;
}
export function openStory(key) {
  storyOpen = STORIES.some((st) => st.key === key) ? key : '';
  renderStory();
  if (!storyDlg.open) storyDlg.showModal();
  if (storyOpen && S.META) { const st = STORIES.find((x) => x.key === storyOpen); ensureYear(yearOf(st.t)).then(() => { if (storyOpen === st.key) renderStory(); }); }
  writeHash();
}
storyDlg.addEventListener('close', () => { storyOpen = null; writeHash(); });
storyDlg.addEventListener('click', (ev) => {
  const pick = ev.target.closest('[data-story]');
  if (pick) openStory(pick.dataset.story);
  else if (ev.target.closest('.back')) openStory('');
  else if (ev.target === storyDlg || ev.target.closest('.close') || ev.target.closest('a')) storyDlg.close();
});
$('#storiesBtn').addEventListener('click', () => openStory(''));
