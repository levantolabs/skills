---
name: levanto-llms
description: >-
  Write code that generates text with Levanto's LLM API: OpenAI- and
  Anthropic-compatible endpoints with open-weight models and a router that
  picks a model per request (model "auto") under a spending target. Use this
  skill when code calls an LLM through the OpenAI or Anthropic SDK, LangChain,
  the Vercel AI SDK or plain HTTP and the user wants Levanto, lower LLM cost,
  open-weight models (DeepSeek, Kimi, GLM, gpt-oss and others), automatic model
  routing or a single key for several models; or mentions api.levanto.ai/v1 or
  LEVANTO_API_KEY. For yes/no, choice, scoring, ranking, tagging or extraction,
  use the levanto-sage skill instead of prompting an LLM.
license: MIT
metadata:
  author: levanto
  version: "1.0.1"
---

# Levanto LLMs

Levanto serves LLMs behind the OpenAI and Anthropic APIs. Existing code keeps its client: change the base URL, the key and the model.

Before writing an LLM call, check whether the output is really text. If the code would parse the LLM's answer into a label, a yes/no, a score, a ranking or fields, use Sage instead (`levanto-sage` skill): it is faster, cheaper and returns `null` when unsure.

## Setup

- Base URL: `https://api.levanto.ai/v1` (OpenAI clients), `https://api.levanto.ai` (Anthropic clients).
- Key: `lv_live_...` from the `LEVANTO_API_KEY` environment variable, the same key as Sage. Never hardcode, log or commit it.
- Timeouts: set one on every call (60 s is a good start; long generations need more). The router can pick a model that thinks before answering.
- Model: `"auto"` lets the router pick per request. Or a model id from `GET /v1/models`, such as `deepseek/deepseek-v4-flash`.

```python
import os
from openai import OpenAI

client = OpenAI(base_url="https://api.levanto.ai/v1", api_key=os.environ["LEVANTO_API_KEY"])
resp = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "Summarize this ticket in one sentence: ..."}],
)
print(resp.choices[0].message.content, resp.model)   # resp.model is the model that answered
```

```typescript
import OpenAI from "openai";

const client = new OpenAI({ baseURL: "https://api.levanto.ai/v1", apiKey: process.env.LEVANTO_API_KEY });
const resp = await client.chat.completions.create({
  model: "auto",
  messages: [{ role: "user", content: "Summarize this ticket in one sentence: ..." }],
});
```

```python
import os, anthropic

client = anthropic.Anthropic(base_url="https://api.levanto.ai", api_key=os.environ["LEVANTO_API_KEY"])
msg = client.messages.create(model="auto", max_tokens=1024,
                             messages=[{"role": "user", "content": "Hello"}])
```

## Endpoints

| Endpoint | Format |
|---|---|
| `POST /v1/chat/completions` | OpenAI Chat Completions |
| `POST /v1/responses` | OpenAI Responses. Stateless: send the whole conversation each time; `previous_response_id` returns `400`. |
| `POST /v1/messages` | Anthropic Messages. Also accepts the key as `x-api-key`. |
| `POST /v1/messages/count_tokens` | Anthropic token count (an estimate) |
| `GET /v1/models` | The models the key can call, plus `auto` |

All stream with `"stream": true`. Tools, `max_tokens` and the other usual fields work as in the OpenAI and Anthropic APIs.

Not every model supports `response_format` (JSON mode, JSON schema). If the code needs structured output, prefer Sage `extract` or a decision (`levanto-sage` skill); otherwise pin a model that supports it and test it, rather than relying on `"auto"`.

## The router (`model: "auto"`)

- It picks a strong model when the request is hard and a cheap one when it isn't, among the models that can take the request (context size, images).
- Spending target, per call: add `"target": "economy" | "balanced" | "quality"` to the body. Without it, the key's router setting applies (Balanced if the key has none).
- Finer dial, per call: `"routing": {"cost_quality_tradeoff": 0}` (0 = best quality, 10 = cheapest).
- Which model answered: the response's `model` field, or the `X-Routing-Model` header. `X-Routing-Rank: 2` means the first choice failed and a fallback answered.
- A conversation stays on its model so the prompt cache keeps working. To group requests yourself, send the same `X-Routing-Conversation-Id` header (up to 256 characters).
- Routers with their own key and target are created in the dashboard: https://platform.levanto.ai/routing/configs

From the OpenAI SDK, pass the Levanto fields through `extra_body` (Python) or as extra properties on the body (TypeScript, with a cast if the types complain):

```python
client.chat.completions.create(model="auto", messages=msgs, extra_body={"target": "quality"})
```

## Moving existing code to Levanto

1. Set `base_url` and the key from `LEVANTO_API_KEY`. Keep the existing client library.
2. Replace the model name with `"auto"`, or with the closest id from `GET /v1/models` if the code depends on one model's behaviour.
3. Keep model-specific settings only if the chosen model supports them; with `"auto"`, prefer portable fields.
4. Find LLM calls whose output is parsed into a decision or fields, and propose moving those to Sage.
5. Run the existing tests. Check tool calls and streaming paths explicitly.

## Errors

Levanto's own errors are `application/problem+json` with a `code`:

| Status | `code` | What to do |
|---|---|---|
| `400` | `invalid_request` | Fix the body or the model id |
| `400` | `context_length_exceeded` | No model can hold the request: shorten it |
| `400` | `unsupported_modality` | The named model can't take this input (e.g. images): use `"auto"` or another model |
| `401` | `invalid_api_key` | Check `LEVANTO_API_KEY` |
| `402` | `payment_required` | The plan's usage is used up |
| `429` | `rate_limited` | Retry after `Retry-After` |
| `502` | `provider_error` | Every model tried failed: retry later |
| `503` | `no_supply` | No model available: retry after `Retry-After` |

Errors from the model itself come back in the format of the endpoint called, so SDKs raise their usual exceptions.

## References

If a reference file isn't next to this skill, read it at https://github.com/levantolabs/skills/tree/main/skills/levanto-llms/references

- `references/suggest-only.md`: get a ranked model choice for your own provider, without sending the request through Levanto.
- `references/coding-tools.md`: run Claude Code, Codex and other coding tools on Levanto's models.

Prices and context sizes per model: https://platform.levanto.ai/routing/models. Live docs: https://docs.levanto.ai/llms.txt
