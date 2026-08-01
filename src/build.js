// src/build.js — resolve Presets from a Master Profile and write documents.
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

export const FORMATS = ["md", "docx", "pdf"];

export async function buildPresets({
  profilePath,
  outDir,
  presets = [],
  formats = FORMATS,
  basename = "resume",
}) {
  const unknownFormats = formats.filter((f) => !FORMATS.includes(f));
  if (unknownFormats.length > 0) {
    throw new Error(
      `Unknown format(s): ${unknownFormats.join(", ")}. Known: ${FORMATS.join(", ")}`,
    );
  }

  const profile = loadProfile(profilePath);
  const available = listPresets(profile);

  const unknown = presets.filter((p) => !available.includes(p));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown preset(s): ${unknown.join(", ")}. Available: ${available.join(", ")}`,
    );
  }
  const selected = presets.length > 0 ? presets : available;

  const wantPdf = formats.includes("pdf");
  const wantDocx = formats.includes("docx");
  if (wantPdf && !isPdfAvailable()) {
    throw new Error(
      "PDF output needs LibreOffice: install it and ensure `soffice` is on PATH.",
    );
  }

  const markdown = new MarkdownRenderer();
  const docx = new DocxRenderer();
  const results = [];

  for (const name of selected) {
    const data = resolvePreset(profile, name);

    const { valid, errors } = validateResume(data);
    if (!valid) {
      throw new Error(`Preset "${name}" is incomplete:\n  - ${errors.join("\n  - ")}`);
    }

    const dir = path.join(outDir, name);
    fs.mkdirSync(dir, { recursive: true });
    const base = path.join(dir, basename);
    const written = [];

    if (formats.includes("md")) {
      fs.writeFileSync(`${base}.md`, markdown.render(data));
      written.push(`${base}.md`);
    }

    // PDF is produced by converting the DOCX, so it is built either way.
    if (wantDocx || wantPdf) {
      fs.writeFileSync(`${base}.docx`, await docx.render(data));
      if (wantDocx) written.push(`${base}.docx`);
    }

    if (wantPdf) {
      written.push(docxToPdf(`${base}.docx`, dir));
      // Clean up the intermediate the caller never asked for.
      if (!wantDocx) fs.rmSync(`${base}.docx`, { force: true });
    }

    results.push({ preset: name, files: written });
  }

  return results;
}
