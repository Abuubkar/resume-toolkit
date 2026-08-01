# The LLM lives in the caller's agent, not in the toolkit

The toolkit needs a language model to tailor a Master Profile against a Job
Description, but its users are software engineers who already run Claude Code,
Cursor, or a similar agent. So the toolkit ships as an MCP server exposing the
data, the rendering, and the Tailoring Mode guardrails, and lets the caller's
agent supply the intelligence. We hold no API key, maintain no prompt, and pay
no inference cost.

## Considered Options

- **Agent-driven via MCP** (chosen) — the agent already in the user's editor
  calls our tools. Provenance is enforced in our code, so an agent cannot return
  unsourced bullets in `provenance` mode regardless of what it would prefer to
  do. No keys, no prompts, no inference bill, and it eliminates the manual
  copy-paste loop that motivated the project.
- **Bring-your-own API key inside the app** — the toolkit stores a user's
  Anthropic/OpenAI key locally and owns the prompt. Rejected for now because it
  makes us responsible for prompt upkeep, model-version drift, retries, and key
  storage. This is the option to revisit if a GUI ever has to generate on its
  own without an agent present.
- **Local model via Ollama** — offline and free, but tailoring under a
  provenance constraint is constraint-following rewriting, which is where small
  local models are weakest, and it puts a model-setup burden on every user.
- **Generate the prompt for manual paste** — the toolkit assembles the prompt
  and parses the pasted-back reply. Zero cost and works with any chat, but it is
  a tidier version of the exact loop the project exists to remove.

## Consequences

Tailoring is the *only* capability that requires an agent, and it is strictly
additive. Editing a Master Profile and rendering a Preset to Markdown, DOCX and
PDF must always work as pure data transformation with no model involved — this is
a hard requirement, since it is how the candidate maintains their standing
resumes and how CI publishes them.

Conversely, anything that must run without an agent — a standalone GUI that
generates on its own, or CI — has no path to tailoring. It can still read,
render, and export existing Applications, since those too are pure data.
