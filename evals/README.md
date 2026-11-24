# Skill evals

Measures whether a coding agent, given an ordinary feature request, writes code that calls Levanto correctly, and whether it picks Sage (not an LLM prompt it then parses) when the feature is a judgment.

Three configurations:

| Config | Project gets |
|---|---|
| `none` | nothing (baseline) |
| `skills` | `skills/levanto-sage` and `skills/levanto-llms` copied into `.claude/skills/` |
| `skills+snippet` | the skills plus `AGENTS-snippet.md` appended to `CLAUDE.md` |

## Files

- `tasks.json`: 10 tasks (3 decide, 2 extract, 1 stream, 1 batch, 2 LLM, 1 negative control). Each has a one-line prompt that never says "Sage", a scaffold, machine checks (regexes) and 1–2 judged expectations. Five prompts name Levanto, five don't.
- `scaffolds/<task>/`: the starting project for each task.
- `lib.mjs`: isolation flags, transcript parsing, checks.
- `verify-isolation.mjs`: proves the isolation before a round (about $0.01, haiku).
- `run.mjs`: runs task × config × repetition with Claude Code headless.
- `grade.mjs`: machine checks, plus one isolated `claude -p --model sonnet` call per run for the judged expectations, with `--json-schema` for strict pass/fail JSON.
- `report.mjs`: Markdown report.
- `results/<name>.runs.json` (run records), `results/<name>.json` (graded), `results/<name>.md` (report).

## Run

```bash
node evals/verify-isolation.mjs                     # must print OK twice
node evals/run.mjs --name round1                    # all tasks x 3 configs x 1 run, 3 in parallel, stops at $25
node evals/run.mjs --tasks ticket-triage-py --configs skills --name dry   # one run
node evals/grade.mjs evals/results/round1.runs.json
node evals/report.mjs evals/results/round1.json
```

Options for `run.mjs`: `--tasks a,b`, `--configs none,skills,skills+snippet`, `--runs N`, `--parallel ≤3`, `--budget USD` (stops starting runs at budget minus `--grading-reserve`, default $2), `--timeout seconds` (default 600), `--model` (default `sonnet`), `--no-key-hint` (removes `LEVANTO_API_KEY` from the scaffold's `.env.example`, an ablation for discovery without any hint in the project). Every session also has `--max-budget-usd 3`.

Per-run project folders, `transcript.jsonl` (stream-json), `stderr.log` and `diff.patch` go to `$EVAL_RUNS_DIR` (default `/private/tmp/levanto-skill-evals/runs/<name>/<task>__<config>__r<n>/`).

## Isolation

This machine's `~/.claude` has third-party plugins (a `typesafe` plugin whose skill triggers on classification tasks, a synced `design` plugin, `anthropic-skills:*`), user skills in `~/.claude/skills`, and claude.ai MCP connectors. Any of these would contaminate the baseline. Every session (task runs, grader, probe) is started by `runClaude()` in `lib.mjs` like this:

```bash
env -i PATH=… HOME=… USER=… LOGNAME=… SHELL=… LANG=… TMPDIR=… TERM=dumb CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 \
  claude -p "<task>" --model sonnet --output-format stream-json --verbose \
    --permission-mode acceptEdits --permission-prompts none \
    --tools Read,Write,Edit,Glob,Grep,Skill,WebFetch,WebSearch \
    --allowedTools "WebFetch(domain:docs.levanto.ai)" WebSearch \
    --max-budget-usd 3 \
    --setting-sources project,local --strict-mcp-config \
    --settings '{"autoMemoryEnabled":false}' --no-session-persistence
```

- `--setting-sources project,local` skips `~/.claude/settings.json` (so `enabledPlugins` and the `typesafe` plugin never load), the user skills in `~/.claude/skills`, and `~/.claude/CLAUDE.md`. The project's own `.claude/skills/` and `CLAUDE.md` still load.
- `--strict-mcp-config` with no `--mcp-config` drops every MCP server, including the claude.ai connectors.
- `autoMemoryEnabled: false` and `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` turn off auto-memory, so nothing is read from or written to `~/.claude/projects/*/memory`.
- `env -i` with a short allowlist drops `CLAUDECODE`/`CLAUDE_CODE_*` from a parent session and any `ANTHROPIC_*` or `LEVANTO_API_KEY`. Login still works because the OAuth token is in the macOS keychain, found via `HOME`/`USER`.
- Not used: `--bare` (needs `ANTHROPIC_API_KEY`, no OAuth, and skips CLAUDE.md, which the snippet config needs); `--safe-mode` and `--disable-slash-commands` (they also turn off the project skills under test); a fresh `CLAUDE_CONFIG_DIR` (not logged in).

What still loads are Claude Code's own built-in skills (`claude-api`, `dataviz`, `code-review`, …) and built-in plugins (`cc-plugin-*@builtin`). The same list appears with an empty `CLAUDE_CONFIG_DIR`, and every Claude Code user has them, so they are part of a realistic baseline. `claude-api` is the one to watch: its description triggers on LLM-shaped tasks. Every `Skill` call is recorded, whichever skill it names.

How it's verified:

1. `verify-isolation.mjs` checks the `system/init` event against an allowlist: only built-in skills plus, in skills configs, exactly the two Levanto skills; only `builtin` plugins; no MCP servers; no memory path. It also asks the session to list its skills (no `typesafe`, `design:`, `anthropic-skills`, or user skills may appear) and to read back a codeword from the project `CLAUDE.md`, which proves the snippet is in context.
2. `run.mjs` repeats the init-event check on every run and stops the round on the first problem (`isolation_problems` in the record).

### Run folders must be outside the session scratchpad

Claude Code won't load a `CLAUDE.md`/`AGENTS.md` from a folder laid out like a session scratchpad (`…/claude-<uid>/<project>/<session>/scratchpad/…`). The debug log says `not loading …/CLAUDE.md: it … is in a session's scratchpad`. If runs lived there, `skills+snippet` would silently turn into `skills`. That's why runs default to `/private/tmp/levanto-skill-evals/runs`. `/private/tmp`, `/private` and `/` have no `CLAUDE.md`, so no ancestor file leaks in. Don't put runs under `~/Documents/levanto`, which may have its own `CLAUDE.md` higher up.

## Permissions and network

- `--permission-mode acceptEdits` auto-approves file edits inside the project. `--permission-prompts none` denies anything else that would ask.
- `--tools` limits the built-in tools to file tools, `Skill`, `WebFetch` and `WebSearch`. With no Bash, the agent can't install packages, run code or `curl` the API. With no `Task`, it can't start subagents, so every skill load shows up in the transcript.
- `WebFetch` is pre-approved only for `docs.levanto.ai`, so the agent can read the public docs as a real agent would. Every other domain, `api.levanto.ai` included, is denied.
- No key is set. The scaffolds' `.env.example` has an empty `LEVANTO_API_KEY=`.

## Signals

- **Skill loaded**: the stream-json transcript has an assistant `tool_use` with `name: "Skill"` and `input.skill` of `levanto-sage` or `levanto-llms` (the tool result reads `Launching skill: …`), or a `Read` of a file under `.claude/skills/levanto-*/`. Both are recorded separately (`skill_calls`, `skill_reads`).
- **Files produced**: after the run, `git add -A` then `git diff --cached` against the scaffold commit, leaving out `.claude/` and `CLAUDE.md`. The checks read the final content of the added or changed files.
- **Cost, time, model**: `total_cost_usd`, `duration_ms`, `num_turns` and `modelUsage` from the final `result` event. `model` comes from the `init` event.
- **Chose Sage**: for the seven Sage tasks, the code calls `/decide`, `/v1/extract` or `/v1/stream` and has no LLM SDK or chat endpoint. **Avoided Sage**: for the negative control, code was produced and calls no Sage endpoint.
- Machine checks are regexes and therefore strict. `null` requires an explicit `is None`/`=== null` branch, so code that handles null implicitly (`chosen in QUEUES`) fails it. The graded `null_safe` expectation is the semantic check.
