#!/usr/bin/env node
// Runs every task x config x repetition through Claude Code headless, isolated from the
// user's own plugins, skills, CLAUDE.md and MCP servers (see README.md).
//
//   node evals/run.mjs [--tasks a,b] [--configs none,skills,skills+snippet] [--runs 1]
//                      [--parallel 3] [--budget 25] [--timeout 600] [--model sonnet] [--name x]
//
// Writes evals/results/<name>.runs.json; per-run project dirs and transcripts go to $EVAL_RUNS_DIR.
import { cpSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";
import { EVALS, REPO, RUNS_DIR, loadTasks, runClaude, parseStream, isolationProblems, stamp, pool } from "./lib.mjs";

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const CONFIGS = ["none", "skills", "skills+snippet"];
const tasksDoc = loadTasks();
const taskIds = opt("tasks", tasksDoc.tasks.map((t) => t.id).join(",")).split(",");
const configs = opt("configs", CONFIGS.join(",")).split(",");
const runs = Number(opt("runs", 1));
const parallel = Math.min(3, Number(opt("parallel", 3)));
const budget = Number(opt("budget", 25));
const reserve = Number(opt("grading-reserve", 2)); // keep this much for grading
const timeoutMs = Number(opt("timeout", 600)) * 1000;
const model = opt("model", "sonnet");
const name = opt("name", stamp());
// --no-key-hint: drop LEVANTO_API_KEY from the scaffold's .env.example (ablation: does the agent
// still find Levanto when nothing in the project names it?).
const noKeyHint = argv.includes("--no-key-hint");

for (const c of configs) if (!CONFIGS.includes(c)) throw new Error(`unknown config ${c}`);
const tasks = taskIds.map((id) => tasksDoc.tasks.find((t) => t.id === id) ?? (() => { throw new Error(`unknown task ${id}`); })());

const runRoot = join(RUNS_DIR, name);
mkdirSync(runRoot, { recursive: true });
mkdirSync(join(EVALS, "results"), { recursive: true });
const snippet = readFileSync(join(REPO, "AGENTS-snippet.md"), "utf8");

// Tools: file tools + Skill, plus read-only web access to the public docs (a real agent could
// look them up). No Bash, so no package installs, no curl to the API, no subagents.
const TOOLS = "Read,Write,Edit,Glob,Grep,Skill,WebFetch,WebSearch";
const ALLOWED = ["WebFetch(domain:docs.levanto.ai)", "WebSearch"];

const git = (cwd, ...a) => execFileSync("git", a, {
  cwd, encoding: "utf8", maxBuffer: 64 << 20,
  env: { ...process.env, GIT_AUTHOR_NAME: "eval", GIT_AUTHOR_EMAIL: "eval@example.invalid", GIT_COMMITTER_NAME: "eval", GIT_COMMITTER_EMAIL: "eval@example.invalid" },
});

function install(dir, config) {
  if (config === "none") return;
  for (const s of ["levanto-sage", "levanto-llms"]) cpSync(join(REPO, "skills", s), join(dir, ".claude", "skills", s), { recursive: true });
  if (config === "skills+snippet") {
    const p = join(dir, "CLAUDE.md");
    appendFileSync(p, (existsSync(p) ? "\n" : "") + snippet);
  }
}

function changedFiles(dir) {
  git(dir, "add", "-A");
  const status = git(dir, "diff", "--cached", "--name-status", "--no-renames").trim();
  const files = [];
  for (const line of status ? status.split("\n") : []) {
    const [st, path] = line.split("\t");
    if (path.startsWith(".claude/") || path === "CLAUDE.md" || st === "D") continue;
    files.push({ path, status: st, content: readFileSync(join(dir, path), "utf8") });
  }
  const diff = git(dir, "diff", "--cached", "--", ".", ":(exclude).claude", ":(exclude)CLAUDE.md");
  return { files, diff };
}

const jobs = [];
for (const t of tasks) for (const c of configs) for (let r = 1; r <= runs; r++) jobs.push({ task: t, config: c, rep: r });

let spent = 0;
let stopped = false;
const records = [];
const outPath = join(EVALS, "results", `${name}.runs.json`);
const save = () => writeFileSync(outPath, JSON.stringify({ name, model_requested: model, no_key_hint: noKeyHint, runs_dir: runRoot, configs, tasks: taskIds, budget, spent, stopped, records }, null, 2));

console.log(`${jobs.length} runs, parallel ${parallel}, budget $${budget}, runs in ${runRoot}`);
await pool(jobs, parallel, async ({ task, config, rep }) => {
  const id = `${task.id}__${config}__r${rep}`;
  if (stopped || spent >= budget - reserve) {
    stopped = true;
    records.push({ id, task: task.id, config, rep, skipped: "budget" });
    console.log(`SKIP ${id} (spent $${spent.toFixed(2)})`);
    return;
  }
  const jobDir = join(runRoot, id);
  const proj = join(jobDir, "project");
  mkdirSync(jobDir, { recursive: true });
  cpSync(join(EVALS, "scaffolds", task.scaffold), proj, { recursive: true });
  if (noKeyHint) {
    const envp = join(proj, ".env.example");
    if (existsSync(envp)) {
      const kept = readFileSync(envp, "utf8").split("\n").filter((l) => !/LEVANTO/.test(l)).join("\n");
      if (kept.trim()) writeFileSync(envp, kept); else rmSync(envp);
    }
  }
  install(proj, config);
  git(proj, "init", "-q");
  git(proj, "add", "-A");
  git(proj, "commit", "-qm", "scaffold");

  const args = [
    "-p", task.prompt,
    "--model", model,
    "--output-format", "stream-json", "--verbose",
    "--permission-mode", "acceptEdits",
    "--permission-prompts", "none",
    "--tools", TOOLS,
    "--allowedTools", ...ALLOWED,
    "--max-budget-usd", "3",
  ];
  const t0 = Date.now();
  const { code, timedOut, stdout } = await runClaude({
    cwd: proj, args, timeoutMs,
    outFile: join(jobDir, "transcript.jsonl"), errFile: join(jobDir, "stderr.log"),
  });
  const wall = Date.now() - t0;
  const tr = parseStream(stdout);
  const iso = isolationProblems(tr.init, { expectLevanto: config !== "none" });
  const snippetLoaded = config === "skills+snippet"; // verified once in README; CLAUDE.md is outside any scratchpad
  const { files, diff } = changedFiles(proj);
  writeFileSync(join(jobDir, "diff.patch"), diff);
  const cost = tr.result?.total_cost_usd ?? 0;
  spent += cost;
  const rec = {
    id, task: task.id, config, rep, job_dir: jobDir,
    exit_code: code, timed_out: timedOut, wall_ms: wall,
    isolation_problems: iso,
    model_reported: tr.init?.model ?? null,
    models_used: Object.keys(tr.result?.modelUsage ?? {}),
    init_skills: tr.init?.skills ?? [],
    init_tools: tr.init?.tools ?? [],
    skill_calls: tr.skillCalls, skill_reads: tr.skillReads,
    levanto_skills_loaded: tr.levantoSkillsLoaded,
    web_fetches: tr.webFetches, web_searches: tr.webSearches,
    tool_counts: tr.toolCounts,
    cost_usd: cost, duration_ms: tr.result?.duration_ms ?? wall, num_turns: tr.result?.num_turns ?? null,
    result_subtype: tr.result?.subtype ?? null, is_error: tr.result?.is_error ?? true,
    final_text: (tr.finalText ?? "").slice(0, 4000),
    snippet_installed: snippetLoaded,
    changed_files: files.map((f) => ({ path: f.path, status: f.status })),
    diff_chars: diff.length,
  };
  records.push(rec);
  save();
  const flag = iso.length ? ` ISOLATION: ${iso.join("; ")}` : "";
  console.log(`DONE ${id} $${cost.toFixed(3)} ${(rec.duration_ms / 1000).toFixed(0)}s skills=[${rec.levanto_skills_loaded}] files=${files.length}${timedOut ? " TIMEOUT" : ""}${flag}  (total $${spent.toFixed(2)})`);
  if (iso.length) { stopped = true; console.error(`Isolation failed on ${id}; stopping.`); }
});

save();
console.log(`spent $${spent.toFixed(2)}; wrote ${relative(process.cwd(), outPath)}`);
if (records.some((r) => r.isolation_problems?.length)) process.exit(2);
