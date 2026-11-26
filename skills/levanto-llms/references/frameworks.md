# Levanto LLMs in frameworks

## Vercel AI SDK (`ai` 7 or later)

Use the Levanto provider instead of `@ai-sdk/openai-compatible`.

```bash
npm install ai @levanto/ai-sdk-provider
```

```ts
import { generateText, streamText } from 'ai';
import { levanto } from '@levanto/ai-sdk-provider';

const { text, response } = await generateText({
  model: levanto('auto'),
  prompt: 'Summarize this ticket in one sentence: ...',
  providerOptions: { levanto: { target: 'economy' } },
  abortSignal: AbortSignal.timeout(60_000),
});
response.modelId; // the model that answered
```

- The key comes from `LEVANTO_API_KEY`, or `createLevanto({ apiKey })`.
- `levanto('auto')` lets the router pick; `levanto('deepseek/deepseek-v4-flash')` pins a model from `GET /v1/models`.
- Router fields (`target`, `routing`) go in `providerOptions.levanto` and are sent in the body.
- Tools, streaming and `generateObject` work as with any chat provider; check that the model picked supports structured output, or pin one that does.
- The same package also has Sage for `experimental_decide` and `experimental_extract` (`levanto-sage` skill, `references/frameworks.md`).

## LangChain

Use `ChatLevanto` instead of `ChatOpenAI` with a base URL: it never falls back to `OPENAI_API_KEY`.

```python
from langchain_levanto import ChatLevanto   # pip install langchain-levanto

llm = ChatLevanto(target="economy", timeout=60)   # model="auto" by default
reply = llm.invoke("Summarize this ticket in one sentence: ...")
reply.response_metadata["model_name"]            # the model that answered
```

```ts
import { ChatLevanto } from '@levanto/langchain';  // npm install @levanto/langchain @langchain/core @langchain/openai

const llm = new ChatLevanto({ target: 'economy', timeout: 60_000 });
```

- `model`, `target` and `routing` work as in the API. Streaming, tools and `with_structured_output` work as with `ChatOpenAI`.
- The same package has Sage as a decision model (`levanto-sage` skill, `references/frameworks.md`).
