// src/selection.js — the one walk shared by Presets and Applications.
//
// Both are an ordered list of picks over a Master Profile; they differ only in
// where the text comes from. A Preset looks up one of the Entry's Phrasings; an
// Application carries the text it froze at the moment it was sent. Everything
// after that — structure, ordering, which bullet belongs to which project — is
// identical, so it lives here once.
//
// An item is:
//   { id, text }                       sourced — id names an Entry
//   { id: null, kind, parent?, text }  unsourced — only legal in `free` mode
//
// Unsourced items are restricted to bullets, headlines and summaries on purpose.
// Reframing a bullet is a judgement call; inventing an employer or a project you
// never had is a different kind of act, and the model should not have a path to
// it at all.
export const UNSOURCEABLE_KINDS = ["bullet", "headline", "summary"];

export function resolveSelection(profile, items, label = "selection") {
  const resolved = {
    CONTACT: profile.contact,
    EDUCATION: profile.education,
    title: null,
    summary: null,
    skills: [],
    experiences: [],
    projects: [],
    certificates: [],
  };

  // Entry id → the object its bullets get appended to.
  const openParents = new Map();

  items.forEach((item, i) => {
    const where = `${label} item ${i + 1}`;
    const text = item.text;

    let entry;
    let kind;
    let parent;

    if (item.id) {
      entry = profile.entries?.[item.id];
      if (!entry) throw new Error(`${where}: no entry "${item.id}" in the profile`);
      kind = entry.kind;
      parent = entry.parent;
    } else {
      kind = item.kind;
      parent = item.parent;
      if (!kind) {
        throw new Error(`${where}: an unsourced item must state its kind`);
      }
      if (!UNSOURCEABLE_KINDS.includes(kind)) {
        throw new Error(
          `${where}: "${kind}" cannot be unsourced — only ${UNSOURCEABLE_KINDS.join(", ")} may be`,
        );
      }
    }

    if (typeof text !== "string" || text.length === 0) {
      throw new Error(`${where}: no text`);
    }

    switch (kind) {
      case "headline":
        resolved.title = text;
        break;

      case "summary":
        resolved.summary = text;
        break;

      case "role": {
        // Roles render in selection order, so a profile listing a current job
        // before an earlier one gets that order on the page. The renderers
        // laid out exactly one role until 0.5.0 and threw on a second; they
        // now loop, because a contractor can hold two at once.
        const role = { title: text, date: entry.date, bullets: [] };
        resolved.experiences.push(role);
        openParents.set(item.id, role);
        break;
      }

      case "project": {
        const project = { name: entry.name, meta: text, bullets: [] };
        resolved.projects.push(project);
        openParents.set(item.id, project);
        break;
      }

      case "bullet": {
        const target = openParents.get(parent);
        if (!target) {
          throw new Error(`${where}: parent "${parent}" must be selected before its bullets`);
        }
        target.bullets.push(text);
        break;
      }

      case "skill":
        resolved.skills.push([entry.label, text]);
        break;

      case "certificate":
        resolved.certificates.push({ name: text, issuer: entry.issuer, date: entry.date });
        break;

      default:
        throw new Error(`${where}: unrecognised kind "${kind}"`);
    }
  });

  return resolved;
}
