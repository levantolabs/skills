# Suggest model only

Use this when the code must call models through its own provider accounts, but should still pick the right model per request.

`POST https://api.levanto.ai/v1/routing/rank` takes the request you are about to make and the models you can call, with your prices in dollars per million tokens. It returns them ranked, best first. Nothing is sent to a model.

```json
{"request": {"messages": [{"role": "user", "content": "Summarize this ticket: the customer was charged twice and wants a refund."}]},
 "routing": {"cost_quality_tradeoff": 5,
   "candidates": [
     {"id": "opus@my-provider", "model": "anthropic/claude-opus-5.5", "pricing": {"input": 5, "cache_read": 0.5, "output": 25}},
     {"id": "flash@my-provider", "model": "deepseek/deepseek-v4-flash", "pricing": {"input": 0.1, "cache_read": 0.02, "output": 0.4}}]}}
```

```json
{"object": "routing.ranking",
 "ranked": [
   {"candidate_id": "flash@my-provider", "expected_quality": 0.7765, "expected_cost_usd": 0.0025062,
    "expected_usage": {"input_tokens": 18, "cache_read_tokens": 0, "output_tokens": 6261}},
   {"candidate_id": "opus@my-provider", "expected_quality": 0.8758, "expected_cost_usd": 0.02254,
    "expected_usage": {"input_tokens": 18, "cache_read_tokens": 0, "output_tokens": 898}}]}
```

- `cost_quality_tradeoff`: 0 (best quality) to 10 (cheapest).
- `candidates[].id` is yours; `model` is the model's public id.
- Call `ranked[0]` with your own client; on failure, try `ranked[1]`.
- Same key and auth as the other endpoints.
