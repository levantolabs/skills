# Decision kinds: full requests and responses

All go to `POST /decide`. Every response is `{ "id", "kind", "result", "meta" }`.

## Yes/No

```json
{"content": "Email draft promises \"guaranteed 40% returns\" and calls the product \"risk-free\".",
 "question": {"id": "needs_review", "kind": "yesno", "instructions": "Does this copy need compliance review before send?"}}
```

```json
{"id": "needs_review", "kind": "yesno", "result": {"answer": "yes", "probability": 0.9997}, "meta": {"model": "levanto-sage-2", "latency_ms": 79.1}}
```

- `answer`: `"yes"`, `"no"`, or `null` on a near-tie.
- `probability`: P(yes), always returned.

## Choice

```json
{"content": "Vendor contract with automatic renewal and a 90-day termination clause. Liability for the customer is uncapped.",
 "question": {"id": "contract", "kind": "choice", "instructions": "How should legal handle this contract?",
   "options": [{"option": "approve", "description": "Standard terms, no red flags"},
               {"option": "revise", "description": "Acceptable with clause changes"},
               {"option": "escalate", "description": "Unusual or high-risk terms"}]}}
```

```json
{"id": "contract", "kind": "choice",
 "result": {"chosen": "escalate", "probability": 0.8405,
            "probabilities": [{"option": "approve", "probability": 0.0022}, {"option": "revise", "probability": 0.1572}, {"option": "escalate", "probability": 0.8405}]}}
```

- `chosen`: the winning option, or `null` when the top two are too close to call. `probability` is then `null` too.
- `probabilities`: every option in request order; they sum to 1.
- 2–120 options (20 with an image).

## Scale

`levels`: 2–26 distinct whole numbers of your choice (`0`–`4`, `1`–`5`…); anything else returns `400`.

```json
{"content": "Candidate explained the roadmap clearly but struggled with database scaling tradeoffs.",
 "question": {"id": "interview", "kind": "scale", "instructions": "How strong was this technical interview?",
   "levels": [{"level": 0, "description": "Not qualified"}, {"level": 1, "description": "Weak"}, {"level": 2, "description": "Mixed"},
              {"level": 3, "description": "Solid"}, {"level": 4, "description": "Strong hire"}]}}
```

```json
{"id": "interview", "kind": "scale",
 "result": {"expectation": 2.89, "confidence": 0.66,
            "probabilities": [{"level": 0, "probability": 0.0}, {"level": 1, "probability": 0.01}, {"level": 2, "probability": 0.12}, {"level": 3, "probability": 0.84}, {"level": 4, "probability": 0.03}]}}
```

- `expectation`: the expected level (fractional). Round it, or compare it with a threshold.
- `confidence`: how sure Sage is of the score. Scale never returns `null`; use a low `confidence` as the "not sure" signal.

## Sort

`content` is a list of 2–120 items, each `{"id", "content"}`. The question takes only `id`, `kind` and `instructions`; anything else is rejected.

```json
{"content": {"kind": "list", "value": [
   {"id": "typo", "content": "Spelling mistake on the FAQ page."},
   {"id": "db_down", "content": "Production database is unreachable."},
   {"id": "pricing", "content": "Prospect asking about Enterprise pricing."}]},
 "question": {"id": "triage", "kind": "sort", "instructions": "Most urgent first."}}
```

```json
{"id": "triage", "kind": "sort", "result": {"sorted": ["db_down", "pricing", "typo"], "confidence": 0.92}}
```

`confidence` (0–1, or `null`) is how trustworthy the whole order is. No images.

## Tags

Which of 1–120 labels apply. Each tag returns `probability` and `applies` (`true`, `false`, or `null` when too close to call). `null` is not `false`: send it to a person or skip the action that depends on that tag.

```json
{"content": "Forum post: \"I help indie artists grow their streams. First month half price, DM me.\"",
 "question": {"id": "moderate", "kind": "tags", "instructions": "Tag the issues. Members may promote their own work once.",
   "tags": [{"id": "spam", "name": "spam: bulk or repeated posting; a single genuine offer is not spam"},
            {"id": "promotion", "name": "promotion: advertises the poster's own product"},
            {"id": "scam", "name": "scam: deceptive offer, fake results or payment tricks"}]}}
```

```json
{"id": "moderate", "kind": "tags",
 "result": {"tags": [{"id": "spam", "probability": 0.03, "applies": false}, {"id": "promotion", "probability": 1.0, "applies": true}, {"id": "scam", "probability": 0.03, "applies": false}]}}
```

- `instructions` is the rule for when a tag applies.
- `name` is the label plus one line of meaning; `id` is only the key you get back.
- On images, Tags always return `true` or `false`.
