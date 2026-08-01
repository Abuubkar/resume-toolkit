# @abuubkar/resume-toolkit

Most engineers send the same CV to every opening. The useful thing to do instead
— tailor it to each Job Description — is tedious enough that nobody sustains it.
This toolkit makes it cheap.

It keeps **one canonical record of your career** and derives a separate document
per application from it, so a fact lives in exactly one place and every claim on
a generated resume traces back to something you actually wrote.

Local-first: nothing leaves your machine, there is no account, and there is no
server.

## Status

Early. The Preset and rendering half is done and in use. Tailoring against a Job
Description — Applications, Gaps, and the MCP server — is next.

## Install

```bash
npm install @abuubkar/resume-toolkit
```

LibreOffice is only needed for PDF output:

```bash
brew install --cask libreoffice
```

## Use

```bash
resume-toolkit list --profile profile.yaml
resume-toolkit build --profile profile.yaml --out dist
resume-toolkit build frontend backend --formats md,docx
```

Or from code:

```js
import { buildPresets } from "@abuubkar/resume-toolkit";

await buildPresets({
  profilePath: "profile.yaml",
  outDir: "dist",
  presets: ["fullstack"],      // omit for all of them
  formats: ["md", "docx", "pdf"],
  basename: "resume",
});
```

## The model

- A **Master Profile** is the canonical record of everything you have done. It is
  never trimmed for an audience and only ever grows.
- An **Entry** is one atomic fact in it — a bullet, a project, a skill row.
- An Entry carries several **Phrasings**: approved wordings of that same fact.
  Together they define the legitimate range of how it may be expressed.
- A **Preset** is an ordered list of picks over those Entries, and is how you
  keep standing resumes like `frontend` or `backend`.
- An **Application** *(next)* is the same shape as a Preset plus the Job
  Description it was written for, frozen once sent.

```yaml
entries:
  project.convo.realtime:
    kind: bullet
    parent: project.convo
    phrasings:
      - Implemented live messaging over WebSockets using Django Channels and Redis.
      - Built real-time messaging using Django Channels and Redis.

presets:
  fullstack:
    - project.convo
    - project.convo.realtime      # phrasing 0
  backend:
    - project.convo@2
    - project.convo.realtime@1    # phrasing 1
```

Bullets must follow the role or project they belong to; the loader errors if
they don't.

## Design decisions

Building a Preset is **pure data transformation** — no model, no network, works
in CI. Tailoring is the only capability that will need a language model, and it
is strictly additive.

When it arrives, that model will live in *your* agent (Claude Code, Cursor)
rather than in this package: no API key to store, no prompt to maintain, no
inference cost. This toolkit will supply the data and enforce the guarantees —
chiefly that every generated bullet traces back to an Entry, and that any Job
Description requirement with no supporting material is reported as a **Gap**
rather than quietly invented.

## Licence

MIT
