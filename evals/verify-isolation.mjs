#!/usr/bin/env node
// Proves the isolation before a round: runs two cheap sessions (haiku) with exactly the flags the
// harness uses and fails unless
//   1. the init event lists no user/plugin skills, no non-builtin plugins, no MCP servers, no auto-memory;
//   2. the session itself, asked to list its skills, names no user-level skill (typesafe, design:*, ...);
//   3. in skills+snippet, both Levanto skills are listed and the project CLAUDE.md is in context
//      (checked with a codeword), and in none, no Levanto skill is listed.
//
//   node evals/verify-isolation.mjs
import { mkdirSync, rmSync, cpSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { REPO, RUNS_DIR, runClaude, parseStream, isolationProblems } from "./lib.mjs";

const USER_LEVEL = /typesafe|design:|anthropic-skills|create-payment-credential|financial-insights|use-link-identity/i;
let ok = true;

for (const config of ["none", "skills+snippet"]) {
  const dir = join(RUNS_DIR, `_verify-${config}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  if (config !== "none") {
    for (const s of ["levanto-sage", "levanto-llms"]) cpSync(join(REPO, "skills", s), join(dir, ".claude", "skills", s), { recursive: true });
    writeFileSync(join(dir, "CLAUDE.md"), "# Notes\n\nThe project codeword is ZEBRA-42.\n");
  }
  execFileSync("git", ["init", "-q"], { cwd: dir });
  const { stdout } = await runClaude({
    cwd: dir, timeoutMs: 180_000,
    args: ["-p", "Without using any tools: (1) list, one per line, the exact name of every skill you can invoke with the Skill tool; (2) then on a last line write CODEWORD=<the project codeword from your project instructions, or NONE>.",
      "--model", "haiku", "--output-format", "stream-json", "--verbose", "--tools", "Read,Skill"],
  });
  const tr = parseStream(stdout);
  const problems = isolationProblems(tr.init, { expectLevanto: config !== "none" });
  const reply = tr.finalText;
  if (USER_LEVEL.test(reply)) problems.push(`session reports a user-level skill: ${reply.match(USER_LEVEL)[0]}`);
  if (config !== "none" && !/ZEBRA-42/.test(reply)) problems.push("CLAUDE.md not in context (codeword missing)");
  if (config !== "none" && !(/levanto-sage/.test(reply) && /levanto-llms/.test(reply))) problems.push("session does not list both Levanto skills");
  if (config === "none" && /levanto/i.test(reply)) problems.push("session lists a Levanto skill in the none config");
  console.log(`--- ${config}: init skills = ${(tr.init?.skills ?? []).join(", ")}`);
  console.log(`    plugins = ${(tr.init?.plugins ?? []).map((p) => p.source).join(", ")}; mcp = ${(tr.init?.mcp_servers ?? []).length}; memory = ${JSON.stringify(tr.init?.memory_paths)}`);
  console.log(`    reply: ${reply.replace(/\s+/g, " ").slice(0, 400)}`);
  console.log(problems.length ? `    FAIL: ${problems.join("; ")}` : "    OK");
  if (problems.length) ok = false;
}
process.exit(ok ? 0 : 1);
