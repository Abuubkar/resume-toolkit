import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import {
  createApplication,
  loadProfile,
  pickRate,
  promotePhrasing,
  saveApplication,
  stampSelection,
  summarise,
} from "../src/index.js";
import { FIXTURE_PROFILE, profile, tempDir } from "./helpers.js";

describe("stampSelection", () => {
  it("records which phrasing a reused bullet came from", () => {
    const stamped = stampSelection(profile(), [
      { id: "role.acme.apis", text: "Built HTTP services." },
    ]);
    assert.deepEqual(stamped[0], {
      id: "role.acme.apis",
      text: "Built HTTP services.",
      origin: "picked",
      phrasing: 1,
    });
  });

  it("marks anything not matching a phrasing as rewritten", () => {
    const stamped = stampSelection(profile(), [
      { id: "role.acme.apis", text: "Owned the HTTP layer end to end." },
    ]);
    assert.equal(stamped[0].origin, "rewritten");
    assert.equal(stamped[0].phrasing, undefined);
  });

  it("marks sourceless text as unsourced", () => {
    const stamped = stampSelection(profile(), [
      { id: null, kind: "bullet", parent: "role.acme", text: "Ran the cluster." },
    ]);
    assert.equal(stamped[0].origin, "unsourced");
  });

  it("does not mutate the selection it was given", () => {
    const original = [{ id: "role.acme.apis", text: "Built HTTP services." }];
    stampSelection(profile(), original);
    assert.deepEqual(original, [{ id: "role.acme.apis", text: "Built HTTP services." }]);
  });
});

describe("summarise", () => {
  it("counts each origin, and flags items carrying none", () => {
    assert.deepEqual(
      summarise([
        { origin: "picked" },
        { origin: "picked" },
        { origin: "rewritten" },
        { origin: "unsourced" },
        { id: "x", text: "hand-written, never stamped" },
      ]),
      { picked: 2, rewritten: 1, unsourced: 1, unstamped: 1 },
    );
  });
});

describe("pickRate", () => {
  function seed(root, id, selection) {
    saveApplication(root, { ...createApplication({ id }), selection }, { jd: "" });
  }

  it("reports null rather than zero when nothing is measurable", () => {
    const r = pickRate(tempDir("pick"));
    assert.equal(r.applications, 0);
    assert.equal(r.pickRate, null);
  });

  it("computes the ratio of reused to rewritten across applications", () => {
    const root = tempDir("pick");
    const p = profile();
    seed(root, "a", stampSelection(p, [
      { id: "role.acme.apis", text: "Designed REST APIs." },
      { id: "project.widget.perf", text: "Made it faster." },
    ]));
    seed(root, "b", stampSelection(p, [
      { id: "role.acme.apis", text: "Owned the HTTP layer." },
      { id: "project.widget.perf", text: "Halved p95." },
    ]));

    const r = pickRate(root);
    assert.equal(r.applications, 2);
    assert.equal(r.picked, 2);
    assert.equal(r.rewritten, 2);
    assert.equal(r.pickRate, 0.5);
  });

  it("excludes unsourced text from the ratio but still counts it", () => {
    const root = tempDir("pick");
    seed(root, "a", stampSelection(profile(), [
      { id: "role.acme.apis", text: "Designed REST APIs." },
      { id: null, kind: "bullet", parent: "role.acme", text: "Invented." },
    ]));

    const r = pickRate(root);
    assert.equal(r.unsourced, 1);
    assert.equal(r.pickRate, 1); // 1 picked / 1 measurable — the unsourced one is not a rewrite
  });

  it("reports unstamped items rather than silently implying full coverage", () => {
    const root = tempDir("pick");
    seed(root, "a", [{ id: "role.acme.apis", text: "Designed REST APIs." }]); // never stamped

    const r = pickRate(root);
    assert.equal(r.unstamped, 1);
    assert.equal(r.pickRate, null);
  });

  it("breaks the numbers down per application", () => {
    const root = tempDir("pick");
    seed(root, "a", stampSelection(profile(), [{ id: "role.acme.apis", text: "Designed REST APIs." }]));
    seed(root, "b", stampSelection(profile(), [{ id: "role.acme.apis", text: "Something new." }]));

    assert.deepEqual(
      pickRate(root).perApplication.map((x) => [x.application, x.picked, x.rewritten]),
      [["a", 1, 0], ["b", 0, 1]],
    );
  });

  // The reason origins are stamped at save time instead of recomputed. Write-back
  // feeds approved rewrites into the profile, so a recomputed rate would climb
  // toward 100% purely because the library absorbed its own output.
  it("does not drift when the rewrite is later promoted into the profile", () => {
    const dir = tempDir("drift");
    const profilePath = path.join(dir, "profile.yaml");
    fs.copyFileSync(FIXTURE_PROFILE, profilePath);

    const root = tempDir("drift-apps");
    const rewrite = "Owned the public HTTP surface end to end.";
    seed(root, "a", stampSelection(loadProfile(profilePath), [
      { id: "role.acme.apis", text: rewrite },
    ]));
    assert.equal(pickRate(root).pickRate, 0);

    // The candidate approves it; it becomes a phrasing.
    promotePhrasing(profilePath, "role.acme.apis", rewrite);
    assert.ok(loadProfile(profilePath).entries["role.acme.apis"].phrasings.includes(rewrite));

    // The historical measurement is unchanged — that bullet was still written,
    // not picked, on the day it was sent.
    assert.equal(pickRate(root).pickRate, 0);
  });
});
