---
name: levanto-sage
description: >-
  Write code that calls Levanto Sage, a fast API that answers a question about
  content with a typed result instead of text: yes/no, a choice among options,
  a score on a scale, a ranking, or tags, each with a confidence and null when
  unsure; plus extraction of typed fields from documents and decisions that
  update over streaming text. Use this skill whenever code needs to classify,
  route, approve, block, triage, moderate, score, rank, tag, detect intent,
  check a policy, gate an agent's action, or pull fields out of text or images,
  including when the user would otherwise prompt an LLM and parse its answer,
  or mentions Levanto, Sage, api.levanto.ai or LEVANTO_API_KEY. For generating
  text, use the levanto-llms skill instead.
license: MIT
metadata:
  author: levanto
  version: "1.0.1"
---

# Levanto Sage

Sage takes content and a question and returns a decision your code can branch on, in about 100–300 ms. It is not a chat model: it never writes prose, and it returns `null` when it isn't sure, so the code can send that case to a person.

Use Sage when the output is a judgment. Use an LLM (see the `levanto-llms` skill) when the output is text.

| The code needs | Use |
|---|---|
| A yes/no, one option out of several, a score, an order, or labels | Sage `POST /decide` |
| Values out of a document (names, dates, amounts, lists) | Sage `POST /v1/extract` |
| A judgment that updates as a call or chat goes on | Sage `wss://.../v1/stream` |
| Written text: a reply, a summary, code | An LLM, `levanto-llms` |

## Setup

- Base URL: `https://api.levanto.ai`. Use the user's URL if they give one.
- Key: `lv_live_...`, read from the `LEVANTO_API_KEY` environment variable and sent as `Authorization: Bearer <key>`. Never hardcode, log or commit it, and never put it in browser code except for the streaming case in `references/stream.md`. If the variable is missing, tell the user to create a key at https://platform.levanto.ai and add it to `.env`.
- There is no SDK. Call the HTTP API with the project's HTTP client (`fetch`, `httpx`, `requests`…). Wrap it in one small function the rest of the code calls.

## Request and response

```json
{
  "content": "Refund request: order #4411, charged twice for the same item.",
  "question": {"id": "is_refund", "kind": "yesno", "instructions": "Is the customer asking for money back?"}
}
```

```json
{"id": "is_refund", "kind": "yesno", "result": {"answer": "yes", "probability": 0.994}, "meta": {"model": "levanto-sage-2", "latency_ms": 112.4}}
```

`content` is a string, `{"kind": "text", "value": "..."}`, a list for Sort, or an image (`references/images.md`). `id` is your own key for the answer.

## The five decision kinds

| `kind` | Question also takes | `result` |
|---|---|---|
| `yesno` | — | `answer`: `"yes"`, `"no"` or `null`; `probability`: P(yes), always set |
| `choice` | `options`: 2–120 × `{"option", "description"}` | `chosen` (or `null`), `probability`, `probabilities` per option |
| `scale` | `levels`: 2–26 × `{"level": <whole number>, "description"}` | `expectation` (fractional level), `confidence`, `probabilities` per level |
| `sort` | nothing else (content is the list) | `sorted`: item ids, best first; `confidence` |
| `tags` | `tags`: 1–120 × `{"id", "name"}` | `tags`: each `{"id", "probability", "applies"}`, `applies` is `true`, `false` or `null` |

Choice:

```json
{"content": "Vendor contract, automatic renewal, uncapped customer liability.",
 "question": {"id": "contract", "kind": "choice", "instructions": "How should legal handle this contract?",
   "options": [{"option": "approve", "description": "Standard terms"},
               {"option": "revise", "description": "Fine with clause changes"},
               {"option": "escalate", "description": "Unusual or high-risk terms"}]}}
```

Sort (the content is a list):

```json
{"content": {"kind": "list", "value": [{"id": "typo", "content": "Typo on the FAQ page."}, {"id": "db_down", "content": "Production database unreachable."}]},
 "question": {"id": "triage", "kind": "sort", "instructions": "Most urgent first."}}
```

Scale and Tags requests: see `references/decision-kinds.md`.

## Acting on the answer

Every branch must handle `null`. It means Sage isn't sure; send it to a person, a slower path or a safe default. Never treat `null` as "no".

```python
import os, httpx

SAGE = os.environ.get("LEVANTO_BASE_URL", "https://api.levanto.ai")
HEADERS = {"Authorization": f"Bearer {os.environ['LEVANTO_API_KEY']}"}

def decide(content, question, **extra):
    r = httpx.post(f"{SAGE}/decide", headers=HEADERS, timeout=15,
                   json={"content": content, "question": question, **extra})
    r.raise_for_status()
    return r.json()["result"]

result = decide(ticket_text, {"id": "is_refund", "kind": "yesno",
                              "instructions": "Is the customer asking for money back?"})
if result["answer"] is None:
    send_to_review_queue(ticket)
elif result["answer"] == "yes":
    start_refund_flow(ticket)
else:
    answer_normally(ticket)
```

```typescript
const SAGE = process.env.LEVANTO_BASE_URL ?? "https://api.levanto.ai";

async function decide(content: unknown, question: object, extra: object = {}) {
  const res = await fetch(`${SAGE}/decide`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.LEVANTO_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content, question, ...extra }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Sage ${res.status}: ${await res.text()}`);
  return (await res.json()).result;
}
```

When the decision gates something (a refund, a deletion, a send), a failed call (timeout, `402`, `429`, `5xx`) must take the same safe path as `null`, never the "no" branch. Read the key outside the `try`, so a missing key fails loudly instead of routing everything to the default.

Use `probability` only when the workflow needs a stricter bar than Sage's own answer (for example, act automatically only above 0.95). For Choice read `chosen`; for Tags read each tag's `applies`.

## Extract

`POST /v1/extract`. The shape of `extract` is the shape of the answer in `values`.

```json
{"content": "INVOICE 2026-117 ... Total due: 540.00 EUR. Due date: 21 November 2026",
 "extract": {"vendor": "the company issuing the invoice",
             "total": {"type": "money"},
             "due_date": {"type": "date"},
             "products": ["a product or service billed"]}}
```

```json
{"values": {"vendor": "Nordlicht GmbH", "total": {"amount": 540.0, "currency": "EUR"}, "due_date": "2026-11-21", "products": ["Espresso machine service", "Descaling kit"]},
 "results": {"...": "per-field text, offsets and probability"}, "meta": {"...": "..."}}
```

- A field is a description string, `{"type", "definition"}`, or a one-item list for every mention.
- Types: `text` (default), `integer`, `decimal`, `money`, `date`, `time`, `duration`.
- A value is `null` when the text doesn't state it or Sage isn't sure. Handle it like a decision's `null`.
- Many documents with the same fields: `POST /v1/extract/batch` with `contents` (up to 64).
- Details and limits: `references/extract.md`.

## Writing good questions

- Put the rule in `instructions`, the way you'd brief a careful colleague. Put the facts it needs in `content`.
- Describe every Choice option and every Scale level in one line. Without a description, an option is judged on its name alone.
- For Tags, give each tag a `name` with its meaning ("spam: bulk or repeated posting; one genuine offer isn't spam"). Similar tags are judged against each other, so say what doesn't count.
- "Does anything apply?" is a Yes/No first. "Exactly one of N" is a Choice, not Tags.
- Several questions about the same content: one `POST /decide/batch` call (`references/batch.md`). It saves round trips, not tokens.
- Hard multi-step rules (long policies, arithmetic): add `"reasoning": "auto"` and a timeout above 10 s (`references/reasoning-and-grounding.md`).

## In production

- Timeouts: 15 s for plain decisions; above 10 s plus margin with reasoning.
- `402`: the plan's usage is used up. `429`: retry after `Retry-After`. `503`: retry with backoff. `400`: the message says which field is wrong; don't retry.
- Log the decision's `id`, `result` and `meta.latency_ms`, never the key.
- Test with real examples from the user's data, including ones that should come back `null`.
- Check a key works: `curl -s https://api.levanto.ai/decide -H "Authorization: Bearer $LEVANTO_API_KEY" -H 'Content-Type: application/json' -d '{"content":"I want my money back","question":{"id":"t","kind":"yesno","instructions":"Is this a refund request?"}}'`

## References

Read the one that matches the task before writing that part of the code:

If a reference file isn't next to this skill, read it at https://github.com/levantolabs/skills/tree/main/skills/levanto-sage/references

- `references/decision-kinds.md`: full Scale and Tags requests and every response shape.
- `references/batch.md`: many questions or documents in one call.
- `references/stream.md`: decisions over a live transcript or chat, over WebSocket.
- `references/reasoning-and-grounding.md`: reasoning modes and web search before deciding.
- `references/images.md`: deciding on screenshots and photos.
- `references/extract.md`: field types, batch, limits.
- `references/errors-and-limits.md`: status codes, size limits, pricing.

Live docs: https://docs.levanto.ai/llms.txt (append `.md` to any docs page for Markdown).
