import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { listPresets, parsePick, resolvePreset } from "../src/index.js";
import { profile, throwsWith } from "./helpers.js";

describe("parsePick", () => {
  it("defaults to phrasing 0", () => {
    assert.deepEqual(parsePick("role.acme"), { id: "role.acme", index: 0 });
  });

  it("reads an explicit phrasing index", () => {
    assert.deepEqual(parsePick("role.acme@2"), { id: "role.acme", index: 2 });
  });

  it("splits on the last @, so ids may contain one", () => {
    assert.deepEqual(parsePick("a@b@1"), { id: "a@b", index: 1 });
  });
});

describe("listPresets", () => {
  it("returns them in declaration order", () => {
    assert.deepEqual(listPresets(profile()), ["backend", "frontend"]);
  });

  it("copes with a profile that has none", () => {
    assert.deepEqual(listPresets({}), []);
  });
});

describe("resolvePreset", () => {
  it("resolves into the shape the renderers consume", () => {
    const r = resolvePreset(profile(), "backend");

    assert.equal(r.slug, "backend");
    assert.equal(r.title, "Backend Engineer");
    assert.equal(r.summary, "Builds backend systems.");
    assert.equal(r.CONTACT.name, "Test Person");
    assert.equal(r.EDUCATION.degree, "B.S. Computer Science");

    assert.deepEqual(r.experiences, [
      {
        title: "Senior Engineer | Acme",
        date: "2020 – 2024",
        bullets: ["Designed REST APIs."],
      },
    ]);

    assert.deepEqual(r.projects, [
      { name: "Widget", meta: "Python", bullets: ["Made it faster."] },
    ]);

    assert.deepEqual(r.skills, [["Languages", "Python, SQL"]]);
    assert.deepEqual(r.certificates, [
      { name: "Example Certification", issuer: "Example Org", date: "2023" },
    ]);
  });

  it("picks the phrasing the @n asked for", () => {
    const r = resolvePreset(profile(), "frontend");

    assert.equal(r.title, "Frontend Engineer");
    assert.equal(r.experiences[0].title, "Engineer | Acme");
    assert.deepEqual(r.skills, [["Languages", "TypeScript, CSS"]]);
    // A project's structural name is shared; only its meta line is a phrasing.
    assert.equal(r.projects[0].name, "Widget");
    assert.equal(r.projects[0].meta, "TypeScript");
  });

  it("rejects an unknown preset", () => {
    throwsWith(assert, () => resolvePreset(profile(), "nope"), 'Unknown preset "nope"');
  });

  it("rejects an entry that is not in the profile", () => {
    const p = profile();
    p.presets.broken = ["role.nonexistent"];
    throwsWith(assert, () => resolvePreset(p, "broken"), "no entry");
  });

  it("rejects a phrasing index past the end, and says how many exist", () => {
    const p = profile();
    p.presets.broken = ["headline@9"];
    throwsWith(assert, () => resolvePreset(p, "broken"), "has 2 phrasing");
  });

  it("rejects a bullet listed before its parent", () => {
    const p = profile();
    p.presets.broken = ["headline", "summary", "role.acme.apis", "role.acme"];
    throwsWith(assert, () => resolvePreset(p, "broken"), "must be selected before its bullets");
  });

  // Until 0.5.0 a second role threw: the renderers laid out exactly one. A
  // contractor can hold two jobs at once, so they now render in list order.
  it("accepts a second role and keeps both, in list order", () => {
    const p = profile();
    p.entries["role.other"] = { kind: "role", date: "2019", phrasings: ["Engineer | Other"] };
    p.entries["role.other.thing"] = {
      kind: "bullet",
      parent: "role.other",
      phrasings: ["Did the thing."],
    };
    p.presets.two = ["role.acme", "role.acme.apis", "role.other", "role.other.thing"];

    const r = resolvePreset(p, "two");
    assert.deepEqual(
      r.experiences.map((e) => e.title),
      ["Senior Engineer | Acme", "Engineer | Other"],
    );
    assert.deepEqual(r.experiences[1].bullets, ["Did the thing."]);
  });

  it("attaches each role's bullets to that role, not to the last one opened", () => {
    const p = profile();
    p.entries["role.other"] = { kind: "role", date: "2019", phrasings: ["Engineer | Other"] };
    p.entries["role.other.thing"] = {
      kind: "bullet",
      parent: "role.other",
      phrasings: ["Did the thing."],
    };
    p.presets.two = ["role.acme", "role.other", "role.other.thing", "role.acme.apis"];

    const r = resolvePreset(p, "two");
    assert.deepEqual(r.experiences[0].bullets, ["Designed REST APIs."]);
    assert.deepEqual(r.experiences[1].bullets, ["Did the thing."]);
  });

  it("rejects an unrecognised kind", () => {
    const p = profile();
    p.entries["weird"] = { kind: "hobby", phrasings: ["Chess"] };
    p.presets.broken = ["weird"];
    throwsWith(assert, () => resolvePreset(p, "broken"), "unrecognised kind");
  });
});
