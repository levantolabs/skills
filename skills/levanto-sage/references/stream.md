# Stream: decisions over growing text

`wss://api.levanto.ai/v1/stream` (WebSocket). Send the questions once, append text as it arrives (a call transcript, a chat), and get a `decision` frame whenever an answer changes. Use it when the judgment must follow a live conversation; for a finished document, use `/decide`.

## Frames you send

```json
{"type": "start", "questions": [{"id": "agreed", "kind": "yesno", "instructions": "Has the customer agreed to go ahead?"}]}
{"type": "append", "text": "Customer: OK, 48 months then. Send me the quote.\n"}
{"type": "close"}
```

- `start`: 1–32 questions in the `/decide/batch` question format, each with an `id`. Optional: `content` (text so far), `reasoning`, `emit` (`changes`, the default, sends a frame only when an answer changes; `all` sends one per update).
- `append`: new text only. Text can only be appended. Don't wait for a frame before appending the next piece.
- Also: `questions` (replace the question set), `evaluate` (force an update), `ping`, `close`.

## Frames you get

```json
{"type": "decision", "seq": null, "chars": 115, "latency_ms": 117.9,
 "answers": {"agreed": {"id": "agreed", "kind": "yesno", "result": {"answer": "yes", "probability": 0.9848}}},
 "changed": ["agreed"],
 "usage": {"update": 3, "input_tokens": 68, "output_tokens": 155}}
```

Read `changed`, then `answers[id].result`. Ignore `ping` and `sig` frames.

## Auth

- Server code: `Authorization: Bearer <key>` header on the upgrade request.
- Browsers can't set headers: put `"api_key"` in the `start` frame. This exposes the key to the page, so only do it with a key meant for that client, or proxy the socket through your server.

## Python

```python
import asyncio, json, os
from websockets.asyncio.client import connect

async def watch(lines):
    async with connect("wss://api.levanto.ai/v1/stream",
                       additional_headers={"Authorization": f"Bearer {os.environ['LEVANTO_API_KEY']}"}) as ws:
        await ws.send(json.dumps({"type": "start", "questions": [
            {"id": "escalate", "kind": "yesno", "instructions": "Does the customer ask for a human agent?"}]}))

        async def feed():
            for line in lines:                 # in production: each line as it arrives
                await ws.send(json.dumps({"type": "append", "text": line}))
            await ws.send(json.dumps({"type": "close"}))

        feeder = asyncio.create_task(feed())
        async for raw in ws:
            frame = json.loads(raw)
            if frame["type"] == "decision":
                for qid in frame["changed"]:
                    print(qid, frame["answers"][qid]["result"])
        await feeder
```

## Limits and reconnects

- An `append` past 16,384 tokens (text plus questions) is refused with `prompt_too_long`; the session stays open.
- On `draining` (close code 1012), reconnect and `start` again with the full text in `content`.
- 300 s without traffic closes the socket.
- Billing: each update counts the new text plus the questions as input; each decision frame counts as output. Keep questions short.
