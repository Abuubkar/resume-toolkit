// Public API.
//
// buildPresets is the high-level entry point most consumers want. The lower
// pieces are exported too, so a caller can resolve a Preset and render it
// themselves without touching the filesystem.

export { loadProfile, listPresets, resolvePreset } from "./profile.js";
export { validateResume } from "./validate.js";
export { MarkdownRenderer } from "./renderers/markdown.js";
export { DocxRenderer } from "./renderers/docx.js";
export { docxToPdf, isPdfAvailable } from "./pdf.js";
export { buildPresets, FORMATS } from "./build.js";
