# Resume Toolkit

A local-first toolkit for producing job-specific resumes. It holds one canonical
record of a candidate's history and derives a separately-retained, tailored
document for each opening they apply to.

## Language

**Master Profile**:
The single canonical record of everything a candidate has genuinely done — every
role, project, bullet, and skill, as a superset. It is never trimmed for an
audience and only ever grows.
_Avoid_: base CV, master resume, source of truth, profile

**Application**:
One tailored resume produced for one specific opening, retained after it is sent.
Writing an Application never modifies the Master Profile.
_Avoid_: variant, version, config, resume type

**Job Description**:
The posted text of one opening, and the input an Application is tailored against.
_Avoid_: JD, job post, listing, vacancy, spec

**Preset**:
A named, reusable starting selection over the Master Profile — `frontend`,
`backend`, `fullstack`. A convenience for beginning an Application, never a
separate body of content.
_Avoid_: archetype, variant, resume type, template, flavour

**Entry**:
One atomic fact in the Master Profile — a single achievement, responsibility, or
capability. The unit that Provenance points at.
_Avoid_: bullet, item, record, fact

**Phrasing**:
One candidate-approved wording of an Entry, either written by hand or promoted
from a rewrite they accepted. An Entry carries several, which together define the
legitimate range of how that Entry may be expressed.
_Avoid_: variant, version, rewording, alternative

**Provenance**:
The binding from a bullet in an Application back to the Entry it derives from. A
bullet without one is unsourced.
_Avoid_: lineage, source ref, citation, traceability

**Tailoring Mode**:
The policy governing how far a bullet may depart from its source — `selection`
(text must equal source), `provenance` (text may be rephrased, source required),
or `free` (source may be absent). Defaults to `provenance`; unsourced bullets are
always flagged.
_Avoid_: strictness, generation mode, safety level

**Requirement**:
One demand extracted from a Job Description — a skill, a level of experience, a
responsibility. The unit an Application is assessed against.
_Avoid_: criterion, keyword, must-have, ask

**Gap**:
A Requirement with no supporting material anywhere in the Master Profile. A
finding about the candidate, not a defect in the output.
_Avoid_: missing skill, weakness, deficiency

**Parseability**:
Whether an applicant tracking system can correctly extract fields from a rendered
document. A property of rendering, entirely separate from how well the content
matches a Job Description.
_Avoid_: ATS compliance, ATS-friendly, ATS score
