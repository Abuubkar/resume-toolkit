// src/profile.js — loads the Master Profile and resolves a Preset.
//
// A Preset is an ordered list of picks. Each pick names an Entry and, after an
// optional "@n", which of its Phrasings to use. Order of the list is render
// order, and a bullet attaches to whichever role or project was selected before
// it — so a bullet must always follow its parent.
//
// The walk that turns picks into a renderable document lives in selection.js,
// because Applications do exactly the same thing with their own frozen text.

import fs from "fs";
import { load } from "js-yaml";
import { resolveSelection } from "./selection.js";

export function loadProfile(file) {
  return load(fs.readFileSync(file, "utf8"));
}

export function listPresets(profile) {
  return Object.keys(profile.presets ?? {});
}

export function parsePick(pick) {
  const at = String(pick).lastIndexOf("@");
  if (at === -1) return { id: String(pick), index: 0 };
  return { id: pick.slice(0, at), index: Number(pick.slice(at + 1)) };
}

export function phrasingOf(profile, id, index, where) {
  const entry = profile.entries?.[id];
  if (!entry) throw new Error(`${where}: no entry "${id}" in the profile`);

  const text = entry.phrasings?.[index];
  if (text === undefined) {
    const n = entry.phrasings?.length ?? 0;
    throw new Error(`${where}: "${id}" has ${n} phrasing(s), so @${index} is out of range`);
  }
  return text;
}

export function resolvePreset(profile, name) {
  const picks = profile.presets?.[name];
  if (!picks) throw new Error(`Unknown preset "${name}"`);

  const items = picks.map((pick, i) => {
    const { id, index } = parsePick(pick);
    return {
      id,
      text: phrasingOf(profile, id, index, `preset "${name}" pick ${i + 1} (${pick})`),
    };
  });

  return { slug: name, ...resolveSelection(profile, items, `preset "${name}"`) };
}
