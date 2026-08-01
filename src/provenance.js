// src/provenance.js — did a bullet get picked, or written?
//
// Phrasings are a bet: that holding several approved wordings of a fact means
// tailoring can often *pick* one instead of generating new prose. This module
// makes that bet falsifiable.
//
// The measurement has to be stamped at the moment a selection is saved, not
// recomputed later. Promoting approved rewrites back into the profile means a
// bullet that was written from scratch in March matches a phrasing by June — so
// recomputing would show the pick rate climbing towards 100% purely because the
// library absorbed its own output. Stamping freezes what actually happened.

import { listApplications, loadApplication } from "./application.js";

export const PICKED = "picked";
export const REWRITTEN = "rewritten";
export const UNSOURCED = "unsourced";

// Returns the selection with each item's origin recorded. Sourced items also
// record which phrasing was reused, which is what makes unused phrasings
// findable later.
export function stampSelection(profile, selection = []) {
  return selection.map((item) => {
    if (!item.id) return { ...item, origin: UNSOURCED };

    const phrasings = profile.entries?.[item.id]?.phrasings ?? [];
    const index = phrasings.indexOf(item.text);

    return index === -1
      ? { ...item, origin: REWRITTEN }
      : { ...item, origin: PICKED, phrasing: index };
  });
}

export function summarise(selection = []) {
  const counts = { [PICKED]: 0, [REWRITTEN]: 0, [UNSOURCED]: 0, unstamped: 0 };
  for (const item of selection) {
    if (item.origin) counts[item.origin] += 1;
    else counts.unstamped += 1;
  }
  return counts;
}

// The number the Phrasing bet lives or dies by. `unstamped` is reported rather
// than guessed at: applications written before stamping existed, or edited by
// hand, carry no origin, and a pick rate computed over a partial sample should
// say so instead of quietly implying full coverage.
export function pickRate(root) {
  const ids = listApplications(root);
  const totals = { [PICKED]: 0, [REWRITTEN]: 0, [UNSOURCED]: 0, unstamped: 0 };
  const perApplication = [];

  for (const id of ids) {
    const counts = summarise(loadApplication(root, id).selection ?? []);
    perApplication.push({ application: id, ...counts });
    for (const key of Object.keys(totals)) totals[key] += counts[key];
  }

  const measured = totals[PICKED] + totals[REWRITTEN];

  return {
    applications: ids.length,
    ...totals,
    // Null rather than 0 when nothing is measurable — an unknown rate and a rate
    // of zero mean very different things for the bet.
    pickRate: measured === 0 ? null : totals[PICKED] / measured,
    perApplication,
  };
}
