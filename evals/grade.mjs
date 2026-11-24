#!/usr/bin/env node
// Grades a run file: machine checks on the produced files, plus one isolated
// `claude -p --model sonnet` call per run for the judged expectations.
//
//   node evals/grade.mjs evals/results/<name>.runs.json [--parallel 3] [--no-judge]
//
// Writes evals/results/<name>.json (raw, graded).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { EVALS, RUNS_DIR, loadTasks, runChecks, sageChoice, runClaude, pool, readJson } from "./lib.mjs";

const argv = process.argv.slice(2);
const runsPath = argv.find((a) => !a.startsWith("--"));
if (!runsPath) { console.error("usage: grade.mjs <name>.runs.json"); process.exit(1); }
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const parallel = Math.min(3, Number(opt("parallel", 3)));
const judge = !argv.includes("--no-judge");
const model = opt("model", "sonnet");

const tasksDoc = loadTasks();
const run = readJson(runsPath);
const graderDir = join(RUNS_DIR, "_grader");
mkdirSync(graderDir, { recursive: true });

const SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, pass: { type: "boolean" }, reason: { type: "string" } },
        required: ["id", "pass", "reason"],
      },
    },
  },
  required: ["results"],
};

function filesOf(rec) {
  const proj = join(rec.job_dir, "project");
  return rec.changed_files.map((f) => ({ path: f.path, content: readFileSync(join(proj, f.path), "utf8") }));
}

function graderPrompt(task, rec, diff) {
  const exp = task.judged.map((j) => `- ${j.id}: ${j.text}`).join("\n");
  return `You are grading code written by a coding agent. Be strict: an expectation passes only if the code clearly satisfies it. If the agent produced no relevant code, every expectation fails.

The developer asked the agent:
"""${task.prompt}"""

Context: "Levanto Sage" is an HTTP API (POST https://api.levanto.ai/decide, /decide/batch, /v1/extract, wss://api.levanto.ai/v1/stream) that returns typed decisions or extracted fields and returns null when unsure. Levanto's LLM API is OpenAI-compatible at https://api.levanto.ai/v1 with model "auto". Judge only the expectations below, not style.

Expectations:
${exp}

The agent's changes (git diff against the starting project; large diffs are truncated):
\`\`\`diff
${diff.length > 80000 ? diff.slice(0, 80000) + "\n[...truncated]" : diff || "(no changes)"}
\`\`\`

Return JSON only: {"results": [{"id": "<expectation id>", "pass": true|false, "reason": "<one sentence>"}]} with one entry per expectation id, in order.`;
}

function parseJudge(stdout) {
  let r;
  try { r = JSON.parse(stdout); } catch { return { error: "grader output not JSON" }; }
  const cost = r.total_cost_usd ?? 0;
  let obj = r.structured_output ?? null;
  if (!obj && typeof r.result === "string") {
    const m = r.result.match(/\{[\s\S]*\}/);
    if (m) { try { obj = JSON.parse(m[0]); } catch {} }
  }
  return { obj, cost, model: Object.keys(r.modelUsage ?? {}), is_error: r.is_error };
}

let judgeCost = 0;
const graded = await pool(run.records, parallel, async (rec) => {
  if (rec.skipped) return rec;
  const task = tasksDoc.tasks.find((t) => t.id === rec.task);
  const files = filesOf(rec);
  const checks = runChecks(task, files, tasksDoc.macros);
  const choice = sageChoice(task, files, tasksDoc);
  const out = { ...rec, checks, choice };
  out.checks_passed = checks.filter((c) => c.pass).length;
  out.checks_total = checks.length;
  out.chose_sage = task.should_use_sage ? choice.used_sage && !choice.used_llm : null;
  out.avoided_sage = task.category === "negative" ? choice.produced_code && !choice.used_sage : null;
  out.right_skill = rec.levanto_skills_loaded.includes(task.expected_skill);
  out.skill_triggered = rec.levanto_skills_loaded.length > 0;

  if (judge && task.judged?.length) {
    const diff = existsSync(join(rec.job_dir, "diff.patch")) ? readFileSync(join(rec.job_dir, "diff.patch"), "utf8") : "";
    const args = ["-p", graderPrompt(task, rec, diff), "--model", model, "--output-format", "json",
      "--tools", "", "--json-schema", JSON.stringify(SCHEMA), "--max-budget-usd", "0.5"];
    let parsed = null;
    for (let attempt = 0; attempt < 2 && !parsed?.obj; attempt++) {
      const { stdout } = await runClaude({ cwd: graderDir, args, timeoutMs: 240_000 });
      parsed = parseJudge(stdout);
      judgeCost += parsed.cost ?? 0;
    }
    const byId = Object.fromEntries((parsed?.obj?.results ?? []).map((x) => [x.id, x]));
    out.judged = task.judged.map((j) => ({ id: j.id, text: j.text, pass: byId[j.id]?.pass ?? false, reason: byId[j.id]?.reason ?? "grader gave no verdict", graded: !!byId[j.id] }));
    out.judge_cost_usd = parsed?.cost ?? 0;
    out.judge_model = parsed?.model ?? [];
  }
  out.judged_passed = (out.judged ?? []).filter((j) => j.pass).length;
  out.judged_total = (out.judged ?? []).length;
  console.log(`graded ${rec.id}: checks ${out.checks_passed}/${out.checks_total} judged ${out.judged_passed}/${out.judged_total}`);
  return out;
});

const name = basename(runsPath).replace(/\.runs\.json$/, "");
const outPath = join(EVALS, "results", `${name}.json`);
writeFileSync(outPath, JSON.stringify({ ...run, records: graded, judge_cost_usd: judgeCost, graded_at: new Date().toISOString() }, null, 2));
console.log(`judge cost $${judgeCost.toFixed(3)}; wrote ${outPath}`);
