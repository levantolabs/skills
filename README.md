# Levanto skills

Agent skills that teach coding agents to build with [Levanto](https://levanto.ai):

| Skill | Use it for |
|---|---|
| [`levanto-sage`](skills/levanto-sage/SKILL.md) | Typed decisions (yes/no, choice, scale, sort, tags), extraction and streaming decisions with Levanto Sage |
| [`levanto-llms`](skills/levanto-llms/SKILL.md) | Text generation through Levanto's OpenAI- and Anthropic-compatible API, with the router and open-weight models |

They follow the open [Agent Skills](https://agentskills.io) format, so they work in Claude Code, Codex, Cursor, GitHub Copilot, Antigravity, opencode, JetBrains Junie, Devin Desktop and other tools that read it.

## Install

The quickest way sets up everything (skills, the `AGENTS.md` section and your key):

```bash
npx levanto init
```

Or ask your agent:

```text
Set up Levanto in this project. Fetch https://docs.levanto.ai/agent-setup.md and follow it.
```

Skills only, for any agent:

```bash
npx skills add levantolabs/skills
```

As a plugin:

| Tool | Command |
|---|---|
| Claude Code | `/plugin marketplace add levantolabs/skills`, then `/plugin install levanto@levanto` |
| GitHub Copilot CLI | `copilot plugin marketplace add levantolabs/skills`, then `copilot plugin install levanto@levanto` |
| Antigravity | `agy plugin install https://github.com/levantolabs/skills` |

## Make sure your agent uses them

Agents don't always load a skill on their own. Add [`AGENTS-snippet.md`](AGENTS-snippet.md) to your project's `AGENTS.md` (or `CLAUDE.md`): five lines that tell the agent when to reach for Levanto. `npx levanto init` does this for you.

## Key

Create a key at [platform.levanto.ai](https://platform.levanto.ai) and put it in `.env` as `LEVANTO_API_KEY`. The skills never ask for the key in chat.

## Docs

[docs.levanto.ai](https://docs.levanto.ai) · [Integrations](https://docs.levanto.ai/integrations)

## License

MIT
