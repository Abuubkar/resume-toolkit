// src/renderers/docx.js — DocxRenderer class.
// Produces a .docx Buffer from resume data.

// `docx` is a declared dependency, so a failure here means a broken install
// rather than a missing optional extra — surface it instead of swallowing it.
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  LevelFormat,
  HeadingLevel,
  BorderStyle,
  ExternalHyperlink,
  TabStopType,
  TabStopPosition,
} = await import("docx");

const ACCENT = "1F4E79";
const RULE = {
  bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 2 },
};

function sectionHeading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    border: RULE,
    spacing: { before: 120, after: 60 },
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        size: 22,
        font: "Arial",
        color: ACCENT,
      }),
    ],
  });
}
function bullet(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 15 },
    children: [new TextRun({ text, size: 19, font: "Arial" })],
  });
}
function pbullet(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 10 },
    children: [new TextRun({ text, size: 19, font: "Arial" })],
  });
}

export class DocxRenderer {
  render(data) {
    const { CONTACT, EDUCATION } = data;
    const children = this._buildChildren(data, CONTACT, EDUCATION);
    return Packer.toBuffer(this._makeDoc(children));
  }

  _buildChildren(r, CONTACT, EDUCATION) {
    const c = [];
    c.push(
      new Paragraph({
        spacing: { after: 20 },
        children: [
          new TextRun({
            text: CONTACT.name,
            bold: true,
            size: 36,
            font: "Arial",
            color: "000000",
          }),
        ],
      }),
    );
    c.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({
            text: r.title,
            size: 22,
            font: "Arial",
            color: ACCENT,
            bold: true,
          }),
        ],
      }),
    );
    c.push(
      new Paragraph({
        spacing: { after: 20 },
        children: [
          new TextRun({
            text: `${CONTACT.email}  •  ${CONTACT.phone}`,
            size: 18,
            font: "Arial",
            color: "444444",
          }),
        ],
      }),
    );
    const linkRuns = [];
    CONTACT.links.forEach((l, i) => {
      if (i)
        linkRuns.push(
          new TextRun({
            text: "  •  ",
            size: 18,
            font: "Arial",
            color: "444444",
          }),
        );
      linkRuns.push(
        new ExternalHyperlink({
          link: l.url,
          children: [
            new TextRun({
              text: l.label,
              style: "Hyperlink",
              size: 18,
              font: "Arial",
            }),
          ],
        }),
      );
    });
    c.push(new Paragraph({ spacing: { after: 80 }, children: linkRuns }));

    c.push(sectionHeading("Professional Summary"));
    c.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: r.summary, size: 19, font: "Arial" })],
      }),
    );

    c.push(sectionHeading("Experience"));
    r.experiences.forEach((role) => {
      c.push(
        new Paragraph({
          spacing: { before: 20, after: 20 },
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
          children: [
            new TextRun({
              text: role.title,
              bold: true,
              size: 20,
              font: "Arial",
            }),
            new TextRun({
              text: "\t" + role.date,
              size: 19,
              font: "Arial",
              color: "444444",
            }),
          ],
        }),
      );
      if (role.tagline) {
        c.push(
          new Paragraph({
            spacing: { after: 30 },
            children: [
              new TextRun({
                text: role.tagline,
                italics: true,
                size: 18,
                font: "Arial",
                color: "555555",
              }),
            ],
          }),
        );
      }
      role.bullets.forEach((b) => c.push(bullet(b)));
      if (role.tech) {
        c.push(
          new Paragraph({
            spacing: { before: 10, after: 20 },
            children: [
              new TextRun({
                text: "Tech: ",
                bold: true,
                size: 18,
                font: "Arial",
              }),
              new TextRun({
                text: role.tech,
                italics: true,
                size: 18,
                font: "Arial",
                color: "555555",
              }),
            ],
          }),
        );
      }
    });

    c.push(sectionHeading("Selected Projects"));
    r.projects.forEach((p) => {
      c.push(
        new Paragraph({
          spacing: { before: 40, after: 15 },
          children: [
            new TextRun({ text: p.name, bold: true, size: 19, font: "Arial" }),
            new TextRun({
              text: "   ·   " + p.meta,
              italics: true,
              size: 18,
              font: "Arial",
              color: ACCENT,
            }),
          ],
        }),
      );
      p.bullets.forEach((b) => c.push(pbullet(b)));
      if (p.tech) {
        c.push(
          new Paragraph({
            spacing: { after: 20 },
            children: [
              new TextRun({
                text: "Tech: " + p.tech,
                italics: true,
                size: 18,
                font: "Arial",
                color: "555555",
              }),
            ],
          }),
        );
      }
    });

    c.push(sectionHeading("Core Skills"));
    r.skills.forEach(([k, v]) =>
      c.push(
        new Paragraph({
          spacing: { after: 20 },
          children: [
            new TextRun({
              text: k + ": ",
              bold: true,
              size: 19,
              font: "Arial",
            }),
            new TextRun({ text: v, size: 19, font: "Arial" }),
          ],
        }),
      ),
    );

    c.push(sectionHeading("Education"));
    c.push(
      new Paragraph({
        spacing: { after: 20 },
        children: [
          new TextRun({
            text: EDUCATION.degree,
            bold: true,
            size: 19,
            font: "Arial",
          }),
          new TextRun({ text: EDUCATION.rest, size: 19, font: "Arial" }),
          new TextRun({
            text: EDUCATION.meta,
            size: 19,
            font: "Arial",
            color: "444444",
          }),
        ],
      }),
    );

    if (r.certificates && r.certificates.length) {
      c.push(sectionHeading("Certifications"));
      r.certificates.forEach((cert) => {
        c.push(bullet(`${cert.name} - ${cert.issuer} (${cert.date})`));
      });
    }
    return c;
  }

  _makeDoc(children) {
    return new Document({
      styles: {
        default: { document: { run: { font: "Arial", size: 19 } } },
        paragraphStyles: [
          {
            id: "Heading1",
            name: "Heading 1",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: { size: 22, bold: true, font: "Arial", color: ACCENT },
            paragraph: { spacing: { before: 120, after: 60 }, outlineLevel: 0 },
          },
        ],
      },
      numbering: {
        config: [
          {
            reference: "bullets",
            levels: [
              {
                level: 0,
                format: LevelFormat.BULLET,
                text: "•",
                alignment: AlignmentType.LEFT,
                style: { paragraph: { indent: { left: 360, hanging: 220 } } },
              },
            ],
          },
        ],
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: 12240, height: 15840 },
              margin: { top: 720, right: 720, bottom: 720, left: 720 },
            },
          },
          children,
        },
      ],
    });
  }
}
