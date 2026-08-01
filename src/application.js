// src/application.js — Applications: one tailored resume per opening, kept.
//
// An Application is the same shape as a Preset — an ordered list of picks over
// the Master Profile — plus the Job Description it was written for, the
// Requirements drawn out of it, and the text as frozen at the moment it was
// sent. It is never regenerated from the Profile, because the Profile keeps
// changing and the question an archived Application has to answer is "what
// exactly did I send these people?"
//
// The division of labour (ADR-0003): the agent decides which Entry evidences
// which Requirement. This file does the accounting the agent is unreliable at —
// making sure nothing silently vanishes.

import fs from "fs";
import path from "path";
import { resolveSelection, UNSOURCEABLE_KINDS } from "./selection.js";

export const MODES = ["selection", "provenance", "free"];
export const DEFAULT_MODE = "provenance";

const APPLICATION_FILE = "application.json";
const JD_FILE = "jd.md";

export function applicationDir(root, id) {
  return path.join(root, id);
}

export function listApplications(root) {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => fs.existsSync(path.join(root, d.name, APPLICATION_FILE)))
    .map((d) => d.name)
    .sort();
}

export function loadApplication(root, id) {
  const dir = applicationDir(root, id);
  const file = path.join(dir, APPLICATION_FILE);
  if (!fs.existsSync(file)) throw new Error(`No application "${id}" in ${root}`);

  const application = JSON.parse(fs.readFileSync(file, "utf8"));
  const jdPath = path.join(dir, JD_FILE);
  application.jd = fs.existsSync(jdPath) ? fs.readFileSync(jdPath, "utf8") : null;
  return application;
}

export function saveApplication(root, application, { jd } = {}) {
  const dir = applicationDir(root, application.id);
  fs.mkdirSync(dir, { recursive: true });

  // jd is stored beside the record rather than inside it: postings get taken
  // down, and prose belongs in a file you can read.
  if (jd !== undefined) fs.writeFileSync(path.join(dir, JD_FILE), jd);

  const { jd: _omit, ...record } = application;
  fs.writeFileSync(
    path.join(dir, APPLICATION_FILE),
    JSON.stringify(record, null, 2) + "\n",
  );
  return dir;
}

export function createApplication({ id, company, role, createdAt, mode = DEFAULT_MODE }) {
  if (!id) throw new Error("An application needs an id");
  if (!MODES.includes(mode)) {
    throw new Error(`Unknown mode "${mode}". Known: ${MODES.join(", ")}`);
  }
  return {
    id,
    company: company ?? null,
    role: role ?? null,
    createdAt: createdAt ?? null,
    mode,
    requirements: [],
    selection: [],
  };
}

// The accounting pass. Returns findings rather than throwing, because a Gap is
// a fact about the candidate, not an error — the caller decides what to do.
export function checkApplication(profile, application) {
  const errors = [];
  const unsourced = [];
  const mode = application.mode ?? DEFAULT_MODE;

  if (!MODES.includes(mode)) {
    errors.push(`Unknown mode "${mode}". Known: ${MODES.join(", ")}`);
  }

  const selection = application.selection ?? [];
  const selectedIds = new Set(selection.map((i) => i.id).filter(Boolean));

  selection.forEach((item, i) => {
    const where = `selection item ${i + 1}`;

    if (!item.id) {
      if (mode !== "free") {
        errors.push(`${where}: unsourced, which ${mode} mode does not allow`);
      } else if (!UNSOURCEABLE_KINDS.includes(item.kind)) {
        errors.push(`${where}: "${item.kind}" may never be unsourced`);
      }
      unsourced.push({ index: i, text: item.text });
      return;
    }

    const entry = profile.entries?.[item.id];
    if (!entry) {
      errors.push(`${where}: no entry "${item.id}" in the profile`);
      return;
    }

    // In selection mode the text must be one the candidate already approved,
    // verbatim — that is the whole guarantee the mode offers.
    if (mode === "selection" && !(entry.phrasings ?? []).includes(item.text)) {
      errors.push(`${where}: "${item.id}" text is not one of its phrasings, which selection mode requires`);
    }
  });

  const requirements = application.requirements ?? [];
  const gaps = [];

  requirements.forEach((req, i) => {
    const where = `requirement ${i + 1} ("${req.text ?? req.id ?? "?"}")`;
    const covers = req.covers ?? [];

    if (covers.length === 0) {
      gaps.push(req);
      return;
    }

    for (const id of covers) {
      if (!profile.entries?.[id]) {
        errors.push(`${where}: cites "${id}", which is not in the profile`);
      } else if (!selectedIds.has(id)) {
        // A requirement covered by something not on the resume is not covered.
        errors.push(`${where}: cites "${id}", which this application does not include`);
      }
    }
  });

  return {
    ok: errors.length === 0,
    errors,
    gaps,
    unsourced,
    covered: requirements.length - gaps.length,
    requirements: requirements.length,
    mode,
  };
}

export function resolveApplication(profile, application) {
  return {
    slug: application.id,
    ...resolveSelection(profile, application.selection ?? [], `application "${application.id}"`),
  };
}
