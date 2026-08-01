// src/build.js — render Presets and Applications to documents.
//
// This is pure data transformation: no language model is involved, so it works
// offline, in CI, and without an agent. Tailoring against a Job Description is
// a separate, additive capability.

import fs from "fs";
import path from "path";
import { loadProfile, listPresets, resolvePreset } from "./profile.js";
import { validateResume } from "./validate.js";
import { MarkdownRenderer } from "./renderers/markdown.js";
import { DocxRenderer } from "./renderers/docx.js";
import { docxToPdf, isPdfAvailable } from "./pdf.js";
import {
  applicationDir,
  checkApplication,
  loadApplication,
  resolveApplication,
} from "./application.js";

export const FORMATS = ["md", "docx", "pdf"];

const UNSOURCED_MARK = "⚠ UNSOURCED — ";

function assertFormats(formats) {
  const unknown = formats.filter((f) => !FORMATS.includes(f));
  if (unknown.length > 0) {
    throw new Error(`Unknown format(s): ${unknown.join(", ")}. Known: ${FORMATS.join(", ")}`);
  }
  if (formats.includes("pdf") && !isPdfAvailable()) {
    throw new Error("PDF output needs LibreOffice: install it and ensure `soffice` is on PATH.");
  }
}

async function writeDocuments(data, dir, basename, formats, { markUnsourced = [] } = {}) {
  const wantDocx = formats.includes("docx");
  const wantPdf = formats.includes("pdf");

  fs.mkdirSync(dir, { recursive: true });
  const base = path.join(dir, basename);
  const written = [];

  if (formats.includes("md")) {
    let md = new MarkdownRenderer().render(data);
    // Markdown is the preview: unsourced bullets are marked here so you read
    // them the way a reviewer would. DOCX and PDF are what you actually send,
    // and are never marked.
    for (const text of markUnsourced) {
      md = md.split(`- ${text}`).join(`- ${UNSOURCED_MARK}${text}`);
    }
    fs.writeFileSync(`${base}.md`, md);
    written.push(`${base}.md`);
  }

  if (wantDocx || wantPdf) {
    fs.writeFileSync(`${base}.docx`, await new DocxRenderer().render(data));
    if (wantDocx) written.push(`${base}.docx`);
  }

  if (wantPdf) {
    written.push(docxToPdf(`${base}.docx`, dir));
    if (!wantDocx) fs.rmSync(`${base}.docx`, { force: true });
  }

  return written;
}

export async function buildPresets({
  profilePath,
  outDir,
  presets = [],
  formats = FORMATS,
  basename = "resume",
}) {
  assertFormats(formats);

  const profile = loadProfile(profilePath);
  const available = listPresets(profile);

  const unknown = presets.filter((p) => !available.includes(p));
  if (unknown.length > 0) {
    throw new Error(`Unknown preset(s): ${unknown.join(", ")}. Available: ${available.join(", ")}`);
  }
  const selected = presets.length > 0 ? presets : available;

  const results = [];
  for (const name of selected) {
    const data = resolvePreset(profile, name);

    const { valid, errors } = validateResume(data);
    if (!valid) throw new Error(`Preset "${name}" is incomplete:\n  - ${errors.join("\n  - ")}`);

    results.push({
      preset: name,
      files: await writeDocuments(data, path.join(outDir, name), basename, formats),
    });
  }
  return results;
}

export async function buildApplication({
  profilePath,
  applicationsDir,
  id,
  outDir,
  formats = FORMATS,
  basename = "resume",
}) {
  assertFormats(formats);

  const profile = loadProfile(profilePath);
  const application = loadApplication(applicationsDir, id);

  // The accounting has to pass before anything is rendered. Gaps do not block —
  // they are a finding about the candidate — but a mode violation or a citation
  // of an entry that is not on the resume is a defect in the record itself.
  const report = checkApplication(profile, application);
  if (!report.ok) {
    throw new Error(`Application "${id}" does not check out:\n  - ${report.errors.join("\n  - ")}`);
  }

  const data = resolveApplication(profile, application);
  const { valid, errors } = validateResume(data);
  if (!valid) throw new Error(`Application "${id}" is incomplete:\n  - ${errors.join("\n  - ")}`);

  const files = await writeDocuments(
    data,
    outDir ?? applicationDir(applicationsDir, id),
    basename,
    formats,
    { markUnsourced: report.unsourced.map((u) => u.text) },
  );

  return { application: id, files, report };
}
