# Reasoning and grounding

## Reasoning

Top-level `reasoning` on `/decide` and `/decide/batch`:

- `off` (default): answer right away. Fastest and cheapest; right for most calls.
- `auto`: reason only when the question needs it (long policy text, multi-step rules, arithmetic).
- `on`: always reason, up to a few seconds, when accuracy matters more than speed.

With `auto` or `on`, set client timeouts above 10 seconds.

```json
{"content": "Refund request: $180 order, bought 41 days ago, box unopened. Policy: refunds within 30 days; store credit up to 60 days if unopened.",
 "question": {"id": "refund_ok", "kind": "yesno", "instructions": "Should we issue a cash refund?"},
 "reasoning": "auto"}
```

`meta.reasoning`:

```json
{"fired": true, "ran": true, "finished": true, "tokens": 312, "limited": null}
```

- `ran`: Sage reasoned. `finished`: `false` if it was cut short (`limited`: `cap`, `timeout` or `budget`); Sage still answers.
- `tokens`: thinking tokens, charged as output.

## Grounding (web search)

Add `grounding` to a Yes/No, Choice, Scale or Tags request to search the web before deciding. Use it for recent or factual questions the content doesn't answer. Not with images.

```json
{"content": "Has there been a major Cloudflare incident this month?",
 "question": {"id": "incident", "kind": "yesno", "instructions": "Is this likely true?"},
 "grounding": {"trigger": "low_confidence", "confidence_floor": 0.8}}
```

- `trigger`: `low_confidence` (default: search only when Sage is less sure than `confidence_floor`, default `0.80`), `always`, or `never`.
- Search can turn a `null` into an answer. The response adds `grounding_meta` (`triggered`, `queries`, `sources`).
- Each search that runs is charged at the plan's search rate, plus tokens.
- In `/decide/batch`, `grounding` goes on each question.
