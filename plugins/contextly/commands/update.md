---
description: Amend the .context/ documents for what changed since the last sync
argument-hint: "[optional scope, e.g. 'architecture only']"
allowed-tools: Bash(git:*), Bash(python3:*), Bash(ls:*), Read, Write, Edit, Glob, Grep
---

# /contextly:update

Bring the store back in line with the code, then record the sync. This is
the one maintenance command; run it when a task is done, after merging a
`factory/*` branch, or whenever the session digest says STALE.

Engine: `python3 "${CLAUDE_PLUGIN_ROOT}/scripts/contextly.py"`.

Scope (optional): $ARGUMENTS

## 1. Establish the delta

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/contextly.py" status
```

That lists the watched files changed since `last_sync`, committed or not.
Then read the change itself:

```bash
git log --oneline <last_sync>..HEAD
git diff --stat <last_sync>..HEAD
git status --porcelain
```

If the store is not initialized, stop and point at `/contextly:init`.

## 2. Decide what changed meaningfully

Read the real diffs for the changed files that carry design weight. Ignore
formatting, lockfiles and generated output. You are looking for:

- New, moved, renamed or deleted modules and directories
- Changed entry points, routes, schemas or public interfaces
- Added or dropped dependencies and external services
- Changed build, test or deploy commands
- Decisions visible in the diff: a swapped library, a new pattern, a reversal

## 3. Edit surgically

Touch only the documents the delta reached: `index.md` (directory map, entry
points, stack), `architecture.md` (components, data flow, dependencies,
constraints), `conventions.md` (patterns, commands, testing).

Edit in place rather than rewriting whole files. Keep the existing voice and
structure. Delete claims that are no longer true instead of hedging them.
When the diff shows *what* changed but not *why*, write the what and mark the
why "not recorded" rather than guessing.

**`decisions.md` is off-limits here.** A consequential choice found in the
diff goes through `/contextly:decide`, never a direct edit.

## 4. Record the sync

Set `last_sync` in `.context/state.json` to the current `git rev-parse HEAD`.

## 5. Verify and report

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/contextly.py" check
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/contextly.py" status
```

State what changed in the code, which documents you edited and how, and what
you deliberately left alone. Do not commit unless the user asks.
