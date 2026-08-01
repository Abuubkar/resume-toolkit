// src/gaps.js — what you keep not having.
//
// A single Gap is easy to wave away at the moment you want to hit send. The
// same Gap across seven of your last ten applications is a different sentence:
// it is career advice, and it is only available because every Application is
// kept. This is the payoff for keeping them.

import { listApplications, loadApplication } from "./application.js";

function normalise(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#.]+/gu, " ")
    .trim();
}

// Requirements group by their `tag` when one is present, falling back to
// normalised text. Tagging is the agent's job: "Kubernetes", "K8s" and
// "Kubernetes in production" are the same lack, and only a reader can say so.
function keyOf(requirement) {
  return requirement.tag ? `tag:${normalise(requirement.tag)}` : `text:${normalise(requirement.text)}`;
}

export function aggregateGaps(root) {
  const ids = listApplications(root);
  const byKey = new Map();

  for (const id of ids) {
    const application = loadApplication(root, id);
    const seenHere = new Set();

    for (const requirement of application.requirements ?? []) {
      if ((requirement.covers ?? []).length > 0) continue;

      const key = keyOf(requirement);
      // One application counts once for a given gap, however often it restates it.
      if (seenHere.has(key)) continue;
      seenHere.add(key);

      if (!byKey.has(key)) {
        byKey.set(key, { label: requirement.tag ?? requirement.text, applications: [] });
      }
      byKey.get(key).applications.push(id);
    }
  }

  const gaps = [...byKey.values()]
    .map((g) => ({ ...g, count: g.applications.length }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return { total: ids.length, gaps };
}
