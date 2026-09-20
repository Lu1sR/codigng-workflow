# Conventions

## Plugins

- One directory per plugin under `plugins/`, each with its own
  plugin manifest (`plugins/contextly/.claude-plugin/plugin.json` is one) and README, and registered in
  `.claude-plugin/marketplace.json`. Bump the plugin's `version` in both
  places when its behavior changes.
- Plugin files are referenced through `${CLAUDE_PLUGIN_ROOT}`, never through
  a hardcoded install path. Where a command runs the engine, it says once
  where to find the plugin root if the variable shows up unexpanded.
- README of the marketplace is Spanish (voseo), addressed to the user.
  Commands, agents, skills and code comments are English, addressed to Claude.

## Commands, skills and agents

- Frontmatter carries `description`, `argument-hint` and a scoped
  `allowed-tools`. Read-only commands (`/contextly:check`) must not list
  `Write` or `Edit`: the constraint is enforced there, not asked for in the
  body.
- Structure: numbered phases, imperative voice. Every command states what it
  must **not** do.
- Commands demand evidence: "read the manifest", "grep for the symbol",
  "check the path exists", never "describe the architecture". Where a fact is
  not recoverable, the instruction is to write "not recorded".
- **No AI, Claude or LLM references in anything a command writes into a
  user's repo**: commit messages, merge messages, ADR text, PR bodies.
- Factory agents declare their hooks in frontmatter; the orchestrator skill
  has `disable-model-invocation: true` so it only runs when the user calls it.

## Scripts and hooks

- Bash scripts: `set -euo pipefail` for the factory's scripts, `set -u` for
  hooks that must never fail the tool call they guard. Hooks exit 2 to block
  and print the reason to stderr.
- Python: stdlib only, no pip. The contextly engine sets
  `sys.dont_write_bytecode` so running it never leaves `__pycache__` in a
  user's repository.
- The contextly hook catches broadly and exits 0 on every path. Silent
  unless it matters: it emits `additionalContext` only when the repo has a
  store.
- Never `.strip()` git output that carries meaning in leading whitespace
  (`git status --porcelain`).

## Documents

- The context store is written for whoever opens the repo next, human or
  model. Prose over bullet soup, specifics over adjectives.
- Claims name paths, commands or symbols in inline code so `check` can verify
  them. Fenced blocks are not checked.
- `decisions.md` is append-only, `ADR-NNN` ids from the highest existing id.
  A reversal gets a new entry; the superseded one's `Status` line is the only
  edit ever made to a past entry.

## Checks before committing

```bash
python3 -m py_compile plugins/contextly/scripts/contextly.py plugins/software-factory/scripts/*.py
find plugins -name __pycache__ -type d -exec rm -rf {} +
bash -n plugins/software-factory/scripts/*.sh plugins/software-factory/hooks/*.sh
for f in .claude-plugin/marketplace.json plugins/*/.claude-plugin/plugin.json plugins/contextly/hooks/hooks.json .context/config.json .context/state.json; do
  python3 -c "import json,sys;json.load(open(sys.argv[1]))" "$f"
done
python3 plugins/contextly/scripts/contextly.py check
python3 plugins/contextly/scripts/contextly.py status
```

`check` reporting a broken path is a defect, not a warning: either the
document is wrong or the rename was incomplete. Exercising the hook by hand:

```bash
echo '{"cwd":"'"$PWD"'"}' | python3 plugins/contextly/scripts/contextly.py digest
```
