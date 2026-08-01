// src/validate.js — light existence checks for resume data.
// Catches missing fields early, before they reach the renderers.

export function validateResume(data) {
  const errors = [];

  if (!data) {
    errors.push("Resume data is null or undefined");
    return { valid: false, errors };
  }

  if (!data.slug) errors.push("Missing slug");
  if (!data.title) errors.push("Missing title");
  if (!data.summary) errors.push("Missing summary");

  if (!data.skills || !Array.isArray(data.skills) || data.skills.length === 0) {
    errors.push("Missing or empty skills array");
  }

  if (!data.experience) {
    errors.push("Missing experience");
  } else {
    if (!data.experience.title) errors.push("Missing experience.title");
    if (!data.experience.date) errors.push("Missing experience.date");
    if (
      !data.experience.bullets ||
      !Array.isArray(data.experience.bullets) ||
      data.experience.bullets.length === 0
    ) {
      errors.push("Missing or empty experience.bullets");
    }
  }

  if (
    !data.projects ||
    !Array.isArray(data.projects) ||
    data.projects.length === 0
  ) {
    errors.push("Missing or empty projects array");
  }

  if (!data.CONTACT) errors.push("Missing CONTACT");
  if (!data.EDUCATION) errors.push("Missing EDUCATION");

  return { valid: errors.length === 0, errors };
}
