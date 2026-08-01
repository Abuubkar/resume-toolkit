# The toolkit ships as its own package, separate from any personal data

This repository began as one person's CV and grew a build system around it. Since
the toolkit is meant for other engineers, the code moves to its own repository
and is published to npm, while this repository keeps only its owner's Master
Profile, Applications, and portfolio publishing, consuming the toolkit as a
dependency.

## Considered Options

- **Extract to its own repo** (chosen) — colleagues install a package and never
  receive anyone else's CV. Versioning becomes possible, so the toolkit can
  change without breaking someone mid-application. The existing portfolio
  publish workflow survives essentially unchanged.
- **One repo that colleagues fork** — no packaging or publishing work at all,
  but each fork permanently carries the original owner's CV in its git history,
  diverges on first edit, and can never cleanly pull improvements. Four copies,
  not one tool.
- **Monorepo with personal data gitignored** — clean separation of code from
  data in a single repo, but the Master Profile would then be absent from the
  repository CI builds from, breaking the automatic portfolio publish that
  currently works.

## Consequences

The toolkit can never assume a fixed on-disk location for a Master Profile; the
path is always supplied by the consuming project.
