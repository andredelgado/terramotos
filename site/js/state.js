// The state that more than one module changes. Each field is set up by the module named beside it;
// everything else a module needs from another is imported by name.
export const S = {
  // controls.js
  minMag: undefined,
  region: undefined,
  // store.js
  META: undefined,
  END: undefined,
  FIRST: undefined,
  // selection.js
  hover: undefined,
  pinned: undefined,
  // drum.js
  navigationTime: undefined,
  // url.js
  booted: undefined,
  // map/period.js
  mapTo: undefined,
  mapFrom: undefined,
  mapVisited: undefined,
  mapContextDirty: undefined,
  mapScrollToPinned: undefined,
  // list.js
  listDirty: undefined,
  listJump: undefined,
  // stats.js
  statsKey: undefined,
  // latest.js
  flashId: undefined,
  // feeds.js
  wsTries: undefined,
};
