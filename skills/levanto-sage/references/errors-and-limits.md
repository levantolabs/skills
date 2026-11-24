# Errors, limits and pricing

## Status codes

| HTTP | Meaning | What the code should do |
|---|---|---|
| `400` | Invalid request or a limit below. The `detail` names the field. | Fix the request; don't retry. |
| `401` | Missing or invalid key. | Check `LEVANTO_API_KEY`. |
| `402` | This period's included usage is used up. | Stop and alert; retrying won't help until the next period or an upgrade. |
| `413` | Extraction content too long. | Split the document. |
| `429` | Too many requests. | Retry after `Retry-After`. |
| `503` | Loading or temporarily unavailable. | Retry with backoff. |

`GET /ready` needs no key: `200` ready, `503` loading.

## Limits

| Kind | Field | Min | Max |
|---|---|---:|---:|
| choice | `options` | 2 | 120 (20 with an image) |
| scale | `levels` | 2 | 26 (distinct whole numbers) |
| sort | `content.value` items | 2 | 120 |
| tags | `tags` | 1 | 120 |

A decision request (content, instructions, options and any search results) must fit the plan's context: about 32K tokens, or 128K on Growth. Oversized requests fail; they are never truncated.

## Pricing

Each plan includes usage each month. Calls are charged per input token, output token and search at the plan's rates (current rates: https://docs.levanto.ai/pricing.md).

- **Input:** everything Sage reads. A decision counts its content once per question (ten questions on one document count it ten times), once per tag for Tags, once per item for Sort.
- **Output:** what extraction and streaming send back, plus thinking when Sage reasons. A decision's answer is free.
- **Search:** each grounding search that runs.
- `meta.usage` reports the tokens. `POST /usage/estimate` (same body as `/decide`) predicts them without running.
