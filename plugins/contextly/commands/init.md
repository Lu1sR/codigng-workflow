---
description: Set up the .context/ store in this repository
argument-hint: "[optional focus, e.g. 'backend only']"
allowed-tools: Bash(git:*), Bash(python3:*), Bash(ls:*), Bash(find:*), Bash(wc:*), Bash(mkdir:*), Read, Write, Edit, Glob, Grep
---

# /contextly:init

Set up the context store for this repository. Run once per repo;
`/contextly:update` maintains it afterwards.

Engine: `python3 "${CLAUDE_PLUGIN_ROOT}/scripts/contextly.py"`. If that
variable shows up unexpanded, the plugin root is the directory that contains
`scripts/contextly.py` under `~/.claude/plugins/`.

Focus (optional): $ARGUMENTS

## 0. Pre-flight

Confirm this is a git repository. If `.context/index.md` already exists, stop:
the store is initialized, suggest `/contextly:check` or `/contextly:update`.
Re-initialize only if the user explicitly asks.

## 1. Survey the repository

Work from evidence, not assumptions: `git log --oneline -30`,
`git ls-files | head -300`, the manifests (`package.json`, `pyproject.toml`,
`go.mod`, `Cargo.toml`), entry points, routers, migrations, CI workflows,
and any existing `README*`, `docs/`, `CLAUDE.md`, ADRs. Read the files that
decide how the system is wired. Skip vendored code, lockfiles, build output.

## 2. The one rule

**Commit what cannot be regenerated. Do not store what can.** A dependency
list, a route table, a directory tree: Claude reads those from the repo in
seconds, so they do not go in the store. Why the queue sits between those two
services, which constraint forces the retry logic, what a newcomer gets wrong
on their first PR: derivable from nothing, so that is what the store holds.

Everything in `.context/` is committed. Nothing is gitignored, nothing lives
in `.git/`.

## 3. Write the four documents

Every claim must trace to something you actually read. No aspirational
architecture. Name paths, commands and symbols in inline code so `check` can
verify them.

- **`.context/index.md`**, the entry point a cold session reads first: one
  paragraph on what the repo is and who it serves; stack and runtime versions;
  a directory map (path, responsibility, one line each, only paths that
  matter); entry points (how it starts, tests, deploys); pointers to the other
  documents.
- **`.context/architecture.md`**, what is true but not derivable: components
  and boundaries; data flow for the one or two paths that matter most;
  external dependencies (datastores, queues, third-party APIs, auth);
  constraints and sharp edges. That last section is the whole reason the
  store exists.
- **`.context/conventions.md`**: naming, layout and error-handling patterns
  the code actually follows; the exact commands for test, lint, typecheck,
  build; anything a contributor gets wrong on their first PR.
- **`.context/decisions.md`**, header only, then ADRs only where history or
  existing docs record a genuine rationale. An empty log beats an invented one:

  ```markdown
  # Architectural Decisions

  Append-only log. Entries are added by /contextly:decide and never rewritten.

  ---
  ```

## 4. Config and state

**`.context/config.json`**: `watch` covers what carries meaning, `ignore`
covers what is generated. Defaults already ignore `.git`, `.context`,
`.factory`, `node_modules`, build output and lockfiles, so most repos only
need `watch`:

```json
{ "watch": ["src/**", "migrations/**", "*.md"] }
```

**`.context/state.json`**, the commit the store describes:

```json
{ "last_sync": "<git rev-parse HEAD>" }
```

## 5. Wire it up

`CLAUDE.md` gets a line pointing at `.context/index.md` (create a short
`CLAUDE.md` if there is none). That is all: the plugin's SessionStart hook
reads the store from then on, and teammates get the documents by cloning.

## 6. Verify and report

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/contextly.py" status
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/contextly.py" check
```

Both must come back clean. Report the files created, the watch globs chosen,
and any part of the repo you could not characterize confidently. That gap is
the first thing worth a human's attention. Do not commit unless asked.
