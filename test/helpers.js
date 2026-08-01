import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { loadProfile } from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export const FIXTURE_PROFILE = path.join(here, "fixtures", "profile.yaml");

export function profile() {
  return loadProfile(FIXTURE_PROFILE);
}

export function tempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `resume-toolkit-${label}-`));
}

// Asserts fn throws, and that the message mentions `fragment`. Matching on the
// message keeps the tests honest about *why* something was rejected — several
// guardrails throw from the same call site for very different reasons.
export function throwsWith(assert, fn, fragment) {
  let caught;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  assert.ok(caught, `expected a throw mentioning "${fragment}", got none`);
  assert.match(caught.message, new RegExp(fragment, "i"));
}
