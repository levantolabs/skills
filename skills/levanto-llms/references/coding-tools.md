# Running coding tools on Levanto's models

This is about the coding tool itself using Levanto's models, not about the code it writes.

## Claude Code

Set these before starting `claude`:

```bash
export ANTHROPIC_BASE_URL="https://api.levanto.ai"
export ANTHROPIC_API_KEY="$LEVANTO_API_KEY"
export ANTHROPIC_MODEL="auto"
export ANTHROPIC_SMALL_FAST_MODEL="auto"
```

Anthropic doesn't support Claude Code on non-Claude models; treat it as best effort.

## Codex

Add a provider to `~/.codex/config.toml`:

```toml
model = "auto"
model_provider = "levanto"

[model_providers.levanto]
name = "Levanto"
base_url = "https://api.levanto.ai/v1"
env_key = "LEVANTO_API_KEY"
wire_api = "responses"
```

To pin one model, replace `auto` with an id from `GET /v1/models`, such as `moonshotai/kimi-k3.1-pro`.

## Other tools

Any tool with an "OpenAI-compatible provider" setting works with base URL `https://api.levanto.ai/v1`, the key, and model `auto` or a model id. Tools that need the Responses API use `/v1/responses`; tools that speak Anthropic Messages use base URL `https://api.levanto.ai`.
