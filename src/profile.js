// src/profile.js — loads the Master Profile and resolves a Preset into the flat
// shape the renderers consume.
//
// A Preset is an ordered list of picks. Each pick names an Entry and, after an
// optional "@n", which of its Phrasings to use. Order of the list is render
// order, and a bullet attaches to whichever role or project was selected before
// it — so a bullet must always follow its parent.

import fs from "fs";
import { load } from "js-yaml";

export function loadProfile(file) {
  return load(fs.readFileSync(file, "utf8"));
}

export function listPresets(profile) {
  return Object.keys(profile.presets ?? {});
}

function parsePick(pick) {
  const at = String(pick).lastIndexOf("@");
  if (at === -1) return { id: String(pick), index: 0 };
  return { id: pick.slice(0, at), index: Number(pick.slice(at + 1)) };
}

export function resolvePreset(profile, name) {
  const picks = profile.presets?.[name];
  if (!picks) throw new Error(`Unknown preset "${name}"`);

  const resolved = {
    slug: name,
    CONTACT: profile.contact,
    EDUCATION: profile.education,
    title: null,
    summary: null,
    skills: [],
    experience: null,
    projects: [],
    certificates: [],
  };

  // Entry id → the object its bullets get appended to.
  const openParents = new Map();

  picks.forEach((pick, i) => {
    const where = `preset "${name}" pick ${i + 1} (${pick})`;
    const { id, index } = parsePick(pick);

    const entry = profile.entries?.[id];
    if (!entry) throw new Error(`${where}: no entry "${id}" in the profile`);

    const text = entry.phrasings?.[index];
    if (text === undefined) {
      const n = entry.phrasings?.length ?? 0;
      throw new Error(`${where}: "${id}" has ${n} phrasing(s), so @${index} is out of range`);
    }

    switch (entry.kind) {
      case "headline":
        resolved.title = text;
        break;

      case "summary":
        resolved.summary = text;
        break;

      case "role":
        // The renderers lay out a single role, so selecting two is a mistake
        // rather than something to silently drop.
        if (resolved.experience) {
          throw new Error(`${where}: a second role was selected; the renderers support one`);
        }
        resolved.experience = { title: text, date: entry.date, bullets: [] };
        openParents.set(id, resolved.experience);
        break;

      case "project": {
        const project = { name: entry.name, meta: text, bullets: [] };
        resolved.projects.push(project);
        openParents.set(id, project);
        break;
      }

      case "bullet": {
        const parent = openParents.get(entry.parent);
        if (!parent) {
          throw new Error(`${where}: parent "${entry.parent}" must be selected before its bullets`);
        }
        parent.bullets.push(text);
        break;
      }

      case "skill":
        resolved.skills.push([entry.label, text]);
        break;

      case "certificate":
        resolved.certificates.push({ name: text, issuer: entry.issuer, date: entry.date });
        break;

      default:
        throw new Error(`${where}: "${id}" has unrecognised kind "${entry.kind}"`);
    }
  });

  return resolved;
}
