// src/renderers/markdown.js — MarkdownRenderer class.
// Produces a markdown string from resume data.

export class MarkdownRenderer {
  render(data) {
    const { CONTACT, EDUCATION } = data;
    const L = [];
    L.push(`# ${CONTACT.name}`);
    L.push(`## ${data.title}`);
    L.push("");
    L.push(`${CONTACT.email}  ·  ${CONTACT.phone}`);
    L.push(CONTACT.links.map((l) => l.label).join("  ·  "));
    L.push("");
    L.push("---");
    L.push("");
    L.push("## Professional Summary");
    L.push(data.summary);
    L.push("");
    L.push("---");
    L.push("");
    L.push("## Core Skills");
    data.skills.forEach(([k, v]) => L.push(`**${k}:** ${v}`));
    L.push("");
    L.push("---");
    L.push("");
    L.push("## Experience");
    L.push("");
    data.experiences.forEach((role) => {
      L.push(`### ${role.title}`);
      L.push(`*${role.date}*`);
      if (role.tagline) L.push(`*${role.tagline}*`);
      L.push("");
      role.bullets.forEach((b) => L.push(`- ${b}`));
      // Both optional lines stay guarded. Printing `tech` unconditionally is
      // the exact bug that put "Tech: undefined" on a published resume.
      if (role.tech) {
        L.push("");
        L.push(`**Tech:** ${role.tech}`);
      }
      L.push("");
    });
    L.push("---");
    L.push("");
    L.push("## Selected Projects");
    L.push("");
    data.projects.forEach((p) => {
      L.push(`**${p.name}** · *${p.meta}*`);
      p.bullets.forEach((b) => L.push(`- ${b}`));
      // Guarded like the experience tech line above and like both of the DOCX
      // renderer's: `tech` is optional, and printing it unguarded rendered a
      // literal "Tech: undefined" under every project that omitted it.
      if (p.tech) L.push(`*Tech: ${p.tech}*`);
      L.push("");
    });
    L.push("---");
    L.push("");
    L.push("## Education");
    L.push(`**${EDUCATION.degree}**${EDUCATION.rest}${EDUCATION.meta}`);
    L.push("");
    if (data.certificates && data.certificates.length) {
      L.push("## Certifications");
      data.certificates.forEach((c) =>
        L.push(`- ${c.name} — ${c.issuer} (${c.date})`),
      );
      L.push("");
    }
    return L.join("\n");
  }
}
