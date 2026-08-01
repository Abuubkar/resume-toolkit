#!/usr/bin/env node
// src/cli.js — resume-toolkit command line.

import fs from "fs";
import { loadProfile, listPresets } from "./profile.js";
import { buildPresets, buildApplication, FORMATS } from "./build.js";
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
import { pickRate } from "./provenance.js";

const USAGE = `resume-toolkit — build resumes from a Master Profile

Presets — your standing resumes:
  list                          List the presets in the profile
  build [preset...]             Render presets (default: all of them)

Applications — one per opening, kept:
  application list              List applications
  application new <id>          Start one from a job description
  application check <id>        Report gaps, unsourced bullets and defects
  application render <id>       Render it into its own directory
  gaps                          What you keep not having, across applications
  promote <entry> <text>        Save an approved rewrite as a Phrasing
  pick-rate                     How often an existing Phrasing was reused

Options:
  --profile <path>       Master Profile           (default: profile.yaml)
  --applications <dir>   Applications directory   (default: applications)
  --out <dir>            Output directory         (default: dist, or the app's own dir)
  --formats <list>       ${FORMATS.join(",")}              (default: all)
  --basename <name>      Filename stem            (default: resume)
  --jd <path>            Job description file     (application new)
  --company <name>       (application new)
  --role <title>         (application new)
  --mode <mode>          ${MODES.join(" | ")}   (default: ${DEFAULT_MODE})
  -h, --help

Examples:
  resume-toolkit build frontend --formats md,docx
  resume-toolkit application new 2026-08-01-acme-backend --jd jd.txt --company Acme
  resume-toolkit application check 2026-08-01-acme-backend
  resume-toolkit gaps
  resume-toolkit promote role.acme.apis "Owned the public HTTP surface."
`;

const FLAGS = {
  "--profile": "profile",
  "--applications": "applications",
  "--out": "out",
  "--formats": "formats",
  "--basename": "basename",
  "--jd": "jd",
  "--company": "company",
  "--role": "role",
  "--mode": "mode",
};

function parseArgs(argv) {
  const options = {
    profile: "profile.yaml",
    applications: "applications",
    formats: FORMATS,
    basename: "resume",
  };
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else if (FLAGS[arg]) {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      options[FLAGS[arg]] =
        arg === "--formats" ? value.split(",").map((f) => f.trim()).filter(Boolean) : value;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  return { options, positional };
}

function reportCheck(id, report) {
  console.log(`${id} — mode: ${report.mode}`);
  console.log(`  requirements: ${report.covered}/${report.requirements} covered`);

  if (report.gaps.length > 0) {
    console.log(`\n  GAPS (${report.gaps.length}) — nothing in your profile supports these:`);
    report.gaps.forEach((g) => console.log(`    · ${g.text ?? g.id}`));
  }

  if (report.unsourced.length > 0) {
    console.log(`\n  UNSOURCED (${report.unsourced.length}) — no entry backs this text:`);
    report.unsourced.forEach((u) => console.log(`    · ${u.text}`));
  }

  if (report.errors.length > 0) {
    console.log(`\n  DEFECTS (${report.errors.length}):`);
    report.errors.forEach((e) => console.log(`    · ${e}`));
  }

  if (report.ok && report.gaps.length === 0 && report.unsourced.length === 0) {
    console.log("  ✓ every requirement covered, every bullet sourced");
  }
}

async function applicationCommand(sub, args, options) {
  switch (sub) {
    case "list": {
      const ids = listApplications(options.applications);
      console.log(ids.length ? ids.join("\n") : "(none yet)");
      break;
    }

    case "new": {
      const [id] = args;
      if (!id) throw new Error("application new needs an id, e.g. 2026-08-01-acme-backend");

      const application = createApplication({
        id,
        company: options.company,
        role: options.role,
        createdAt: new Date().toISOString().slice(0, 10),
        mode: options.mode ?? DEFAULT_MODE,
      });

      if (!options.jd) throw new Error("application new needs --jd <path> — the posting is the point");
      const jd = fs.readFileSync(options.jd, "utf8");

      const dir = saveApplication(options.applications, application, { jd });
      console.log(`Created ${dir}`);
      console.log("Next: have your agent fill in requirements and selection, then `application check`.");
      break;
    }

    case "check": {
      const [id] = args;
      if (!id) throw new Error("application check needs an id");
      const profile = loadProfile(options.profile);
      const report = checkApplication(profile, loadApplication(options.applications, id));
      reportCheck(id, report);
      if (!report.ok) process.exitCode = 1;
      break;
    }

    case "render": {
      const [id] = args;
      if (!id) throw new Error("application render needs an id");
      const { files, report } = await buildApplication({
        profilePath: options.profile,
        applicationsDir: options.applications,
        id,
        outDir: options.out,
        formats: options.formats,
        basename: options.basename,
      });

      // Gaps do not block rendering, but they are printed first — the point is
      // that you see them, not that they stop you.
      if (report.gaps.length > 0 || report.unsourced.length > 0) reportCheck(id, report);
      files.forEach((f) => console.log(`  ${f}`));
      break;
    }

    default:
      throw new Error(`Unknown application command: ${sub ?? "(none)"}`);
  }
}

async function main() {
  const { options, positional } = parseArgs(process.argv.slice(2));
  const [command, ...rest] = positional;
  const args = rest;

  if (options.help || !command) {
    console.log(USAGE);
    process.exit(options.help ? 0 : 1);
  }

  switch (command) {
    case "list":
      console.log(listPresets(loadProfile(options.profile)).join("\n"));
      break;

    case "build": {
      const results = await buildPresets({
        profilePath: options.profile,
        outDir: options.out ?? "dist",
        presets: rest,
        formats: options.formats,
        basename: options.basename,
      });
      for (const { preset, files } of results) {
        console.log(`${preset}: ${files.length} file(s)`);
        files.forEach((f) => console.log(`  ${f}`));
      }
      break;
    }

    case "application":
      await applicationCommand(rest[0], rest.slice(1), options);
      break;

    case "promote": {
      const [entry, ...rest] = args;
      const text = rest.join(" ");
      if (!entry || !text) throw new Error('promote needs an entry id and the wording, e.g. promote role.acme.apis "..."');
      const result = promotePhrasing(options.profile, entry, text);
      console.log(
        result.promoted
          ? `✓ ${entry} now has ${result.phrasings} phrasing(s); added at index ${result.index}`
          : `· already phrasing ${result.index} of ${entry} — nothing to do`,
      );
      break;
    }

    case "pick-rate": {
      const r = pickRate(options.applications);
      if (r.applications === 0) {
        console.log("No applications yet.");
        break;
      }
      console.log(`Across ${r.applications} application(s):\n`);
      console.log(`  reused an existing phrasing   ${r.picked}`);
      console.log(`  written fresh                 ${r.rewritten}`);
      if (r.unsourced) console.log(`  unsourced                     ${r.unsourced}`);
      if (r.unstamped) console.log(`  unmeasured (no origin)        ${r.unstamped}`);
      console.log(
        r.pickRate === null
          ? "\n  Nothing measurable yet."
          : `\n  Pick rate: ${(r.pickRate * 100).toFixed(0)}% — below ~30% after ten applications means\n  the phrasing library is not covering how postings actually differ.`,
      );
      break;
    }

    case "gaps": {
      const { total, gaps } = aggregateGaps(options.applications);
      if (total === 0) {
        console.log("No applications yet.");
        break;
      }
      if (gaps.length === 0) {
        console.log(`No gaps across ${total} application(s).`);
        break;
      }
      console.log(`Across ${total} application(s):\n`);
      for (const gap of gaps) {
        console.log(`  ${String(gap.count).padStart(3)} / ${total}  ${gap.label}`);
      }
      break;
    }

    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  process.exit(1);
});
