# codigng-workflow

A Claude Code plugin marketplace for one development workflow. Two plugins:
`software-factory` runs a feature through separate spec, dev, QA and review
agents with evidence at every step; `contextly` keeps each repository's
durable context (what it is, how it is wired, why) accurate over time. They
are designed to run together: the factory's agents read the context store the
other plugin maintains. A third, optional plugin, `workflow-ui`, is a mod (a
hooks module) that shows both in the session and changes nothing.

## Stack

Markdown for commands, agents and skills; Bash for the factory's scripts and
hooks; Python 3 (stdlib only) for the factory's checkers and the contextly
engine; TypeScript (TSX) for the `workflow-ui` mod, run by Claude Code itself
with no build step. Nothing to install beyond `git` and `python3`.

## Layout

| Path | Responsibility |
| --- | --- |
| `.claude-plugin/marketplace.json` | Marketplace manifest: name, owner, the plugin list |
| `plugins/software-factory/` | The factory plugin |
| `plugins/software-factory/skills/run/SKILL.md` | The orchestrator: gates, subagent calls, hard checks |
| `plugins/software-factory/agents/` | `factory-spec`, `factory-dev`, `factory-qa`, `factory-reviewer` |
| `plugins/software-factory/hooks/` | Per-agent PreToolUse guards (soft layer) |
| `plugins/software-factory/scripts/` | Worktrees, run state, evidence capture, verdict and path checks (hard layer) |
| `plugins/software-factory/templates/` | Spec, plan, summary, verdict and lean-rules templates |
| `plugins/contextly/` | The context plugin |
| `plugins/contextly/commands/` | `init`, `update`, `decide`, `check`, `commit` |
| `plugins/contextly/hooks/hooks.json` | Registers the one hook, SessionStart |
| `plugins/contextly/scripts/contextly.py` | Engine: `digest`, `status`, `check` |
| `plugins/workflow-ui/` | The optional mod: band, pane, status line |
| `plugins/workflow-ui/hooks/register.tsx` | Hooks module: polls, subagent observation, drawing, `/factory` |
| `plugins/workflow-ui/hooks/runs.ts` | Pure helpers: run files and tool calls to views |
| `plugins/workflow-ui/types/index.d.ts` | The mod's `$.state` contract |
| `.context/` | This repository's own context store |

## Entry points

- Install: `/plugin marketplace add Lu1sR/codigng-workflow`, then
  `/plugin install software-factory@codigng-workflow` and
  `/plugin install contextly@codigng-workflow`
- Local development of a plugin: `claude --plugin-dir ./plugins/<name>`
- Factory: `/software-factory:run <task>`, `/software-factory:status`,
  `/software-factory:clean <run-id>`
- Contextly: `/contextly:init` once per repo, then `/contextly:update`,
  `/contextly:decide`, `/contextly:check`, `/contextly:commit`
- workflow-ui (optional): `/plugin install workflow-ui@codigng-workflow`, then
  `/factory` or `/factory agents`; the band and status line need no command
- Contextly without a session: `python3 plugins/contextly/scripts/contextly.py status`
  and `... check`, both with `--json`

## Also here

- `architecture.md`: how each plugin is wired and how the two coexist
- `conventions.md`: how commands, agents, hooks and scripts are written, and
  the checks to run before committing
- `decisions.md`: the decision log
- `README.md`: the user-facing description of the marketplace
