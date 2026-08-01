import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { loadProfile, promotePhrasing } from "../src/index.js";
import { FIXTURE_PROFILE, tempDir, throwsWith } from "./helpers.js";

// A profile is hand-written and carries comments, blank lines, and deliberate
// ordering. Every test here works on a copy and checks what survived.
function scratchProfile() {
  const file = path.join(tempDir("promote"), "profile.yaml");
  fs.copyFileSync(FIXTURE_PROFILE, file);
  return file;
}

describe("promotePhrasing", () => {
  let file;
  beforeEach(() => {
    file = scratchProfile();
  });

  it("appends to the entry's phrasings", () => {
    const result = promotePhrasing(file, "role.acme.apis", "Owned the public HTTP surface end to end.");

    assert.equal(result.promoted, true);
    assert.equal(result.index, 2);
    assert.deepEqual(loadProfile(file).entries["role.acme.apis"].phrasings, [
      "Designed REST APIs.",
      "Built HTTP services.",
      "Owned the public HTTP surface end to end.",
    ]);
  });

  // The whole reason this is a text splice rather than a YAML round-trip.
  it("leaves comments, blank lines and every other entry untouched", () => {
    const before = fs.readFileSync(file, "utf8");
    promotePhrasing(file, "role.acme.apis", "Owned the public HTTP surface.");
    const after = fs.readFileSync(file, "utf8");

    for (const comment of before.split("\n").filter((l) => l.trim().startsWith("#"))) {
      assert.ok(after.includes(comment), `lost comment: ${comment}`);
    }
    assert.equal(
      after.split("\n").filter((l) => l.trim() === "").length,
      before.split("\n").filter((l) => l.trim() === "").length,
      "blank-line structure changed",
    );

    // Only the one entry moved.
    const b = loadProfile(FIXTURE_PROFILE).entries;
    const a = loadProfile(file).entries;
    assert.deepEqual(Object.keys(a), Object.keys(b));
    for (const id of Object.keys(b)) {
      if (id === "role.acme.apis") continue;
      assert.deepEqual(a[id], b[id], `entry ${id} changed`);
    }
  });

  it("appends to an entry that has only one phrasing", () => {
    promotePhrasing(file, "project.widget.perf", "Cut p95 latency by half.");
    assert.deepEqual(loadProfile(file).entries["project.widget.perf"].phrasings, [
      "Made it faster.",
      "Cut p95 latency by half.",
    ]);
  });

  // The case a fixture of one-line phrasings cannot reach: appending after a
  // folded block, whose last line is indented deeper than the item it belongs to.
  it("appends after a folded phrasing as a sibling, not a continuation of it", () => {
    promotePhrasing(file, "role.acme.scale", "Tripled throughput.");

    const phrasings = loadProfile(file).entries["role.acme.scale"].phrasings;
    assert.equal(phrasings.length, 3);
    assert.equal(phrasings.at(-1), "Tripled throughput.");
    // The block it was appended after must be unchanged, not extended.
    assert.equal(
      phrasings[1],
      "Reworked ingestion so peak volume tripled with no change to the maintenance window.",
    );
  });

  it("appends a folded phrasing after another folded one", () => {
    const long =
      "Rebuilt ingestion so nightly batches finish inside the maintenance window even when " +
      "upstream volume triples, using batched writes and a partitioned queue.";
    promotePhrasing(file, "role.acme.scale", long);

    const phrasings = loadProfile(file).entries["role.acme.scale"].phrasings;
    assert.equal(phrasings.length, 3);
    assert.equal(phrasings.at(-1), long);
  });

  it("folds long wording across lines rather than writing one huge line", () => {
    const long =
      "Rebuilt the ingestion pipeline so that nightly batches complete inside the maintenance " +
      "window even when upstream volume triples, using batched writes and a partitioned queue.";
    promotePhrasing(file, "role.acme.apis", long);

    assert.equal(loadProfile(file).entries["role.acme.apis"].phrasings.at(-1), long);
    const lines = fs.readFileSync(file, "utf8").split("\n");
    assert.ok(lines.every((l) => l.length <= 92), "produced an over-long line");
  });

  it("quotes wording YAML would otherwise reinterpret", () => {
    const risky = "Note: shipped the thing";
    promotePhrasing(file, "project.widget.perf", risky);
    assert.equal(loadProfile(file).entries["project.widget.perf"].phrasings.at(-1), risky);
  });

  it("is a no-op when the wording is already a phrasing", () => {
    const before = fs.readFileSync(file, "utf8");
    const result = promotePhrasing(file, "role.acme.apis", "Built HTTP services.");

    assert.equal(result.promoted, false);
    assert.equal(result.index, 1);
    assert.equal(fs.readFileSync(file, "utf8"), before);
  });

  it("trims surrounding whitespace before comparing and storing", () => {
    const result = promotePhrasing(file, "role.acme.apis", "  Built HTTP services.  ");
    assert.equal(result.promoted, false);
  });

  // Would otherwise splice a stray line into the document at the wrong indent.
  it("collapses embedded newlines rather than corrupting the file", () => {
    promotePhrasing(file, "project.widget.perf", "Cut latency,\n  and cut cost.");
    assert.equal(
      loadProfile(file).entries["project.widget.perf"].phrasings.at(-1),
      "Cut latency, and cut cost.",
    );
  });

  it("appends to an entry whose phrasings block is empty", () => {
    const raw = fs.readFileSync(file, "utf8").replace(
      /(  project\.widget\.perf:\n    kind: bullet\n    parent: project\.widget\n)    phrasings:\n      - Made it faster\.\n/,
      "$1    phrasings:\n",
    );
    assert.notEqual(raw, fs.readFileSync(file, "utf8"), "fixture edit did not apply");
    fs.writeFileSync(file, raw);

    promotePhrasing(file, "project.widget.perf", "First wording.");
    assert.deepEqual(loadProfile(file).entries["project.widget.perf"].phrasings, ["First wording."]);
  });

  it("rejects an unknown entry without touching the file", () => {
    const before = fs.readFileSync(file, "utf8");
    throwsWith(assert, () => promotePhrasing(file, "role.ghost", "x"), 'No entry "role.ghost"');
    assert.equal(fs.readFileSync(file, "utf8"), before);
  });

  it("rejects empty wording", () => {
    throwsWith(assert, () => promotePhrasing(file, "role.acme.apis", "   "), "needs text");
  });

  it("survives being called repeatedly on the same entry", () => {
    promotePhrasing(file, "role.acme.apis", "First addition.");
    promotePhrasing(file, "role.acme.apis", "Second addition.");
    promotePhrasing(file, "project.widget", "Rust");

    const entries = loadProfile(file).entries;
    assert.deepEqual(entries["role.acme.apis"].phrasings.slice(-2), [
      "First addition.",
      "Second addition.",
    ]);
    assert.deepEqual(entries["project.widget"].phrasings, ["Python", "TypeScript", "Rust"]);
  });
});
