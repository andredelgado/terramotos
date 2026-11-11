// Colouring the map's earthquakes by depth or age.
import { $ } from '../dom.js';
import { schedule } from '../drum.js';
import { L } from '../i18n.js';
import { writeHash } from '../url.js';
import { pref } from '../util.js';

// one colour, or a light-to-dark ramp for depth or for age within the period
export let mapColour = ['depth', 'age'].includes(pref('seis.colour')) ? pref('seis.colour') : 'none';
const colourSel = $('#colour');
export function showColour() {
  colourSel.value = mapColour;
  const sw = [1, 2, 3, 4, 5].map((i) => `<i style="background:var(--s${i})"></i>`);
  const ramp = $('#ramp');
  ramp.hidden = mapColour === 'none';
  ramp.innerHTML = mapColour === 'depth' ? ['0', '5', '15', '30', '60'].map((km, i) => km + ' ' + sw[i]).join(' ') + ' km'
    : mapColour === 'age' ? `${L.older} ${sw.join('')} ${L.newer}` : '';
}
export function setColour(c) {
  mapColour = ['depth', 'age'].includes(c) ? c : 'none';
  pref('seis.colour', mapColour); showColour(); schedule(); writeHash();
}
colourSel.addEventListener('change', () => setColour(colourSel.value));
