# codigng-workflow

A Claude Code plugin marketplace for one development workflow. Two plugins:
`software-factory` runs a feature through separate spec, dev, QA and review
agents with evidence at every step; `contextly` keeps each repository's
durable context (what it is, how it is wired, why) accurate over time. They
are designed to run together: the factory's agents read the context store the
other plugin maintains.

## Stack

Markdown for commands, agents and skills; Bash for the factory's scripts and
hooks; Python 3 (stdlib only) for the factory's checkers and the contextly
engine. Nothing to install beyond `git` and `python3`.

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
- Contextly without a session: `python3 plugins/contextly/scripts/contextly.py status`
  and `... check`, both with `--json`

## Also here

- `architecture.md`: how each plugin is wired and how the two coexist
- `conventions.md`: how commands, agents, hooks and scripts are written, and
  the checks to run before committing
- `decisions.md`: the decision log
- `README.md`: the user-facing description of the marketplace
