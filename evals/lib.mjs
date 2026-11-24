// Shared helpers: isolated Claude Code invocation, transcript parsing, checks.
// No dependencies beyond Node 18+.
import { spawn } from "node:child_process";
import { createWriteStream, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const EVALS = dirname(fileURLToPath(import.meta.url));
export const REPO = join(EVALS, "..");

// Runs must live OUTSIDE any Claude Code session scratchpad: Claude Code refuses to load a
// CLAUDE.md (or AGENTS.md) from a folder laid out like <...>/claude-*/<project>/<session>/scratchpad,
// which would silently turn the skills+snippet config into the skills config.
export const RUNS_DIR = process.env.EVAL_RUNS_DIR ?? "/private/tmp/levanto-skill-evals/runs";

// ---------- isolation ----------

// A minimal environment: enough for Claude Code to find its OAuth login in the macOS keychain,
// nothing else. Drops CLAUDECODE / CLAUDE_CODE_* from a parent session, ANTHROPIC_* and any
// LEVANTO_API_KEY so a real key can never reach a run.
export function cleanEnv() {
  const keep = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "TMPDIR"];
  const env = {};
  for (const k of keep) if (process.env[k]) env[k] = process.env[k];
  env.TERM = "dumb";
  env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = "1";
  return env;
}

// --setting-sources project,local  -> ignore ~/.claude/settings.json (enabledPlugins: typesafe, ...),
//                                     user skills in ~/.claude/skills and ~/.claude/CLAUDE.md
// --strict-mcp-config               -> no MCP servers (claude.ai connectors, plugin MCPs)
// autoMemoryEnabled:false           -> no auto-memory read/write under ~/.claude/projects
export const ISOLATION_ARGS = [
  "--setting-sources", "project,local",
  "--strict-mcp-config",
  "--settings", JSON.stringify({ autoMemoryEnabled: false }),
  "--no-session-persistence",
];

// Skills Claude Code 2.1.x ships built in (seen with an empty CLAUDE_CONFIG_DIR, plus the three
// account-level built-ins ship-local/steward/schedule). Anything else in the init event that is
// not a Levanto skill means user-level contamination and the run is aborted.
export const BUILTIN_SKILLS = new Set([
  "deep-research", "design", "design-sync", "dataviz", "update-config", "verify", "debug",
  "code-review", "simplify", "ship-local", "steward", "batch", "fewer-permission-prompts",
  "doctor", "loop", "schedule", "claude-api", "workflow-authoring", "run", "run-skill-generator",
  "plugin-authoring",
]);
export const LEVANTO_SKILLS = new Set(["levanto-sage", "levanto-llms"]);

export function isolationProblems(init, { expectLevanto }) {
  const problems = [];
  if (!init) return ["no init event in transcript"];
  for (const s of init.skills ?? []) {
    if (LEVANTO_SKILLS.has(s)) continue;
    if (!BUILTIN_SKILLS.has(s)) problems.push(`unexpected skill: ${s}`);
  }
  const lev = (init.skills ?? []).filter((s) => LEVANTO_SKILLS.has(s));
  if (expectLevanto && lev.length !== 2) problems.push(`expected both Levanto skills, got [${lev}]`);
  if (!expectLevanto && lev.length) problems.push(`Levanto skills present in a no-skills config: [${lev}]`);
  for (const p of init.plugins ?? []) if (p.path !== "builtin") problems.push(`non-builtin plugin: ${p.source ?? p.name}`);
  for (const m of init.mcp_servers ?? []) problems.push(`MCP server: ${m.name}`);
  if (init.memory_paths) problems.push(`auto-memory on: ${JSON.stringify(init.memory_paths)}`);
  return problems;
}

// Spawn `claude` with the isolation flags. Streams stdout to `outFile` (if given) and resolves
// with the full stdout text. Kills the process tree after `timeoutMs`.
export function runClaude({ cwd, args, timeoutMs = 600_000, outFile, errFile }) {
  return new Promise((resolve) => {
    const child = spawn("claude", [...args, ...ISOLATION_ARGS], {
      cwd, env: cleanEnv(), stdio: ["ignore", "pipe", "pipe"], detached: true,
    });
    const out = outFile ? createWriteStream(outFile) : null;
    const err = errFile ? createWriteStream(errFile) : null;
    let stdout = "";
    let timedOut = false;
    child.stdout.on("data", (d) => { stdout += d; out?.write(d); });
    child.stderr.on("data", (d) => { err?.write(d); });
    const t = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, "SIGTERM"); } catch {}
      setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} }, 5000);
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(t);
      out?.end(); err?.end();
      resolve({ code, timedOut, stdout });
    });
  });
}

// ---------- transcript parsing (stream-json) ----------

export function parseStream(text) {
  const events = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try { events.push(JSON.parse(line)); } catch {}
  }
  const init = events.find((e) => e.type === "system" && e.subtype === "init") ?? null;
  const result = [...events].reverse().find((e) => e.type === "result") ?? null;
  const toolUses = [];
  for (const e of events) {
    if (e.type !== "assistant") continue;
    for (const b of e.message?.content ?? []) if (b.type === "tool_use") toolUses.push({ name: b.name, input: b.input });
  }
  // Skill signal 1: the Skill tool was called with a Levanto skill.
  const skillCalls = toolUses.filter((u) => u.name === "Skill").map((u) => u.input?.skill ?? u.input?.command ?? JSON.stringify(u.input));
  // Skill signal 2: the agent opened a Levanto skill file directly with Read.
  const skillReads = toolUses
    .filter((u) => u.name === "Read" && /\.claude\/skills\/levanto-(sage|llms)\//.test(u.input?.file_path ?? ""))
    .map((u) => u.input.file_path.replace(/^.*\.claude\/skills\//, ""));
  const webFetches = toolUses.filter((u) => u.name === "WebFetch").map((u) => u.input?.url);
  const webSearches = toolUses.filter((u) => u.name === "WebSearch").map((u) => u.input?.query);
  const levantoSkillsLoaded = new Set();
  for (const s of skillCalls) { const n = String(s).replace(/^\//, "").split(/[\s:]/)[0]; if (LEVANTO_SKILLS.has(n)) levantoSkillsLoaded.add(n); }
  for (const r of skillReads) levantoSkillsLoaded.add(r.split("/")[0]);
  const lastText = [...events].reverse().find((e) => e.type === "assistant" && e.message?.content?.some((b) => b.type === "text"));
  return {
    init, result, toolUses, skillCalls, skillReads, webFetches, webSearches,
    levantoSkillsLoaded: [...levantoSkillsLoaded],
    toolCounts: toolUses.reduce((a, u) => ((a[u.name] = (a[u.name] ?? 0) + 1), a), {}),
    finalText: result?.result ?? lastText?.message.content.filter((b) => b.type === "text").map((b) => b.text).join("\n") ?? "",
  };
}

// ---------- machine checks ----------

const CODE_EXT = /\.(py|ts|tsx|js|jsx|mjs|cjs)$/;

export function loadTasks() {
  return JSON.parse(readFileSync(join(EVALS, "tasks.json"), "utf8"));
}

export function resolveCheck(check, macros) {
  if (!check.use) return check;
  const base = macros[check.use];
  if (!base) throw new Error(`unknown macro ${check.use}`);
  const { use, ...rest } = check;
  return { ...base, ...rest };
}

// files: [{path, content}] = final content of every added/modified file (outside .claude/, CLAUDE.md)
export function runChecks(task, files, macros) {
  const code = files.filter((f) => CODE_EXT.test(f.path));
  return task.checks.map((raw) => {
    const c = resolveCheck(raw, macros);
    let pool = c.scope === "all" || c.id === "no_key" ? files : code;
    if (c.files) pool = pool.filter((f) => new RegExp(c.files).test(f.path));
    const re = new RegExp(c.pattern, c.flags ?? "m");
    const hits = pool.filter((f) => re.test(f.content)).map((f) => f.path);
    let pass;
    if (!code.length) pass = false;                       // no code produced: every check fails
    else if (c.type === "regex") pass = hits.length > 0;
    else if (c.type === "not_regex") pass = hits.length === 0 && (c.files ? pool.length > 0 : true);
    else throw new Error(`unknown check type ${c.type}`);
    return { id: c.id, desc: c.desc, type: c.type, pass, hits };
  });
}

export function sageChoice(task, files, tasksDoc) {
  const code = files.filter((f) => CODE_EXT.test(f.path));
  const sageRe = new RegExp(tasksDoc.sage_endpoint_pattern);
  const llmRe = new RegExp(resolveCheck({ use: "no_llm_for_judgment" }, tasksDoc.macros).pattern);
  const usedSage = code.some((f) => sageRe.test(f.content));
  const usedLlm = code.some((f) => llmRe.test(f.content));
  const usedLevanto = code.some((f) => /api\.levanto\.ai|LEVANTO_API_KEY/.test(f.content));
  return { produced_code: code.length > 0, used_sage: usedSage, used_llm: usedLlm, used_levanto: usedLevanto };
}

export function stamp() {
  return new Date().toISOString().replace(/[:]/g, "").replace(/\..+$/, "Z");
}

export function readJson(p) { return JSON.parse(readFileSync(p, "utf8")); }
export { existsSync };

// Simple promise pool.
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}
