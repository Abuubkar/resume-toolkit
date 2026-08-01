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

Working end to end: Presets, Applications, provenance enforcement, Gap reporting,
a CLI, and an MCP server your agent drives directly.

## Install

```bash
npm install @abuubkar/resume-toolkit
```

LibreOffice is only needed for PDF output:

```bash
brew install --cask libreoffice
```

## Use

Standing resumes:

```bash
resume-toolkit list
resume-toolkit build                       # every preset
resume-toolkit build frontend --formats md,docx
```

One resume per opening:

```bash
resume-toolkit application new 2026-08-01-acme-backend --jd jd.txt --company Acme
resume-toolkit application check 2026-08-01-acme-backend
resume-toolkit application render 2026-08-01-acme-backend
resume-toolkit gaps
```

`check` is the interesting one:

```
2026-08-01-acme-backend — mode: provenance
  requirements: 3/5 covered

  GAPS (2) — nothing in your profile supports these:
    · production Kubernetes experience
    · Go is a plus
```

and once you have a few applications behind you:

```
Across 3 application(s):

    3 / 3  Kubernetes
    1 / 3  Go
    1 / 3  Terraform
```

That last output is the point of keeping every application. One missing skill is
easy to wave away; the same one blocking every role you want is a decision.

## Growing the Phrasing library

Hand-curation cannot keep pace with the number of ways postings differ, so the
library grows from approved rewrites instead:

```bash
resume-toolkit promote role.acme.apis "Owned the public HTTP surface end to end."
resume-toolkit pick-rate
```

`promote` appends to that Entry's Phrasings **in place** — your comments,
formatting, and ordering are preserved, because a Master Profile is a document
you maintain by hand and round-tripping it through a YAML serialiser would
quietly flatten all of it.

It stays gated: nothing is promoted until you approve that exact wording.

`pick-rate` is the evidence for whether any of this is paying off — how many
bullets reused an existing Phrasing versus were written fresh:

```
Across 12 application(s):

  reused an existing phrasing   47
  written fresh                 19

  Pick rate: 71%
```

Origins are stamped when a selection is saved, never recomputed. Otherwise
promoting rewrites back into the profile would push the measured rate towards
100% purely because the library absorbed its own output.

## Use it from your agent (MCP)

Point Claude Code, Cursor, or any MCP client at the server and tailoring becomes
a conversation — *"here's the JD, what am I missing?"*

```json
{
  "mcpServers": {
    "resume": {
      "command": "npx",
      "args": ["-y", "@abuubkar/resume-toolkit", "resume-toolkit-mcp"],
      "env": {
        "RESUME_PROFILE": "/path/to/profile.yaml",
        "RESUME_APPLICATIONS": "/path/to/applications"
      }
    }
  }
}
```

The tool surface deliberately makes the agent stop and think before it writes:

| Tool | Purpose |
|---|---|
| `read_profile` | The raw material — Entries, Phrasings, Presets |
| `create_application` | Start one from a JD; stores the posting verbatim |
| `set_requirements` | **Analysis.** Submit requirements + which Entries evidence each → returns Gaps |
| `set_selection` | **Tailoring.** Submit the ordered picks → rejected if it breaks the mode |
| `check_application` / `render_application` | Report, then write into the application's own directory |
| `aggregate_gaps` | What you keep lacking, across every application |
| `promote_phrasing` | Save an approved rewrite into the profile, preserving its formatting |
| `pick_rate` | Evidence for whether keeping several Phrasings is paying off |
| `list_applications` / `read_application` / `render_preset` | Read and standing-resume rendering |

`set_requirements` comes **before** `set_selection` by design. Gaps surface while
the decision is still *"should I apply, and how?"* — not beside a finished PDF
you're already attached to. And `set_selection` refuses to persist anything that
violates the Tailoring Mode, so a rejected bullet never reaches disk.

The agent supplies the judgement; the server supplies the guarantees. No API key,
no prompt, no inference cost — your agent already has the model.

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
- An **Application** is the same shape as a Preset, plus the Job Description it
  was written for and the **Requirements** drawn out of it. It carries its own
  frozen text and is never regenerated, because the question an archived
  application must answer is *what exactly did I send these people?*
- A **Gap** is a Requirement nothing in your profile supports. It is a finding
  about you, not a defect in the output — so it never blocks a render, it just
  refuses to be invisible.

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

## Tailoring modes

How far a bullet may depart from its source. Default is `provenance`.

| Mode | Rule |
|---|---|
| `selection` | text must be one of the Entry's Phrasings, verbatim |
| `provenance` | text may be reworded, but must trace to an Entry |
| `free` | text may have no source at all |

Two things hold in every mode. Unsourced bullets are always reported by `check`
and always marked in the Markdown — never in the DOCX or PDF, so you read them
the way a reviewer would before exporting what you actually send. And a role,
project, skill or certificate can *never* be unsourced: rewording a bullet is a
judgement call, inventing an employer is not, and there is no flag for it.

## Design decisions

Building a Preset is **pure data transformation** — no model, no network, works
offline and in CI. Editing your profile and rendering a standing resume must
always work that way; tailoring is the only capability that needs a model, and
it is strictly additive.

That model lives in *your* agent (Claude Code, Cursor) rather than in this
package: no API key to store, no prompt to maintain, no inference cost. The
toolkit supplies the data and enforces the guarantees — every bullet traces back
to an Entry, no requirement can claim coverage from something the resume omits,
an employer can never be fabricated, and a requirement with no supporting
material is reported as a **Gap** rather than quietly invented.

There is deliberately **no matching algorithm** here. Recognising that "Celery
and Redis" evidences "asynchronous processing" is a judgement call, and the
agent has already read both documents. This code does the bookkeeping instead —
the part the agent is unreliable at. See
[docs/adr/](docs/adr/) for why.

## Tests

```bash
npm test
```

Node's built-in runner, no test dependencies. The PDF cases skip automatically
when LibreOffice is absent; CI installs it so they run there.

## Licence

MIT
