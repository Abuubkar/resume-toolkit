# Relevance is judged by the agent; the toolkit only does accounting

Matching an Entry to a Requirement is a judgement call — recognising that
"Celery and Redis" evidences "asynchronous processing" is exactly what a language
model is good at and what lexical scoring is bad at. Since ADR-0001 puts a model
in the caller's agent already, the toolkit contains no matching algorithm. It
instead does the bookkeeping the agent is unreliable at: guaranteeing every
Requirement ends up either covered by a chosen Entry or explicitly declared a
Gap, and that every bullet satisfies the active Tailoring Mode.

## Considered Options

- **Agent judges, toolkit accounts** (chosen) — no ML dependency, no model to
  ship or update, and the agent has already read both documents. The toolkit's
  contribution is the guarantee that nothing silently vanishes.
- **Lexical scoring (BM25 / keyword overlap)** — offline, explainable and
  testable, but it fails precisely on the synonym cases that motivate tailoring
  at all.
- **Local sentence embeddings** — handles synonyms and stays offline, but adds a
  model dependency and setup burden to buy something not yet needed: a Master
  Profile of roughly a hundred Entries fits comfortably in an agent's context, so
  there is nothing to pre-filter. This becomes the right answer only when a
  profile outgrows the context window.

## Consequences

The MCP contract has the agent submitting Requirements and its chosen Entries.
Adding a scoring engine later would change those tool signatures, so it is a
breaking change for a published package rather than a purely additive one.
