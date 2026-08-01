#!/usr/bin/env node
// src/cli.js — resume-toolkit command line.

import { loadProfile, listPresets } from "./profile.js";
import { buildPresets, FORMATS } from "./build.js";

const USAGE = `resume-toolkit — build resumes from a Master Profile

Usage:
  resume-toolkit build [preset...]   Render presets (default: all of them)
  resume-toolkit list                List the presets in the profile

Options:
  --profile <path>    Master Profile to read       (default: profile.yaml)
  --out <dir>         Directory to write into      (default: dist)
  --formats <list>    Comma-separated: ${FORMATS.join(",")}  (default: all)
  --basename <name>   Filename stem for output     (default: resume)
  -h, --help          Show this message

Examples:
  resume-toolkit list --profile src/data/profile.yaml
  resume-toolkit build frontend backend --formats md,docx
`;

function parseArgs(argv) {
  const options = {
    profile: "profile.yaml",
    out: "dist",
    formats: FORMATS,
    basename: "resume",
  };
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${arg} needs a value`);
      return v;
    };

    switch (arg) {
      case "-h":
      case "--help":
        options.help = true;
        break;
      case "--profile":
        options.profile = value();
        break;
      case "--out":
        options.out = value();
        break;
      case "--basename":
        options.basename = value();
        break;
      case "--formats":
        options.formats = value().split(",").map((f) => f.trim()).filter(Boolean);
        break;
      default:
        if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
        positional.push(arg);
    }
  }

  return { options, positional };
}

async function main() {
  const { options, positional } = parseArgs(process.argv.slice(2));
  const [command, ...presets] = positional;

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
        outDir: options.out,
        presets,
        formats: options.formats,
        basename: options.basename,
      });
      for (const { preset, files } of results) {
        console.log(`${preset}: ${files.length} file(s)`);
        files.forEach((f) => console.log(`  ${f}`));
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
