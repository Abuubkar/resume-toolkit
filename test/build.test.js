import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import {
  buildApplication,
  buildPresets,
  createApplication,
  isPdfAvailable,
  saveApplication,
} from "../src/index.js";
import { FIXTURE_PROFILE, tempDir } from "./helpers.js";

// PDF needs LibreOffice, which is a system dependency the suite should not
// require. Those cases skip rather than fail when it is absent.
const noPdf = !isPdfAvailable();

const SELECTION = [
  { id: "headline", text: "Backend Engineer" },
  { id: "summary", text: "Builds backend systems." },
  { id: "role.acme", text: "Senior Engineer | Acme" },
  { id: "role.acme.apis", text: "Designed REST APIs." },
  { id: "project.widget", text: "Python" },
  { id: "project.widget.perf", text: "Made it faster." },
  { id: "skill.languages", text: "Python, SQL" },
];

const ls = (dir) => fs.readdirSync(dir).sort();

describe("buildPresets", () => {
  it("writes one directory per preset", async () => {
    const out = tempDir("build");
    const results = await buildPresets({
      profilePath: FIXTURE_PROFILE,
      outDir: out,
      formats: ["md"],
    });

    assert.deepEqual(results.map((r) => r.preset), ["backend", "frontend"]);
    assert.deepEqual(ls(out), ["backend", "frontend"]);
    assert.deepEqual(ls(path.join(out, "backend")), ["resume.md"]);
  });

  it("builds only the presets asked for", async () => {
    const out = tempDir("build");
    await buildPresets({
      profilePath: FIXTURE_PROFILE,
      outDir: out,
      presets: ["frontend"],
      formats: ["md"],
    });
    assert.deepEqual(ls(out), ["frontend"]);
  });

  it("honours basename", async () => {
    const out = tempDir("build");
    await buildPresets({
      profilePath: FIXTURE_PROFILE,
      outDir: out,
      formats: ["md"],
      basename: "cv",
    });
    assert.deepEqual(ls(path.join(out, "backend")), ["cv.md"]);
  });

  it("writes md and docx when both are asked for", async () => {
    const out = tempDir("build");
    await buildPresets({
      profilePath: FIXTURE_PROFILE,
      outDir: out,
      presets: ["backend"],
      formats: ["md", "docx"],
    });
    assert.deepEqual(ls(path.join(out, "backend")), ["resume.docx", "resume.md"]);
  });

  it("rejects an unknown preset, listing the real ones", async () => {
    await assert.rejects(
      buildPresets({ profilePath: FIXTURE_PROFILE, outDir: tempDir("build"), presets: ["nope"] }),
      /Unknown preset\(s\): nope.*backend, frontend/s,
    );
  });

  it("rejects an unknown format", async () => {
    await assert.rejects(
      buildPresets({ profilePath: FIXTURE_PROFILE, outDir: tempDir("build"), formats: ["xml"] }),
      /Unknown format\(s\): xml/,
    );
  });

  it("cleans up the intermediate docx when only pdf was asked for", { skip: noPdf }, async () => {
    const out = tempDir("build");
    await buildPresets({
      profilePath: FIXTURE_PROFILE,
      outDir: out,
      presets: ["backend"],
      formats: ["pdf"],
    });
    assert.deepEqual(ls(path.join(out, "backend")), ["resume.pdf"]);
  });
});

describe("buildApplication", () => {
  function seed(root, overrides = {}) {
    const app = {
      ...createApplication({ id: "2026-01-01-acme" }),
      selection: SELECTION,
      ...overrides,
    };
    saveApplication(root, app, { jd: "We need a backend engineer." });
    return root;
  }

  it("renders into the application's own directory, keeping the archive together", async () => {
    const root = seed(tempDir("apps"));
    const { files } = await buildApplication({
      profilePath: FIXTURE_PROFILE,
      applicationsDir: root,
      id: "2026-01-01-acme",
      formats: ["md"],
    });

    assert.equal(files.length, 1);
    assert.deepEqual(ls(path.join(root, "2026-01-01-acme")), [
      "application.json",
      "jd.md",
      "resume.md",
    ]);
  });

  it("refuses to render an application that does not check out", async () => {
    const root = seed(tempDir("apps"), {
      requirements: [{ id: "r1", text: "React", covers: ["role.acme.ui"] }],
    });
    await assert.rejects(
      buildApplication({
        profilePath: FIXTURE_PROFILE,
        applicationsDir: root,
        id: "2026-01-01-acme",
        formats: ["md"],
      }),
      /does not check out/,
    );
  });

  it("renders despite gaps — a gap is a finding, not a defect", async () => {
    const root = seed(tempDir("apps"), {
      requirements: [{ id: "r1", text: "Kubernetes", covers: [] }],
    });
    const { report, files } = await buildApplication({
      profilePath: FIXTURE_PROFILE,
      applicationsDir: root,
      id: "2026-01-01-acme",
      formats: ["md"],
    });

    assert.equal(files.length, 1);
    assert.deepEqual(report.gaps.map((g) => g.text), ["Kubernetes"]);
  });

  it("marks unsourced text in the markdown but not in the docx", { skip: noPdf }, async () => {
    const root = seed(tempDir("apps"), {
      mode: "free",
      selection: [
        ...SELECTION,
        { id: null, kind: "bullet", parent: "role.acme", text: "Ran the cluster." },
      ],
    });
    await buildApplication({
      profilePath: FIXTURE_PROFILE,
      applicationsDir: root,
      id: "2026-01-01-acme",
      formats: ["md", "docx"],
    });

    const dir = path.join(root, "2026-01-01-acme");
    const md = fs.readFileSync(path.join(dir, "resume.md"), "utf8");
    const docx = fs.readFileSync(path.join(dir, "resume.docx"));

    assert.match(md, /UNSOURCED — Ran the cluster\./);
    // The DOCX is what actually gets sent, so it must carry the text unmarked.
    assert.equal(docx.includes("UNSOURCED"), false);
  });

  it("writes an --out directory when one is given", async () => {
    const root = seed(tempDir("apps"));
    const out = tempDir("out");
    await buildApplication({
      profilePath: FIXTURE_PROFILE,
      applicationsDir: root,
      id: "2026-01-01-acme",
      outDir: out,
      formats: ["md"],
    });
    assert.deepEqual(ls(out), ["resume.md"]);
  });
});
