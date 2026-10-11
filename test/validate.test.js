// validateResume had no tests of its own; it was only ever exercised through
// build.js. The 0.5.0 change to a list of roles rewrote the experience branch,
// so that branch gets covered directly here.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateResume, resolvePreset } from "../src/index.js";
import { profile } from "./helpers.js";

const base = () => resolvePreset(profile(), "backend");

describe("validateResume — experiences", () => {
  it("accepts the shape a preset resolves to", () => {
    const { valid, errors } = validateResume(base());
    assert.deepEqual(errors, []);
    assert.equal(valid, true);
  });

  it("accepts more than one role", () => {
    const data = base();
    data.experiences.push({
      title: "Senior Software Engineer | Codeupnow",
      date: "Sept 2025 – Present",
      bullets: ["Delivered a client platform."],
    });
    assert.equal(validateResume(data).valid, true);
  });

  it("rejects an empty list of roles", () => {
    const data = base();
    data.experiences = [];
    const { valid, errors } = validateResume(data);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => /experiences/i.test(e)));
  });

  it("rejects a role with no bullets, and says which one", () => {
    const data = base();
    data.experiences.push({ title: "Engineer | Elsewhere", date: "2024", bullets: [] });
    const { valid, errors } = validateResume(data);
    assert.equal(valid, false);
    // The index matters: with several roles, "missing bullets" alone does not
    // say which one to go and fix.
    assert.ok(errors.some((e) => /experiences\[1\]\.bullets/.test(e)), errors.join("; "));
  });

  it("rejects a role missing its title or date, naming the index", () => {
    const data = base();
    data.experiences.push({ date: "2024", bullets: ["Did a thing."] });
    data.experiences.push({ title: "Engineer | Elsewhere", bullets: ["Did a thing."] });
    const { errors } = validateResume(data);
    assert.ok(errors.some((e) => /experiences\[1\]\.title/.test(e)), errors.join("; "));
    assert.ok(errors.some((e) => /experiences\[2\]\.date/.test(e)), errors.join("; "));
  });
});
