// src/pdf.js — DOCX → PDF via LibreOffice.
//
// LibreOffice is an optional, system-level dependency: only the `pdf` output
// format needs it, so callers asking for md/docx never pay for it.

import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

export function isPdfAvailable() {
  try {
    execFileSync("soffice", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function docxToPdf(docxPath, outDir) {
  const pdfPath = path.join(
    outDir,
    path.basename(docxPath).replace(/\.docx$/, ".pdf"),
  );

  // Drop any previous PDF first, so the existence check below is testing this
  // run's output rather than passing on a stale file from an earlier build.
  fs.rmSync(pdfPath, { force: true });

  try {
    execFileSync(
      "soffice",
      ["--headless", "--convert-to", "pdf", "--outdir", outDir, docxPath],
      { stdio: "pipe" },
    );
  } catch (e) {
    const detail = e.stderr?.toString().trim() || e.message;
    throw new Error(`LibreOffice failed converting ${docxPath}: ${detail}`);
  }

  // soffice exits 0 on some failures, so trust the file rather than the status.
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`LibreOffice exited cleanly but did not write ${pdfPath}`);
  }

  return pdfPath;
}
