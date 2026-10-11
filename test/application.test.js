import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import {
  checkApplication,
  createApplication,
  listApplications,
  loadApplication,
  resolveApplication,
  saveApplication,
  DEFAULT_MODE,
} from "../src/index.js";
import { profile, tempDir, throwsWith } from "./helpers.js";

const SELECTION = [
  { id: "headline", text: "Backend Engineer" },
  { id: "summary", text: "Builds backend systems." },
  { id: "role.acme", text: "Senior Engineer | Acme" },
  { id: "role.acme.apis", text: "Designed REST APIs." },
  { id: "project.widget", text: "Python" },
  { id: "project.widget.perf", text: "Made it faster." },
  { id: "skill.languages", text: "Python, SQL" },
];

function application(overrides = {}) {
  return {
    ...createApplication({ id: "2026-01-01-acme", company: "Acme", mode: DEFAULT_MODE }),
    selection: SELECTION,
    ...overrides,
  };
}

describe("createApplication", () => {
  it("defaults to provenance mode", () => {
    assert.equal(createApplication({ id: "x" }).mode, "provenance");
  });

  it("requires an id", () => {
    throwsWith(assert, () => createApplication({}), "needs an id");
  });

  it("rejects an unknown mode", () => {
    throwsWith(assert, () => createApplication({ id: "x", mode: "yolo" }), "Unknown mode");
  });
});

describe("save and load", () => {
  it("round-trips, keeping the job description in its own file", () => {
    const root = tempDir("io");
    saveApplication(root, application(), { jd: "We need a backend engineer." });

    assert.ok(fs.existsSync(path.join(root, "2026-01-01-acme", "jd.md")));

    const loaded = loadApplication(root, "2026-01-01-acme");
    assert.equal(loaded.jd, "We need a backend engineer.");
    assert.equal(loaded.company, "Acme");
    assert.deepEqual(loaded.selection, SELECTION);

    // The jd is a file, not a field, so it must not leak into the record.
    const raw = JSON.parse(fs.readFileSync(path.join(root, "2026-01-01-acme", "application.json"), "utf8"));
    assert.equal(raw.jd, undefined);
  });

  it("reports a missing application by name", () => {
    throwsWith(assert, () => loadApplication(tempDir("io"), "ghost"), 'No application "ghost"');
  });

  it("lists what is there, and nothing when there is nothing", () => {
    const root = tempDir("list");
    assert.deepEqual(listApplications(root), []);

    saveApplication(root, application({ id: "b" }), { jd: "" });
    saveApplication(root, application({ id: "a" }), { jd: "" });
    assert.deepEqual(listApplications(root), ["a", "b"]);

    // A stray directory without a record is not an application.
    fs.mkdirSync(path.join(root, "notes"));
    assert.deepEqual(listApplications(root), ["a", "b"]);
  });

  it("treats a missing root as empty rather than an error", () => {
    assert.deepEqual(listApplications(path.join(tempDir("list"), "absent")), []);
  });
});

describe("checkApplication — tailoring modes", () => {
  const REWRITTEN = [...SELECTION.slice(0, 3), { id: "role.acme.apis", text: "Wrote the HTTP layer." }];
  const UNSOURCED = [
    ...SELECTION,
    { id: null, kind: "bullet", parent: "role.acme", text: "Ran the cluster." },
  ];

  it("selection mode accepts a verbatim phrasing", () => {
    assert.equal(checkApplication(profile(), application({ mode: "selection" })).ok, true);
  });

  it("selection mode rejects a rewrite", () => {
    const r = checkApplication(profile(), application({ mode: "selection", selection: REWRITTEN }));
    assert.equal(r.ok, false);
    assert.match(r.errors[0], /not one of its phrasings/);
  });

  it("provenance mode accepts a rewrite", () => {
    assert.equal(checkApplication(profile(), application({ selection: REWRITTEN })).ok, true);
  });

  it("provenance mode rejects unsourced text", () => {
    const r = checkApplication(profile(), application({ selection: UNSOURCED }));
    assert.equal(r.ok, false);
    assert.match(r.errors[0], /provenance mode does not allow/);
  });

  it("free mode accepts unsourced text, but still reports it", () => {
    const r = checkApplication(profile(), application({ mode: "free", selection: UNSOURCED }));
    assert.equal(r.ok, true);
    assert.deepEqual(r.unsourced, [{ index: 7, text: "Ran the cluster." }]);
  });

  it("free mode still refuses to fabricate a project", () => {
    const r = checkApplication(
      profile(),
      application({
        mode: "free",
        selection: [...SELECTION, { id: null, kind: "project", text: "Invented" }],
      }),
    );
    assert.equal(r.ok, false);
    assert.match(r.errors[0], /may never be unsourced/);
  });

  it("rejects an unknown mode", () => {
    const r = checkApplication(profile(), application({ mode: "yolo" }));
    assert.equal(r.ok, false);
    assert.match(r.errors[0], /Unknown mode/);
  });

  it("rejects a selected entry that is not in the profile", () => {
    const r = checkApplication(
      profile(),
      application({ selection: [...SELECTION, { id: "role.ghost", text: "x" }] }),
    );
    assert.equal(r.ok, false);
    assert.match(r.errors[0], /no entry "role.ghost"/);
  });
});

describe("checkApplication — requirement accounting", () => {
  it("counts a requirement with no coverage as a gap, not an error", () => {
    const r = checkApplication(
      profile(),
      application({
        requirements: [
          { id: "r1", text: "REST APIs", covers: ["role.acme.apis"] },
          { id: "r2", text: "Kubernetes", covers: [] },
        ],
      }),
    );
    assert.equal(r.ok, true);
    assert.equal(r.requirements, 2);
    assert.equal(r.covered, 1);
    assert.deepEqual(r.gaps.map((g) => g.text), ["Kubernetes"]);
  });

  it("treats a missing covers array as a gap", () => {
    const r = checkApplication(profile(), application({ requirements: [{ id: "r1", text: "Go" }] }));
    assert.deepEqual(r.gaps.map((g) => g.text), ["Go"]);
  });

  it("rejects a requirement citing an entry that does not exist", () => {
    const r = checkApplication(
      profile(),
      application({ requirements: [{ id: "r1", text: "Rust", covers: ["role.acme.rust"] }] }),
    );
    assert.equal(r.ok, false);
    assert.match(r.errors[0], /not in the profile/);
  });

  // Coverage by something the reader will never see is not coverage.
  it("rejects a requirement citing an entry the resume omits", () => {
    const r = checkApplication(
      profile(),
      application({ requirements: [{ id: "r1", text: "React", covers: ["role.acme.ui"] }] }),
    );
    assert.equal(r.ok, false);
    assert.match(r.errors[0], /does not include/);
  });

  describe("analysis phase", () => {
    // Gaps are meant to be read while the decision is still "should I apply?",
    // which is before any selection exists.
    const analysing = () =>
      application({
        selection: [],
        requirements: [
          { id: "r1", text: "React", covers: ["role.acme.ui"] },
          { id: "r2", text: "Kubernetes", covers: [] },
        ],
      });

    it("is reported as such when nothing has been selected yet", () => {
      assert.equal(checkApplication(profile(), analysing()).phase, "analysis");
      assert.equal(checkApplication(profile(), application()).phase, "tailored");
    });

    it("does not require cited entries to be on a resume that does not exist yet", () => {
      const r = checkApplication(profile(), analysing());
      assert.equal(r.ok, true);
      assert.deepEqual(r.gaps.map((g) => g.text), ["Kubernetes"]);
    });

    it("still rejects a cited entry that is not in the profile at all", () => {
      const r = checkApplication(
        profile(),
        application({ selection: [], requirements: [{ id: "r1", text: "Rust", covers: ["nope"] }] }),
      );
      assert.equal(r.ok, false);
      assert.match(r.errors[0], /not in the profile/);
    });
  });
});

describe("resolveApplication", () => {
  it("renders from the frozen text, ignoring what the profile now says", () => {
    const p = profile();
    const app = application({
      selection: [...SELECTION.slice(0, 3), { id: "role.acme.apis", text: "Frozen wording." }],
    });

    // The profile moves on; the archive must not.
    p.entries["role.acme.apis"].phrasings[0] = "Completely different now.";

    const r = resolveApplication(p, app);
    assert.equal(r.slug, "2026-01-01-acme");
    assert.deepEqual(r.experiences[0].bullets, ["Frozen wording."]);
  });
});
