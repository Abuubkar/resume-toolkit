#!/usr/bin/env node
// src/mcp.js — MCP server: the agent's surface onto the toolkit.
//
// ADR-0001 puts the language model in the caller's agent, and ADR-0003 keeps the
// judgement there too. So nothing here reasons about relevance. The agent reads
// the profile and the job description, decides what evidences what, and submits
// its conclusions; these tools store them, enforce the Tailoring Mode, and do
// the accounting the agent is unreliable at.
//
// The flow is deliberately two steps. set_requirements comes first and reports
// Gaps while the decision is still "should I apply, and how?" — set_selection
// only afterwards. A Gap read beside a finished resume is an inconvenience; a
// Gap read before one exists is a decision.

import path from "path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadProfile, listPresets, resolvePreset } from "./profile.js";
import { buildApplication, buildPresets, FORMATS } from "./build.js";
import {
  checkApplication,
  createApplication,
  listApplications,
  loadApplication,
  saveApplication,
  DEFAULT_MODE,
  MODES,
} from "./application.js";
import { aggregateGaps } from "./gaps.js";
import { promotePhrasing } from "./promote.js";
import { stampSelection, summarise, pickRate } from "./provenance.js";

// Configured by the MCP client, which sets env for the server process.
const PROFILE_PATH = process.env.RESUME_PROFILE ?? "profile.yaml";
const APPLICATIONS_DIR = process.env.RESUME_APPLICATIONS ?? "applications";
const BASENAME = process.env.RESUME_BASENAME ?? "resume";

const json = (value) => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });

const failed = (message) => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

// Every tool touches the filesystem, so any of them can fail on a bad path or
// malformed record. Returning isError lets the agent read the reason and adjust
// rather than seeing the whole server fall over.
const guard = (handler) => async (args) => {
  try {
    return await handler(args);
  } catch (e) {
    return failed(e.message);
  }
};

const server = new McpServer({ name: "resume-toolkit", version: "0.4.0" });

const applicationId = z.string().describe("The application's id, e.g. 2026-08-01-acme-backend");

server.registerTool(
  "read_profile",
  {
    title: "Read the Master Profile",
    description:
      "The candidate's canonical record: every Entry, its Phrasings, and the named Presets. " +
      "This is the only material a tailored resume may draw on — read it before proposing anything.",
    inputSchema: {},
  },
  guard(async () => {
    const profile = loadProfile(PROFILE_PATH);
    return json({
      contact: profile.contact,
      education: profile.education,
      presets: listPresets(profile),
      entries: profile.entries,
    });
  }),
);

server.registerTool(
  "render_preset",
  {
    title: "Render a standing resume",
    description:
      "Render a Preset — a standing, general-purpose resume — to disk. Nothing to do with a specific opening.",
    inputSchema: {
      preset: z.string().describe("Preset name, as listed by read_profile"),
      outDir: z.string().optional().describe("Output directory (default: dist)"),
      formats: z.array(z.enum(FORMATS)).optional().describe(`Default: all of ${FORMATS.join(", ")}`),
    },
  },
  guard(async ({ preset, outDir, formats }) =>
    json(
      await buildPresets({
        profilePath: PROFILE_PATH,
        outDir: outDir ?? "dist",
        presets: [preset],
        formats: formats ?? FORMATS,
        basename: BASENAME,
      }),
    ),
  ),
);

server.registerTool(
  "list_applications",
  {
    title: "List applications",
    description: "Every application kept so far, oldest id first.",
    inputSchema: {},
  },
  guard(async () => json({ applications: listApplications(APPLICATIONS_DIR) })),
);

server.registerTool(
  "read_application",
  {
    title: "Read an application",
    description: "One application's job description, requirements, and frozen selection.",
    inputSchema: { id: applicationId },
  },
  guard(async ({ id }) => json(loadApplication(APPLICATIONS_DIR, id))),
);

server.registerTool(
  "create_application",
  {
    title: "Start an application",
    description:
      "Create an application from a job description. Store the posting text verbatim — postings get " +
      "taken down, and the archive has to answer 'what was I applying to?' years later. " +
      "Next step is set_requirements, not set_selection.",
    inputSchema: {
      id: applicationId,
      jd: z.string().describe("The job description, as posted"),
      company: z.string().optional(),
      role: z.string().optional(),
      mode: z
        .enum(MODES)
        .optional()
        .describe(
          `Tailoring Mode (default: ${DEFAULT_MODE}). ` +
            "selection: text must be a Phrasing verbatim. " +
            "provenance: text may be reworded but must trace to an Entry. " +
            "free: text may be unsourced — never use without the candidate asking for it.",
        ),
      createdAt: z.string().optional().describe("ISO date; defaults to the id's own date if it starts with one"),
    },
  },
  guard(async ({ id, jd, company, role, mode, createdAt }) => {
    if (listApplications(APPLICATIONS_DIR).includes(id)) {
      return failed(`An application "${id}" already exists — applications are never overwritten.`);
    }
    // An id conventionally starts with the date, so derive from it rather than
    // reading a clock the caller cannot control.
    const dated = /^(\d{4}-\d{2}-\d{2})/.exec(id);
    const application = createApplication({
      id,
      company,
      role,
      mode,
      createdAt: createdAt ?? dated?.[1] ?? null,
    });
    const dir = saveApplication(APPLICATIONS_DIR, application, { jd });
    return json({ created: dir, next: "set_requirements" });
  }),
);

server.registerTool(
  "set_requirements",
  {
    title: "Record what the job asks for",
    description:
      "Submit the Requirements you drew out of the job description, and which Entries evidence each one. " +
      "Judging that is your job, not the toolkit's. A Requirement with no supporting Entry is left with an " +
      "empty covers array and comes back as a Gap — report Gaps to the candidate before doing any tailoring; " +
      "they are the point of this step. Give each requirement a short tag ('Kubernetes') so the same lack " +
      "can be counted across applications even when postings word it differently.",
    inputSchema: {
      id: applicationId,
      requirements: z
        .array(
          z.object({
            id: z.string().describe("Short stable id within this application, e.g. r1"),
            text: z.string().describe("The requirement as the posting words it"),
            tag: z.string().optional().describe("Canonical short label, e.g. Kubernetes"),
            covers: z
              .array(z.string())
              .describe("Entry ids that evidence this. Empty means a Gap — do not invent coverage."),
          }),
        )
        .describe("Every requirement worth assessing against"),
    },
  },
  guard(async ({ id, requirements }) => {
    const application = loadApplication(APPLICATIONS_DIR, id);
    application.requirements = requirements;
    saveApplication(APPLICATIONS_DIR, application);

    const report = checkApplication(loadProfile(PROFILE_PATH), application);
    return json({
      ...report,
      next: report.gaps.length
        ? "Report these gaps to the candidate before tailoring."
        : "set_selection",
    });
  }),
);

server.registerTool(
  "set_selection",
  {
    title: "Record the tailored resume",
    description:
      "Submit the ordered picks that make up this resume. Each item names an Entry and the exact text to " +
      "print — reuse a Phrasing verbatim where one fits, and only reword when none does. A bullet must come " +
      "after the role or project it belongs to. Rejected if it violates the application's Tailoring Mode.",
    inputSchema: {
      id: applicationId,
      selection: z
        .array(
          z.object({
            id: z
              .string()
              .nullable()
              .describe("Entry id, or null for unsourced text (free mode only, bullets/headline/summary only)"),
            text: z.string().describe("Exactly what appears on the resume"),
            kind: z.string().optional().describe("Required when id is null"),
            parent: z.string().optional().describe("Required for an unsourced bullet"),
          }),
        )
        .describe("Render order. A role or project must precede its bullets."),
    },
  },
  guard(async ({ id, selection }) => {
    const profile = loadProfile(PROFILE_PATH);
    const application = loadApplication(APPLICATIONS_DIR, id);
    const report = checkApplication(profile, { ...application, selection });

    // Refuse to persist a selection that breaks the mode — the record should
    // never contain something the candidate did not agree to.
    if (!report.ok) return json({ saved: false, ...report });

    // Stamp how each bullet came about before freezing it. Recomputing this
    // later would drift once approved rewrites are promoted into phrasings.
    application.selection = stampSelection(profile, selection);
    saveApplication(APPLICATIONS_DIR, application);

    const origins = summarise(application.selection);
    return json({
      saved: true,
      ...report,
      origins,
      next: origins.rewritten
        ? "render_application. Any rewrite the candidate approves is worth promote_phrasing — that is the only way the library grows."
        : "render_application",
    });
  }),
);

server.registerTool(
  "promote_phrasing",
  {
    title: "Save an approved rewrite as a Phrasing",
    description:
      "Add wording to an Entry's Phrasings so future applications can reuse it. Only call this after the " +
      "candidate has approved that exact text — it edits their canonical profile. This is the only way the " +
      "Phrasing library grows, so offer it whenever a rewrite is accepted; hand-curation cannot keep up with " +
      "the number of ways postings differ. Comments and formatting in the profile are preserved.",
    inputSchema: {
      entry: z.string().describe("Entry id the wording belongs to"),
      text: z.string().describe("The approved wording, exactly as it should be stored"),
    },
  },
  guard(async ({ entry, text }) => json(promotePhrasing(PROFILE_PATH, entry, text))),
);

server.registerTool(
  "pick_rate",
  {
    title: "How often an existing Phrasing was reused",
    description:
      "Across every application: how many bullets reused an approved Phrasing verbatim versus were written " +
      "fresh. This is the evidence for whether keeping multiple Phrasings per Entry is paying off. " +
      "A low rate after ~10 applications means the library is not covering the ways postings actually differ.",
    inputSchema: {},
  },
  guard(async () => json(pickRate(APPLICATIONS_DIR))),
);

server.registerTool(
  "check_application",
  {
    title: "Check an application",
    description:
      "Report coverage, Gaps, unsourced text, and any defects, without changing anything.",
    inputSchema: { id: applicationId },
  },
  guard(async ({ id }) =>
    json(checkApplication(loadProfile(PROFILE_PATH), loadApplication(APPLICATIONS_DIR, id))),
  ),
);

server.registerTool(
  "render_application",
  {
    title: "Render an application",
    description:
      "Write the resume into the application's own directory, keeping posting, decisions and documents " +
      "together. Refuses if the application does not check out. Gaps do not block — they are a finding " +
      "about the candidate, not a defect — but report them alongside the files.",
    inputSchema: {
      id: applicationId,
      formats: z.array(z.enum(FORMATS)).optional().describe(`Default: all of ${FORMATS.join(", ")}`),
    },
  },
  guard(async ({ id, formats }) =>
    json(
      await buildApplication({
        profilePath: PROFILE_PATH,
        applicationsDir: APPLICATIONS_DIR,
        id,
        formats: formats ?? FORMATS,
        basename: BASENAME,
      }),
    ),
  ),
);

server.registerTool(
  "aggregate_gaps",
  {
    title: "What the candidate keeps lacking",
    description:
      "Gaps ranked by how many applications hit them. One missing skill is easy to wave away; the same one " +
      "blocking most applications is career advice worth raising unprompted.",
    inputSchema: {},
  },
  guard(async () => json(aggregateGaps(APPLICATIONS_DIR))),
);

const transport = new StdioServerTransport();
await server.connect(transport);

// stdout is the protocol channel — anything written there corrupts the stream.
console.error(
  `resume-toolkit MCP server ready (profile: ${path.resolve(PROFILE_PATH)}, applications: ${path.resolve(APPLICATIONS_DIR)})`,
);
