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

  if (!data.experiences || !Array.isArray(data.experiences) || data.experiences.length === 0) {
    errors.push("Missing or empty experiences array");
  } else {
    // Every role still needs bullets. A role rendered as a bare title and date
    // reads as an unfinished document, which is worse than leaving it out.
    data.experiences.forEach((e, i) => {
      const at = `experiences[${i}]`;
      if (!e.title) errors.push(`Missing ${at}.title`);
      if (!e.date) errors.push(`Missing ${at}.date`);
      if (!e.bullets || !Array.isArray(e.bullets) || e.bullets.length === 0) {
        errors.push(`Missing or empty ${at}.bullets`);
      }
    });
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
