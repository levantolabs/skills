# Sage in frameworks

Use these only when the project already uses the framework. Otherwise call the HTTP API.

## Vercel AI SDK (`ai` 7 or later)

```bash
npm install ai @levanto/ai-sdk-provider
```

The provider reads the key from `LEVANTO_API_KEY` (or `createLevanto({ apiKey })`).

### Decisions

```ts
import { experimental_decide as decide } from 'ai';
import { levanto } from '@levanto/ai-sdk-provider';

const { answers } = await decide({
  model: levanto.decisionModel('sage-latest'),
  state: ticketText,
  questions: {
    refund: { type: 'boolean', instructions: 'Is the customer asking for money back?' },
    team: { type: 'choice', criteria: { billing: 'Charges and refunds', technical: 'Bugs and outages' } },
    urgency: { type: 'score', criteria: ['Can wait', 'This week', 'Today'] },
  },
});

answers.refund.probability; // P(yes)
answers.team.choice;        // 'billing'
answers.urgency.score;      // fractional level, 0 to 2
```

- Question types: `boolean`, `choice` (2–256 options), `score` (2–26 levels). Up to 64 questions per call.
- Answers never come back `null`. Compare `probability` with a threshold and send the unsure middle to a person. If the code needs Sage's own `null`, call `POST /decide` instead.
- Text and JSON state only. For images, call `POST /decide` (`images.md`).
- Sage's options go in `providerOptions: { levanto: { reasoning, grounding, tags, sort } }`. `reasoning: 'auto'` needs a timeout above 10 s.

### Extraction

```ts
import { experimental_extract as extract } from 'ai';
import { levanto } from '@levanto/ai-sdk-provider';

const { answers } = await extract({
  model: levanto.extractionModel('sage-latest'),
  state: contractText,
  fields: {
    tenant: { type: 'text', instructions: 'The company renting' },
    term: { type: 'duration', unit: 'months', integer: true },
    signed: { type: 'date' },
    rent: { type: 'number', unit: 'EUR' },
    contacts: { type: 'list', items: 'text', instructions: 'A contact person' },
  },
});

answers.term.value; // 36, or null when the text doesn't say
```

- A field the text doesn't state has `value: null`; `pNull` is the probability it's absent.
- A `number` with a currency `unit` (`EUR`, `USD`, `$`…) is read as money. An amount in another currency gives `value: null` and the amount in `guess`; the stated currency is in `providerMetadata.levanto.currency`.
- `source` gives the offsets of the value in the state, for highlighting.
- `referenceDate` and other units are ignored (the result has a warning).

## LangChain (Python `langchain-core` 1.8+, JS `@langchain/core` 1.5+)

```bash
pip install langchain-levanto          # Python
npm install @levanto/langchain         # TypeScript, with @langchain/core and @langchain/openai
```

```python
from langchain_core.decisions import Choice, Noul
from langchain_levanto import LevantoDecisionModel

response = LevantoDecisionModel().invoke({
    "state": messages_or_text,
    "questions": {
        "refund": Noul(instructions="Is the customer asking for money back?"),
        "team": Choice(instructions="Which team?", criteria={"billing": "Charges", "technical": "Bugs"}),
    },
})
response.nouls["refund"].noul    # P(yes)
response.choices["team"].choice
```

- `LevantoDecisionModel` is a LangChain `BaseDecisionModel`: `Noul`, `Choice`, `Score`. No `Box`, no images.
- Answers never come back `null`: compare the probability with a threshold.
- Pass it as `classifier` to LangChain's `AutoModeMiddleware` (blocks risky tool calls) or `ModelRouterMiddleware` (picks a model per run). In TypeScript: `autoModeMiddleware`, `modelRouterMiddleware`.
- Options: `reasoning` (`"off"`, `"auto"`, `"on"`), `grounding`, `timeout`.

Extraction (0.2.0+) is a LangChain tool:

```python
from langchain_levanto import LevantoExtractTool

invoices = LevantoExtractTool(fields={"vendor": "the company issuing the invoice", "total": {"type": "money"}})
invoices.extract(text)["values"]               # {"vendor": ..., "total": {"amount": ..., "currency": ...}}
create_agent(model, tools=[invoices])          # or give it to an agent
```

- Fields as in `/v1/extract`. Without `fields`, the agent picks them on each call. A value is `None` (JS `null`) when the text doesn't state it.
- In an agent, the tool message is the values plus each field's source text and probability; the full response is its `artifact`.
