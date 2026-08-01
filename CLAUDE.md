# Working in this repo

This package's own [README.md](README.md), [CONTEXT.md](CONTEXT.md) and
[docs/adr/](docs/adr/) cover what it is and why it's shaped this way. This file
is operating discipline for anyone changing the code — don't duplicate those
here, and read ADR-0001 and ADR-0003 before touching anything related to where
judgement lives (in the caller's agent, never in this package).

## Every guardrail needs a test, and a mutation check

`npm test` passing is not evidence a guardrail works — a suite that never fails
is worse than none, because it invites trust it hasn't earned. When you add or
change something that's supposed to reject bad input (a Tailoring Mode
violation, an unsourced fabrication, a malformed profile), break it on purpose
and confirm the suite goes red before you trust it green. This has already
caught real bugs in this codebase, not hypothetical ones — see the git history
on `src/promote.js` and `src/application.js`.

**The `Tech: undefined` incident is the concrete lesson.** `markdown.js`
printed a project's tech line unconditionally while the exact same file
guarded the equivalent line for the role, and `docx.js` guarded both — an
inconsistency inside one function, not a disagreement between renderers. It
shipped to a real person's published portfolio because the renderers had zero
tests. Every other module did. If you're adding a new renderer, a new output
format, or a new field that's sometimes absent — write the omitted-when-unset
and present-when-set cases before you consider it done.

## Editing `profile.yaml` in code — never round-trip it

Any code that touches a Master Profile file (see `src/promote.js`) must splice
the raw text, not parse-and-dump. A Master Profile is written by hand and
carries comments, blank lines, and folded (`>-`) blocks that `js-yaml.dump()`
will silently flatten. After any write: re-parse the result and verify it
matches what was intended (right entry, right count, nothing else moved) —
roll back byte-for-byte on any mismatch, not just on a parse error. The
`promote.js` rollback path has no test that can trigger it without contriving
the fixture; it's been verified only by actually firing correctly against a
real profile. Don't assume it's covered just because the suite is green.

Two real bugs came out of skipping this discipline once: an embedded newline
in a phrasing splicing a stray line at the wrong indent, and appending after a
folded (`>-`) phrasing indenting the new item to match the block's
*continuation* lines instead of treating it as a sibling. Both were invisible
in a fixture of single-line phrasings and only surfaced against a real
profile. If you add a new profile-editing code path, test it against both a
single-line and a folded phrasing before calling it done.

## Versioning

Bump `version` in **both** `package.json` and `src/mcp.js` together — they're
supposed to match and nothing currently enforces that they do. Tag on merge to
`main`, not before. Consuming repos (like the CV repo this package was
extracted from) pin to a specific tag deliberately — don't expect a push here
to propagate anywhere until someone bumps that pin on purpose. That's a
feature: it's what stops a toolkit change from silently altering a resume
someone already sent.

## What actually belongs in this package

Per ADR-0001 and ADR-0003: no API calls, no matching/scoring algorithm, no
opinion about which Entry evidences which Requirement. That judgement is the
agent's. This package's job is bookkeeping — enforcing Tailoring Modes,
rejecting fabrication, doing the accounting the agent is unreliable at. If
you're about to add something that decides relevance rather than checks it,
stop and re-read the ADRs first.
