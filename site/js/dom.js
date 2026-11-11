// Elements that more than one module uses.
export const $ = (s) => document.querySelector(s);
export const drum = $('#drum'), cv = $('#drumCanvas'), spacer = $('#spacer');
export const main = drum.parentElement, railBox = $('#railBox'), railCv = $('#rail'), tip = $('#tip');
export const ctx = cv.getContext('2d'), rctx = railCv.getContext('2d');
export const listBox = $('#list'), rowsEl = $('#rows');
export const atlas = $('#atlas'), statsBox = $('#stats');

export const magSel = $('#mag'), regSel = $('#region'), jumpSel = $('#jump');
