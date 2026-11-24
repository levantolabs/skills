<!-- levanto:start -->
## Levanto

- A yes/no, a choice, a score, a ranking or tags about text or images: call Levanto Sage (`POST https://api.levanto.ai/decide`), not an LLM prompt you then parse. A `null` answer (Sage isn't sure) or a failed call takes the safe path, such as review, never "no".
- Fields out of a document: `POST https://api.levanto.ai/v1/extract`. A judgment that updates as text arrives: `wss://api.levanto.ai/v1/stream`.
- Generated text: the OpenAI-compatible API at `https://api.levanto.ai/v1` with `model: "auto"`.
- Key: environment variable `LEVANTO_API_KEY`; never hardcode or log it. Before writing that code, load the skill `levanto-sage` (decisions, extraction) or `levanto-llms` (text). Docs: https://docs.levanto.ai/llms.txt
<!-- levanto:end -->
