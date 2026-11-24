# Extract

`POST /v1/extract` returns typed values from `content`. The shape of `extract` is the shape of `values`.

```json
{"content": "INVOICE 2026-117\nNordlicht GmbH, Hafenstrasse 4, Hamburg\nBill to: Acme Ltd\n\n2 x Espresso machine service: 480.00 EUR\n1 x Descaling kit: 60.00 EUR\nTotal due: 540.00 EUR\nDue date: 21 November 2026",
 "extract": {"vendor": "the company issuing the invoice",
             "total": {"type": "money", "definition": "the amount payable"},
             "due_date": {"type": "date"},
             "products": ["a product or service billed"]}}
```

```json
{"values": {"vendor": "Nordlicht GmbH", "total": {"amount": 540.0, "currency": "EUR"}, "due_date": "2026-11-21", "products": ["Espresso machine service", "Descaling kit"]},
 "results": {"total": {"value": {"amount": 540.0, "currency": "EUR"}, "text": "540.00 EUR", "start": 157, "end": 167, "probability": 0.9863, "probabilities": ["..."]}},
 "meta": {"model": "levanto-sage-2", "usage": {"input_tokens": 265, "output_tokens": 440}, "latency_ms": 127.3}}
```

## Fields

- A field is a definition string (`""` if the name says it all), `{"type", "definition"}`, or a one-item list (`["an item ordered"]`) for every mention.
- `extract` can also be a question string, or `["a question"]` for every answer to it.
- Types: `text` (default), `integer`, `decimal`, `money` (`{amount, currency}`), `date` (`YYYY-MM-DD`), `time` (`HH:MM`, plus the offset when a zone is written), `duration` (ISO 8601, e.g. `P3Y`).
- Values come only from what the text states. Don't ask for computed values (for "due date = issue date + 30 days", extract both parts and compute in code).

## Results

- `values[field]` is `null` when the field is absent or too close to call. Treat it like a decision's `null`.
- `results[field]` adds `text`, `start`/`end` (offsets into `content`), `probability`, and `probabilities` (the candidates, then `null`; they sum to 1). Use it to highlight the source text or to apply a stricter bar.

## Batch

`POST /v1/extract/batch`: up to 64 `contents`, one `extract`. Each result is `{"ok": true, "values", "results"}` or `{"ok": false, "error"}`.

## Limits

- 64 fields. Field names up to 256 characters, no double quotes or line breaks.
- Content plus definitions up to 16,384 tokens, else `413`: split the document.
- `429`: retry after `Retry-After`.
- Output tokens are charged (the values sent back), so ask only for the fields you need.
