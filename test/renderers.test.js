// The renderers had no tests. That is how a literal "Tech: undefined" under
// every project reached a published resume — the field is optional, the DOCX
// renderer guarded it, and the Markdown renderer guarded it for the role but
// not for projects.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { MarkdownRenderer, DocxRenderer, resolvePreset } from "../src/index.js";
import { profile } from "./helpers.js";

// A .docx is a zip; its text lives in word/document.xml.
const documentXml = async (buffer) =>
  (await JSZip.loadAsync(buffer)).file("word/document.xml").async("string");

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

    data.experiences[0].tech = "Django, Postgres";
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

  // 0.5.0 made experience a list. A contractor holding two jobs at once is the
  // case that forced it, so both have to reach the page, in order, with their
  // own bullets under each.
  it("renders every role, in order, each with its own bullets", () => {
    const data = base();
    data.experiences.push({
      title: "Senior Software Engineer | Codeupnow",
      date: "Sept 2025 – Present",
      bullets: ["Delivered a client platform."],
    });

    const md = render(data);
    assert.match(md, /^### Senior Engineer \| Acme/m);
    assert.match(md, /^### Senior Software Engineer \| Codeupnow/m);
    assert.match(md, /^\*Sept 2025 – Present\*/m);
    assert.match(md, /- Delivered a client platform\./);

    // Order on the page follows selection order, not the other way round.
    assert.ok(
      md.indexOf("### Senior Engineer | Acme") < md.indexOf("### Senior Software Engineer"),
      "roles rendered out of order",
    );
  });

  it("renders a single role exactly as it did before the list change", () => {
    const md = render(base());
    const experience = md.slice(md.indexOf("## Experience"), md.indexOf("## Selected Projects"));
    // One role, one heading, and no blank-line drift from looping.
    assert.equal((experience.match(/^### /gm) || []).length, 1);
    assert.doesNotMatch(experience, /\n\n\n/);
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

  it("writes every role into the document, not just the first", async () => {
    const data = base();
    data.experiences.push({
      title: "Senior Software Engineer | Codeupnow",
      date: "Sept 2025 – Present",
      bullets: ["Delivered a client platform."],
    });

    // Read the real document text. Comparing byte length instead looks like a
    // test and is not one: a docx is a zip carrying timestamps, so its size
    // moves on its own and a dropped role can still come out "bigger".
    const xml = await documentXml(await new DocxRenderer().render(data));
    assert.match(xml, /Senior Engineer \| Acme/);
    assert.match(xml, /Senior Software Engineer \| Codeupnow/);
    assert.match(xml, /Sept 2025 – Present/);
    assert.match(xml, /Delivered a client platform\./);
    assert.ok(
      xml.indexOf("Senior Engineer | Acme") < xml.indexOf("Senior Software Engineer"),
      "roles written out of order",
    );
  });

  it("produces a non-trivial docx", async () => {
    const buffer = await new DocxRenderer().render(base());
    assert.ok(buffer.length > 5000, `suspiciously small docx: ${buffer.length} bytes`);
    assert.equal(buffer.subarray(0, 2).toString(), "PK"); // zip magic
  });
});
