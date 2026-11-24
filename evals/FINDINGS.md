# Eval findings, round 1 (2026-11-24)

Claude Code, Sonnet (`claude-sonnet-5-5`), 10 tasks × 3 configurations × 1 run, isolated from user settings and plugins (see README). Total spend $2.21.

| | none | skills | skills+snippet |
|---|---|---|---|
| Skill loaded | 0/10 | 10/10 | 10/10 |
| Machine checks | 25% | 99% | 97% |
| Graded expectations | 0/16 | 15/16 | 15/16 |
| Chose Sage when it should | 0/7 | 7/7 | 7/7 |
| Avoided Sage on the negative control | 0/1 (no code) | 1/1 | 1/1 |
| Average cost / time | $0.062 / 21 s | $0.066 / 15 s | $0.061 / 14 s |

## Findings and what changed (skills 1.0.1)

1. **The snippet's effect is not measured yet.** Both skill configurations hit the ceiling. Every scaffold's `.env.example` names `LEVANTO_API_KEY`, which hints at Levanto (6 of 20 skill runs read it). With the snippet the skill loaded first in 7/10 runs, against 5/10 without. Next round: run with `--no-key-hint`. Changed: the snippet now says "Before writing that code, load the skill …".
2. **Without the skills, agents can't find Levanto.** Web search found no docs; agents wrote keyword rules for all 7 judgment tasks and no code for the LLM tasks. This is a discoverability problem for the docs, not the skills.
3. **A failed call wasn't treated like `null`.** On the contract task, `null` went to legal, but an API error skipped the check. Changed: `levanto-sage` says a failed call takes the same safe path as `null` when the decision gates an action, and to read the key outside the `try`. The snippet says the same in one line.
4. **`levanto-llms` gaps.** One run used `response_format` with `model: "auto"`; no LLM run set a timeout. Changed: a Timeouts line in Setup, and a note that not every model supports `response_format`.
5. **The `null` check regex was too strict.** The three machine-check misses with skills were correct code (`chosen or DEFAULT`, `applies !== false`, `answer in (...)`); the grader passed them. Fix the regex in `grade.mjs` before the next round.
