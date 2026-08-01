// Drives the server the way an agent actually does: spawned as a subprocess,
// over a real stdio MCP handshake. Calling the handlers in-process would prove
// the functions work while leaving the thing that breaks in practice — schemas,
// transport, tool registration — untested.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { FIXTURE_PROFILE, tempDir } from "./helpers.js";

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "mcp.js");

const SELECTION = [
  { id: "headline", text: "Backend Engineer" },
  { id: "summary", text: "Builds backend systems." },
  { id: "role.acme", text: "Senior Engineer | Acme" },
  { id: "role.acme.apis", text: "Designed REST APIs." },
  { id: "project.widget", text: "Python" },
  { id: "project.widget.perf", text: "Made it faster." },
  { id: "skill.languages", text: "Python, SQL" },
];

describe("MCP server", () => {
  let client;
  let transport;
  let applicationsDir;

  // One connected server for the whole suite; the tools are stateful by design
  // (an application is built up across calls), so the tests run in order.
  let profilePath;

  before(async () => {
    applicationsDir = tempDir("mcp-apps");
    // promote_phrasing edits the profile, so the server gets a scratch copy
    // rather than the shared fixture.
    profilePath = path.join(tempDir("mcp-profile"), "profile.yaml");
    fs.copyFileSync(FIXTURE_PROFILE, profilePath);

    transport = new StdioClientTransport({
      command: process.execPath,
      args: [SERVER],
      env: {
        PATH: process.env.PATH,
        RESUME_PROFILE: profilePath,
        RESUME_APPLICATIONS: applicationsDir,
      },
    });
    client = new Client({ name: "test", version: "0" });
    await client.connect(transport);
  });

  after(async () => {
    await client?.close();
  });

  // Reads the JSON payload back out of an MCP tool result.
  const call = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    return { isError: result.isError ?? false, data: JSON.parse(result.content[0].text) };
  };

  const callRaw = (name, args = {}) => client.callTool({ name, arguments: args });

  it("advertises every tool the workflow needs", async () => {
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((t) => t.name).sort(),
      [
        "aggregate_gaps",
        "check_application",
        "create_application",
        "list_applications",
        "pick_rate",
        "promote_phrasing",
        "read_application",
        "read_profile",
        "render_application",
        "render_preset",
        "set_requirements",
        "set_selection",
      ],
    );
    for (const tool of tools) {
      assert.ok(tool.description, `${tool.name} has no description`);
    }
  });

  it("read_profile returns the raw material to tailor from", async () => {
    const { data } = await call("read_profile");
    assert.deepEqual(data.presets, ["backend", "frontend"]);
    assert.equal(data.contact.name, "Test Person");
    assert.deepEqual(data.entries["role.acme.apis"].phrasings, [
      "Designed REST APIs.",
      "Built HTTP services.",
    ]);
  });

  it("starts empty", async () => {
    const { data } = await call("list_applications");
    assert.deepEqual(data.applications, []);
  });

  it("create_application stores the posting and points at analysis", async () => {
    const { data } = await call("create_application", {
      id: "2026-01-01-acme",
      jd: "Senior Backend Engineer. REST APIs, Python, Kubernetes.",
      company: "Acme",
    });

    assert.equal(data.next, "set_requirements");
    const dir = path.join(applicationsDir, "2026-01-01-acme");
    assert.equal(fs.readFileSync(path.join(dir, "jd.md"), "utf8"), "Senior Backend Engineer. REST APIs, Python, Kubernetes.");
    // The date is derived from the id rather than a clock the caller can't control.
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "application.json"), "utf8")).createdAt, "2026-01-01");
  });

  it("refuses to overwrite an existing application", async () => {
    const result = await callRaw("create_application", { id: "2026-01-01-acme", jd: "different" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /already exists/);
  });

  it("set_requirements reports gaps before any resume exists", async () => {
    const { data } = await call("set_requirements", {
      id: "2026-01-01-acme",
      requirements: [
        { id: "r1", text: "REST APIs", tag: "REST", covers: ["role.acme.apis"] },
        { id: "r2", text: "Kubernetes in production", tag: "Kubernetes", covers: [] },
      ],
    });

    assert.equal(data.phase, "analysis");
    assert.equal(data.ok, true);
    assert.equal(data.covered, 1);
    assert.deepEqual(data.gaps.map((g) => g.text), ["Kubernetes in production"]);
    assert.match(data.next, /before tailoring/);
  });

  it("set_selection stores a clean selection", async () => {
    const { data } = await call("set_selection", { id: "2026-01-01-acme", selection: SELECTION });
    assert.equal(data.saved, true);
    assert.equal(data.phase, "tailored");
    assert.equal(data.next, "render_application");
  });

  it("set_selection refuses to persist an unsourced bullet in provenance mode", async () => {
    const { data } = await call("set_selection", {
      id: "2026-01-01-acme",
      selection: [
        ...SELECTION,
        { id: null, kind: "bullet", parent: "role.acme", text: "Ran a Kubernetes cluster." },
      ],
    });

    assert.equal(data.saved, false);
    assert.match(data.errors[0], /provenance mode does not allow/);

    // And the stored record is untouched — the rejected text never lands on disk.
    const { data: stored } = await call("read_application", { id: "2026-01-01-acme" });
    assert.equal(stored.selection.length, SELECTION.length);
  });

  it("render_application writes into the application's own directory", async () => {
    const { data } = await call("render_application", {
      id: "2026-01-01-acme",
      formats: ["md"],
    });

    assert.equal(data.files.length, 1);
    assert.deepEqual(data.report.gaps.map((g) => g.tag), ["Kubernetes"]);

    const md = fs.readFileSync(path.join(applicationsDir, "2026-01-01-acme", "resume.md"), "utf8");
    assert.match(md, /Designed REST APIs\./);
  });

  it("aggregate_gaps groups the same lack across applications by tag", async () => {
    await call("create_application", { id: "2026-02-01-globex", jd: "K8s shop." });
    await call("set_requirements", {
      id: "2026-02-01-globex",
      requirements: [{ id: "r1", text: "K8s experience", tag: "Kubernetes", covers: [] }],
    });

    const { data } = await call("aggregate_gaps");
    assert.equal(data.total, 2);
    assert.equal(data.gaps[0].label, "Kubernetes");
    assert.equal(data.gaps[0].count, 2);
  });

  it("set_selection stamps how each bullet came about", async () => {
    const { data } = await call("read_application", { id: "2026-01-01-acme" });
    assert.deepEqual(
      data.selection.map((i) => i.origin),
      Array(SELECTION.length).fill("picked"),
    );
    assert.equal(data.selection.find((i) => i.id === "role.acme.apis").phrasing, 0);
  });

  it("pick_rate reports the evidence for the Phrasing bet", async () => {
    const { data } = await call("pick_rate");
    assert.equal(data.picked, SELECTION.length);
    assert.equal(data.rewritten, 0);
    assert.equal(data.pickRate, 1);
  });

  it("a rewrite is flagged, and promote_phrasing grows the library", async () => {
    const rewrite = "Owned the public HTTP surface end to end.";
    const { data: saved } = await call("set_selection", {
      id: "2026-01-01-acme",
      selection: SELECTION.map((i) =>
        i.id === "role.acme.apis" ? { ...i, text: rewrite } : i,
      ),
    });
    assert.equal(saved.origins.rewritten, 1);
    assert.match(saved.next, /promote_phrasing/);

    const { data: promoted } = await call("promote_phrasing", {
      entry: "role.acme.apis",
      text: rewrite,
    });
    assert.equal(promoted.promoted, true);

    // The profile grew...
    const { data: p } = await call("read_profile");
    assert.ok(p.entries["role.acme.apis"].phrasings.includes(rewrite));

    // ...but the historical measurement did not drift.
    const { data: rate } = await call("pick_rate");
    assert.equal(rate.rewritten, 1);
  });

  it("promote_phrasing reports an unknown entry as a tool error", async () => {
    const result = await callRaw("promote_phrasing", { entry: "role.ghost", text: "x" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /No entry "role.ghost"/);
  });

  it("surfaces a bad id as a tool error rather than dying", async () => {
    const result = await callRaw("check_application", { id: "does-not-exist" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /No application "does-not-exist"/);

    // Still usable afterwards.
    const { data } = await call("list_applications");
    assert.equal(data.applications.length, 2);
  });
});
