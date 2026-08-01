// src/promote.js — promote an approved rewrite into a Phrasing.
//
// Hand-curation cannot keep pace with the number of ways job descriptions
// differ, so the Phrasing library only grows if approved rewrites are written
// back. It stays *gated*: the candidate approves the wording first, and only
// then is it promoted. Nothing here decides that a rewrite was good.
//
// The insertion is surgical rather than a parse-and-dump. A Master Profile is
// written by hand and carries comments, blank lines, and deliberate ordering;
// round-tripping it through a YAML serialiser would silently destroy all of
// that. So we locate the entry's phrasing sequence in the raw text and splice a
// single item into it, leaving every other byte alone.

import fs from "fs";
import { loadProfile } from "./profile.js";

const indentOf = (line) => line.length - line.trimStart().length;
const isBlank = (line) => line.trim() === "";

// Plain YAML scalars are fine for ordinary prose, but a leading indicator
// character or an embedded ": " changes the parse. Quote when in doubt.
function needsQuoting(text) {
  return /^[-?:&*!|>%@`"'#]/.test(text) || /:\s/.test(text) || /\s#/.test(text) || text !== text.trim();
}

function renderItem(text, indent) {
  const pad = " ".repeat(indent);

  if (needsQuoting(text)) {
    return [`${pad}- "${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`];
  }

  // Short enough to read on one line; anything longer gets a folded block so the
  // file stays legible in a diff, matching how the profile is already written.
  if (`${pad}- ${text}`.length <= 88) return [`${pad}- ${text}`];

  const bodyPad = " ".repeat(indent + 2);
  const lines = [`${pad}- >-`];
  let current = "";
  for (const word of text.split(/\s+/)) {
    if (current && `${bodyPad}${current} ${word}`.length > 88) {
      lines.push(bodyPad + current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(bodyPad + current);
  return lines;
}

function findEntryLine(lines, entryId) {
  // Keys are quoted-free plain scalars in a Master Profile, so an exact match on
  // the key text is enough — but escape anyway, ids contain dots.
  const pattern = new RegExp(`^(\\s+)${entryId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*$`);
  for (let i = 0; i < lines.length; i++) {
    const m = pattern.exec(lines[i]);
    if (m) return { index: i, indent: m[1].length };
  }
  return null;
}

export function promotePhrasing(profilePath, entryId, text) {
  // A Phrasing is one line of prose. Collapsing internal whitespace keeps an
  // embedded newline from splicing a stray line into the file at the wrong
  // indent, which would corrupt a document nothing else in the system rewrites.
  const trimmed = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed) throw new Error("A phrasing needs text");

  const profile = loadProfile(profilePath);
  const entry = profile.entries?.[entryId];
  if (!entry) throw new Error(`No entry "${entryId}" in the profile`);

  if ((entry.phrasings ?? []).includes(trimmed)) {
    // Already approved — promoting again would just add a duplicate.
    return { promoted: false, reason: "already a phrasing", index: entry.phrasings.indexOf(trimmed) };
  }

  const raw = fs.readFileSync(profilePath, "utf8");
  const newline = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/);

  const found = findEntryLine(lines, entryId);
  if (!found) throw new Error(`Could not locate "${entryId}" in ${profilePath}`);

  // Walk the entry's own block looking for its phrasings key.
  let phrasingsLine = -1;
  for (let i = found.index + 1; i < lines.length; i++) {
    if (isBlank(lines[i])) continue;
    if (indentOf(lines[i]) <= found.indent) break; // left the entry
    if (/^\s*phrasings:\s*$/.test(lines[i])) {
      phrasingsLine = i;
      break;
    }
  }
  if (phrasingsLine === -1) throw new Error(`"${entryId}" has no phrasings block to append to`);

  // The sequence runs until the first non-blank line indented no further than
  // the phrasings key itself. Trailing blanks belong to whatever follows.
  const phrasingsIndent = indentOf(lines[phrasingsLine]);
  let lastItemLine = phrasingsLine;
  let itemIndent = -1;
  for (let i = phrasingsLine + 1; i < lines.length; i++) {
    if (isBlank(lines[i])) continue;
    if (indentOf(lines[i]) <= phrasingsIndent) break;
    // Take the indent from a dash line, never from the last line of the block:
    // a folded scalar's continuation lines sit deeper than the item they belong
    // to, and indenting a new item to match one makes it part of that scalar
    // instead of a sibling.
    if (itemIndent === -1 && /^\s*- /.test(lines[i])) itemIndent = indentOf(lines[i]);
    lastItemLine = i;
  }
  if (itemIndent === -1) itemIndent = phrasingsIndent + 2; // empty block

  lines.splice(lastItemLine + 1, 0, ...renderItem(trimmed, itemIndent));
  const updated = lines.join(newline);

  // Never leave behind a profile we cannot read back. Write, then re-parse and
  // confirm the phrasing landed on the right entry and nothing else moved —
  // rolling the file back byte-for-byte if either check fails.
  fs.writeFileSync(profilePath, updated);

  let reparsed;
  try {
    reparsed = loadProfile(profilePath);
  } catch (e) {
    fs.writeFileSync(profilePath, raw);
    throw new Error(`Promoting would have produced invalid YAML (${e.message}); profile left unchanged`);
  }

  const after = reparsed.entries?.[entryId]?.phrasings ?? [];
  const index = after.indexOf(trimmed);
  const intact =
    index !== -1 &&
    after.length === (entry.phrasings?.length ?? 0) + 1 &&
    Object.keys(reparsed.entries).length === Object.keys(profile.entries).length;

  if (!intact) {
    fs.writeFileSync(profilePath, raw);
    throw new Error("Promoting did not produce the expected profile; left unchanged");
  }

  return { promoted: true, entry: entryId, index, phrasings: after.length };
}
