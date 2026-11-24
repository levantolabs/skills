#!/usr/bin/env node
// Checks every skill against the Agent Skills spec and our own rules.
// Run: node scripts/check.mjs   (exit code 1 on any problem)
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const problems = [];
const fail = (where, msg) => problems.push(`${where}: ${msg}`);

const skillsDir = join(root, "skills");
const versions = new Set();

for (const dir of readdirSync(skillsDir)) {
  const path = join(skillsDir, dir, "SKILL.md");
  if (!existsSync(path)) { fail(dir, "missing SKILL.md"); continue; }
  const text = readFileSync(path, "utf8");
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm) { fail(dir, "no frontmatter"); continue; }
  const name = fm[1].match(/^name:\s*(.+)$/m)?.[1].trim();
  if (name !== dir) fail(dir, `name "${name}" must equal the folder name`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name ?? "") || (name ?? "").length > 64) fail(dir, "name must be lowercase-hyphen, at most 64 chars");
  const descBlock = fm[1].match(/^description:\s*(>-?\n(?:[ \t]+.*\n?)+|.+)$/m)?.[1] ?? "";
  const desc = descBlock.replace(/^>-?\n/, "").split("\n").map((l) => l.trim()).join(" ").trim();
  if (!desc) fail(dir, "missing description");
  if (desc.length > 1024) fail(dir, `description is ${desc.length} chars (max 1024)`);
  const version = fm[1].match(/version:\s*"?([\d.]+)"?/)?.[1];
  versions.add(version);
  const lines = text.split("\n").length;
  if (lines > 500) fail(dir, `SKILL.md is ${lines} lines (max 500)`);
  // Every reference file mentioned must exist, and every reference file must be mentioned.
  const mentioned = new Set([...text.matchAll(/references\/([\w.-]+\.md)/g)].map((m) => m[1]));
  const refDir = join(skillsDir, dir, "references");
  const present = existsSync(refDir) ? new Set(readdirSync(refDir)) : new Set();
  for (const m of mentioned) if (!present.has(m)) fail(dir, `mentions references/${m}, which doesn't exist`);
  for (const p of present) if (!mentioned.has(p)) fail(dir, `references/${p} is never mentioned in SKILL.md`);
  // No secrets: a real-looking key must never appear.
  for (const f of [path, ...[...present].map((p) => join(refDir, p))]) {
    if (/lv_live_[0-9a-f]{16,}/.test(readFileSync(f, "utf8"))) fail(f, "contains what looks like a real key");
  }
}

// All manifests carry the same version as the skills.
const manifests = [".claude-plugin/plugin.json", ".codex-plugin/plugin.json", ".cursor-plugin/plugin.json", ".antigravity-plugin/plugin.json", "plugin.json"];
for (const m of manifests) {
  const p = join(root, m);
  if (!existsSync(p) || !statSync(p).isFile()) { fail(m, "missing"); continue; }
  const v = JSON.parse(readFileSync(p, "utf8")).version;
  versions.add(v);
}
if (versions.size !== 1) fail("versions", `skills and manifests disagree: ${[...versions].join(", ")}`);

if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join("\n"));
  process.exit(1);
}
console.log(`✓ ${readdirSync(skillsDir).length} skills and ${manifests.length} manifests OK (version ${[...versions][0]})`);
