#!/usr/bin/env node
// Turns a graded results file into Markdown: one summary table across configs, then a
// per-task breakdown.
//
//   node evals/report.mjs evals/results/<name>.json      -> evals/results/<name>.md
import { writeFileSync } from "node:fs";
import { loadTasks, readJson } from "./lib.mjs";

const path = process.argv[2];
if (!path) { console.error("usage: report.mjs <name>.json"); process.exit(1); }
const data = readJson(path);
const tasksDoc = loadTasks();
const taskById = Object.fromEntries(tasksDoc.tasks.map((t) => [t.id, t]));
const recs = data.records.filter((r) => !r.skipped);
const configs = data.configs;

const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : "–");
const frac = (a, b) => (b ? `${a}/${b} (${pct(a, b)})` : "–");
const sum = (xs, f) => xs.reduce((s, x) => s + (f(x) ?? 0), 0);
const avg = (xs, f) => (xs.length ? sum(xs, f) / xs.length : 0);

const lines = [];
lines.push(`# Levanto skills eval: ${data.name}`, "");
const models = [...new Set(recs.flatMap((r) => r.models_used ?? []))];
const judgeModels = [...new Set(recs.flatMap((r) => r.judge_model ?? []))];
lines.push(`- Runs: ${recs.length} (${data.records.length - recs.length} skipped); tasks: ${data.tasks.length}; configs: ${configs.join(", ")}`);
const initModels = [...new Set(recs.map((r) => r.model_reported).filter(Boolean))];
lines.push(`- Task model (session init): ${initModels.join(", ") || "?"} (requested \`${data.model_requested}\`); all models billed: ${models.join(", ")} (Claude Code uses haiku internally, e.g. for WebSearch); grader: ${judgeModels.join(", ") || "none"}`);
lines.push(`- Runs with no code produced: ${recs.filter((r) => !r.choice?.produced_code).map((r) => r.id).join(", ") || "none"}`);
lines.push(`- Spend: tasks $${sum(recs, (r) => r.cost_usd).toFixed(2)} + grading $${(data.judge_cost_usd ?? 0).toFixed(2)} = $${(sum(recs, (r) => r.cost_usd) + (data.judge_cost_usd ?? 0)).toFixed(2)}`);
lines.push(`- Isolation problems: ${recs.filter((r) => r.isolation_problems?.length).length} runs`);
lines.push("");

lines.push("## Summary", "");
lines.push("| Metric | " + configs.join(" | ") + " |");
lines.push("|---|" + configs.map(() => "---").join("|") + "|");
const rows = [
  ["Levanto skill loaded (any)", (rs) => frac(rs.filter((r) => r.skill_triggered).length, rs.length)],
  ["Right skill loaded", (rs) => frac(rs.filter((r) => r.right_skill).length, rs.length)],
  ["Machine checks passed", (rs) => frac(sum(rs, (r) => r.checks_passed), sum(rs, (r) => r.checks_total))],
  ["Runs with every check passing", (rs) => frac(rs.filter((r) => r.checks_passed === r.checks_total).length, rs.length)],
  ["Graded expectations passed", (rs) => frac(sum(rs, (r) => r.judged_passed), sum(rs, (r) => r.judged_total))],
  ["Chose Sage when it should (7 tasks)", (rs) => { const x = rs.filter((r) => r.chose_sage !== null); return frac(x.filter((r) => r.chose_sage).length, x.length); }],
  ["…of those, Levanto not named in the prompt", (rs) => { const x = rs.filter((r) => r.chose_sage !== null && !taskById[r.task].mentions_levanto); return frac(x.filter((r) => r.chose_sage).length, x.length); }],
  ["Avoided Sage on the negative control (and wrote code)", (rs) => { const x = rs.filter((r) => r.avoided_sage !== null); return frac(x.filter((r) => r.avoided_sage).length, x.length); }],
  ["Used Levanto at all (api.levanto.ai / key)", (rs) => frac(rs.filter((r) => r.choice?.used_levanto).length, rs.length)],
  ["Avg cost per run", (rs) => `$${avg(rs, (r) => r.cost_usd).toFixed(3)}`],
  ["Avg time per run", (rs) => `${(avg(rs, (r) => r.duration_ms) / 1000).toFixed(0)} s`],
  ["Avg turns", (rs) => avg(rs, (r) => r.num_turns).toFixed(1)],
];
for (const [label, f] of rows) lines.push(`| ${label} | ` + configs.map((c) => f(recs.filter((r) => r.config === c))).join(" | ") + " |");
lines.push("");
lines.push("Skill loaded = the transcript has a `Skill` tool call for `levanto-sage`/`levanto-llms`, or a `Read` of a file under `.claude/skills/levanto-*/`. Machine checks are regexes on the final content of the files the agent added or changed (see `tasks.json`).", "");

lines.push("## Per task", "");
lines.push("| Task | Kind | Levanto in prompt | Config | Skill loaded | Checks | Graded | Sage choice | Cost | Time | Failed checks / expectations |");
lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
for (const t of tasksDoc.tasks) {
  for (const c of configs) {
    for (const r of recs.filter((x) => x.task === t.id && x.config === c)) {
      const failed = [...(r.checks ?? []).filter((k) => !k.pass).map((k) => k.id), ...(r.judged ?? []).filter((j) => !j.pass).map((j) => `*${j.id}*`)];
      const sage = r.chose_sage === null ? (r.avoided_sage === null ? (r.choice?.used_sage ? "used Sage ✗" : "–") : (r.avoided_sage ? "avoided ✓" : (r.choice?.produced_code ? "used Sage ✗" : "no code ✗"))) : (r.chose_sage ? "✓" : (r.choice?.used_llm ? "LLM ✗" : "✗"));
      lines.push(`| ${t.id} | ${t.category} | ${t.mentions_levanto ? "yes" : "no"} | ${c} | ${r.levanto_skills_loaded.join(", ") || "–"} | ${r.checks_passed}/${r.checks_total} | ${r.judged_passed}/${r.judged_total} | ${sage} | $${r.cost_usd.toFixed(2)} | ${(r.duration_ms / 1000).toFixed(0)}s | ${failed.join(", ") || "–"} |`);
    }
  }
}
lines.push("", "Italic ids are graded expectations; the rest are machine checks.", "");

const skipped = data.records.filter((r) => r.skipped);
if (skipped.length) lines.push(`Skipped (budget): ${skipped.map((r) => r.id).join(", ")}`, "");

const out = path.replace(/\.json$/, ".md");
writeFileSync(out, lines.join("\n"));
console.log(`wrote ${out}`);
