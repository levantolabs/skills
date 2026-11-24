# Set up Levanto in this project

You are a coding agent. The user asked you to set up Levanto. Follow these steps in order, tell the user briefly what you did at each step, and ask before anything not listed here.

Levanto has two parts: **Sage**, a fast API that returns typed decisions (yes/no, choice, scale, sort, tags) and extracts fields from documents; and **LLMs**, an OpenAI- and Anthropic-compatible API with a router (`model: "auto"`) and open-weight models. One key works for both.

## 1. The key

The code reads the key from the `LEVANTO_API_KEY` environment variable. Never print, log or commit it, and never repeat it back in chat.

- If the user's message contains a key (`lv_live_...`), write it to the project's `.env` as `LEVANTO_API_KEY=<key>`, creating `.env` if needed.
- Otherwise, if `LEVANTO_API_KEY` is already set in the environment or in `.env`, use it.
- Otherwise, ask the user to create a key at https://platform.levanto.ai/intelligence/keys and add it to `.env` themselves, then continue. Don't ask them to paste it in chat.

Make sure `.env` is listed in `.gitignore`.

## 2. Install the skills and the project note

If Node.js 18+ is available, run:

```bash
npx -y levanto@latest init --yes
```

It installs the two Levanto skills for the agents it detects and adds a short Levanto section to `AGENTS.md`. If that command is unavailable or fails, do it by hand:

1. Install the skills: `npx skills add levantolabs/skills`. Without Node, download https://github.com/levantolabs/skills/archive/refs/heads/main.tar.gz and copy its `skills/levanto-sage` and `skills/levanto-llms` folders into `.agents/skills/`, and also into `.claude/skills/` if this project uses Claude Code.
2. Add the section from https://raw.githubusercontent.com/levantolabs/skills/main/AGENTS-snippet.md to `AGENTS.md` (create it if missing). If the project has a `CLAUDE.md`, add it there too. Keep the `<!-- levanto:start -->` and `<!-- levanto:end -->` markers so it can be updated later.

## 3. Check it works

Make one decision with the key (don't print the key):

```bash
curl -s https://api.levanto.ai/decide \
  -H "Authorization: Bearer $LEVANTO_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"content": "I was charged twice, please refund one of them.", "question": {"id": "refund", "kind": "yesno", "instructions": "Is the customer asking for money back?"}}'
```

A working key returns `"answer": "yes"` with a `probability`. `401` means the key is wrong; `402` means the plan's usage is used up.

## 4. Find where Levanto fits

Read the codebase and list, with file and line, the places where Levanto would help. Look for:

- LLM calls whose answer is parsed into a label, a yes/no, a score, a ranking or fields: Sage does these faster and cheaper, and says when it isn't sure.
- Hand-written rules, regexes or keyword lists that try to understand text: intent, sentiment, urgency, spam, policy checks.
- Places that route, triage, approve, block or escalate based on what a message or document says.
- Agent actions that should be checked before they run.
- Text being parsed for names, dates, amounts or lists.
- LLM calls that could move to Levanto's API with `model: "auto"` to cut cost.

For each, give one line: what Levanto would do there and which endpoint. Then ask the user which to build. Change no application code until they pick.

## Reference

- Docs: https://docs.levanto.ai (index for agents: https://docs.levanto.ai/llms.txt; add `.md` to any page for Markdown)
- Skills source: https://github.com/levantolabs/skills
