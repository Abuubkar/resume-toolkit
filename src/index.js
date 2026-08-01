// Public API.
//
// buildPresets and buildApplication are the high-level entry points. The lower
// pieces are exported too, so a caller — an MCP server, say — can resolve and
// check without touching the filesystem.

export { loadProfile, listPresets, resolvePreset, parsePick, phrasingOf } from "./profile.js";
export { resolveSelection, UNSOURCEABLE_KINDS } from "./selection.js";
export { validateResume } from "./validate.js";
export { MarkdownRenderer } from "./renderers/markdown.js";
export { DocxRenderer } from "./renderers/docx.js";
export { docxToPdf, isPdfAvailable } from "./pdf.js";
export { buildPresets, buildApplication, FORMATS } from "./build.js";
export {
  applicationDir,
  checkApplication,
  createApplication,
  listApplications,
  loadApplication,
  resolveApplication,
  saveApplication,
  DEFAULT_MODE,
  MODES,
} from "./application.js";
export { aggregateGaps } from "./gaps.js";
