// The renderers had no tests. That is how a literal "Tech: undefined" under
// every project reached a published resume — the field is optional, the DOCX
// renderer guarded it, and the Markdown renderer guarded it for the role but
// not for projects.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MarkdownRenderer, DocxRenderer, resolvePreset } from "../src/index.js";
import { profile } from "./helpers.js";

const render = (data) => new MarkdownRenderer().render(data);
const base = () => resolvePreset(profile(), "backend");

describe("MarkdownRenderer", () => {
  it("never renders the string undefined", () => {
    assert.doesNotMatch(render(base()), /undefined/);
  });

  it("omits a project's tech line when there is no tech", () => {
    const data = base();
    assert.ok(data.projects.length > 0, "fixture has no projects");
    assert.ok(data.projects.every((p) => p.tech === undefined), "fixture unexpectedly sets tech");
    assert.doesNotMatch(render(data), /Tech:/);
  });

  it("renders a project's tech line when there is one", () => {
    const data = base();
    data.projects[0].tech = "Python, FastAPI";
    assert.match(render(data), /\*Tech: Python, FastAPI\*/);
  });

  it("omits the role's tech line when there is none, and renders it when present", () => {
    const data = base();
    assert.doesNotMatch(render(data), /\*\*Tech:\*\*/);

    data.experience.tech = "Django, Postgres";
    assert.match(render(data), /\*\*Tech:\*\* Django, Postgres/);
  });

  it("renders the parts a resume cannot do without", () => {
    const md = render(base());
    assert.match(md, /^# Test Person/m);
    assert.match(md, /^## Backend Engineer/m);
    assert.match(md, /Designed REST APIs\./);
    assert.match(md, /\*\*Languages:\*\* Python, SQL/);
    assert.match(md, /B\.S\. Computer Science/);
    assert.match(md, /Example Certification — Example Org \(2023\)/);
  });

  it("omits the certifications section entirely when there are none", () => {
    const data = base();
    data.certificates = [];
    assert.doesNotMatch(render(data), /## Certifications/);
  });
});

describe("DocxRenderer", () => {
  // The DOCX is the file that actually gets sent, so the same guarantee has to
  // hold there — it was already correct, and now it stays that way.
  it("never writes the string undefined into the document", async () => {
    const buffer = await new DocxRenderer().render(base());
    assert.equal(buffer.includes("undefined"), false);
  });

  it("produces a non-trivial docx", async () => {
    const buffer = await new DocxRenderer().render(base());
    assert.ok(buffer.length > 5000, `suspiciously small docx: ${buffer.length} bytes`);
    assert.equal(buffer.subarray(0, 2).toString(), "PK"); // zip magic
  });
});
