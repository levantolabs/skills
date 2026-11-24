# Batch

## Decisions: `POST /decide/batch`

`requests` is a list of groups. Each group is one `content` and the `questions` about it. Batching saves round trips, not tokens: content is still counted once per question.

```json
{"reasoning": "auto",
 "requests": [
   {"content": "Selling verified Instagram accounts, DM for bulk pricing.", "questions": [
      {"id": "violates", "kind": "yesno", "instructions": "Does this post violate marketplace policy?"},
      {"id": "action", "kind": "choice", "instructions": "What should moderation do?",
       "options": [{"option": "remove"}, {"option": "warn"}, {"option": "allow"}]}]},
   {"content": "doc B", "questions": [{"id": "b1", "kind": "yesno", "instructions": "Urgent?"}]}]}
```

`results[i].answers[j]` matches `requests[i].questions[j]`. Check `ok` on each answer: `result` holds the decision, `error` the message. One failed question doesn't fail the others.

```json
{"results": [
   {"answers": [
      {"ok": true, "result": {"id": "violates", "kind": "yesno", "result": {"answer": "yes", "probability": 0.995}}},
      {"ok": true, "result": {"id": "action", "kind": "choice", "result": {"chosen": "remove", "probability": 0.9488, "probabilities": ["..."]}}}]},
   {"answers": [{"ok": true, "result": {"id": "b1", "kind": "yesno", "result": {"answer": "no", "probability": 0.1839}}}]}],
 "meta": {"model": "levanto-sage-2", "request_count": 2, "question_count": 3, "latency_ms": 611.8, "usage": {"input_tokens": 308, "output_tokens": 19}}}
```

- Top-level `reasoning` applies to every question. `grounding` goes on each question.
- `meta.usage` and `meta.latency_ms` cover the whole call.

## Extraction: `POST /v1/extract/batch`

Up to 64 `contents` with one `extract`. Each result is `{"ok": true, "values", "results"}` or `{"ok": false, "error"}`.

```json
{"contents": ["Two oat lattes and a croissant, pickup at 8:15 for Dana.", "One flat white for Marco, pickup at 9:30."],
 "extract": {"customer": "the name of the customer", "pickup_time": {"type": "time"}, "items": ["an item ordered"]}}
```
