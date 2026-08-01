# Applications do not record outcomes

Because every Application is kept, the toolkit could correlate Gaps against
whether an application got a reply — the strongest analysis this design is
capable of producing. We are deliberately not doing it. The correlation depends
on the candidate returning weeks later to update a record they have stopped
caring about, and a field filled in half the time yields correlations that are
worse than having none. Gap aggregation still ships, ranked by frequency alone.

## Considered Options

- **No outcome tracking** (chosen) — Applications stay purely immutable, the
  "this is not a CRM" boundary stays clean, and there is no field to rot.
- **A single append-only outcome field** — status and date stored as metadata
  beside the frozen content. Cheap to build and unlocks the correlation, but its
  entire value rests on a habit the candidate does not currently have.
- **A light funnel** — per-stage dates, company, notes. Genuinely useful pipeline
  visibility, and squarely the applicant-tracking product this project has
  already declined to become.

## Consequences

This is not retroactively fixable: outcomes not captured at the time are gone for
good, so a later reversal starts from zero history. Revisit only if a habit of
recording outcomes emerges on its own.
