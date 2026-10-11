import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveSelection, UNSOURCEABLE_KINDS } from "../src/index.js";
import { profile, throwsWith } from "./helpers.js";

const sourced = [
  { id: "headline", text: "Backend Engineer" },
  { id: "summary", text: "Builds backend systems." },
  { id: "role.acme", text: "Senior Engineer | Acme" },
  { id: "role.acme.apis", text: "Designed REST APIs." },
];

describe("resolveSelection", () => {
  it("uses the text it is given, not the entry's phrasing", () => {
    const r = resolveSelection(profile(), [
      ...sourced.slice(0, 3),
      { id: "role.acme.apis", text: "Wrote the HTTP layer end to end." },
    ]);
    assert.deepEqual(r.experiences[0].bullets, ["Wrote the HTTP layer end to end."]);
  });

  it("keeps list order as render order", () => {
    const p = profile();
    const r = resolveSelection(p, [
      ...sourced,
      { id: "role.acme.ui", text: "Built React components." },
    ]);
    assert.deepEqual(r.experiences[0].bullets, ["Designed REST APIs.", "Built React components."]);
  });

  it("attaches bullets to whichever parent was opened before them", () => {
    const r = resolveSelection(profile(), [
      ...sourced,
      { id: "project.widget", text: "Python" },
      { id: "project.widget.perf", text: "Made it faster." },
    ]);
    assert.deepEqual(r.experiences[0].bullets, ["Designed REST APIs."]);
    assert.deepEqual(r.projects[0].bullets, ["Made it faster."]);
  });

  describe("unsourced items", () => {
    it("are allowed for bullets, carrying an explicit kind and parent", () => {
      const r = resolveSelection(profile(), [
        ...sourced,
        { id: null, kind: "bullet", parent: "role.acme", text: "Ran the cluster." },
      ]);
      assert.deepEqual(r.experiences[0].bullets, ["Designed REST APIs.", "Ran the cluster."]);
    });

    it("are allowed for a headline", () => {
      const r = resolveSelection(profile(), [
        { id: null, kind: "headline", text: "Platform Engineer" },
      ]);
      assert.equal(r.title, "Platform Engineer");
    });

    it("must state a kind, since there is no entry to infer it from", () => {
      throwsWith(
        assert,
        () => resolveSelection(profile(), [{ id: null, text: "Mystery." }]),
        "must state its kind",
      );
    });

    // The point of the whole design: rewording a bullet is a judgement call,
    // inventing an employer is not.
    for (const kind of ["role", "project", "skill", "certificate"]) {
      it(`can never be a ${kind}`, () => {
        throwsWith(
          assert,
          () => resolveSelection(profile(), [{ id: null, kind, text: "Invented" }]),
          "cannot be unsourced",
        );
      });
    }

    it("only permits the three kinds it advertises", () => {
      assert.deepEqual(UNSOURCEABLE_KINDS, ["bullet", "headline", "summary"]);
    });
  });

  it("rejects empty text", () => {
    throwsWith(assert, () => resolveSelection(profile(), [{ id: "headline", text: "" }]), "no text");
  });

  it("rejects missing text", () => {
    throwsWith(assert, () => resolveSelection(profile(), [{ id: "headline" }]), "no text");
  });

  it("labels errors with the caller's context", () => {
    throwsWith(
      assert,
      () => resolveSelection(profile(), [{ id: "nope", text: "x" }], 'application "acme"'),
      'application "acme" item 1',
    );
  });
});
