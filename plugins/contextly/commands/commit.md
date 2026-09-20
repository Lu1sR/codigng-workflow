---
description: Group changes into clean commits and keep the .context/ store current
argument-hint: "[optional commit message]"
allowed-tools: Bash(git:*), Bash(python3:*), Bash(ls:*), Bash(grep:*), Read, Write, Edit, Glob, Grep
---

# /contextly:commit

Commit with clean, professional messages, and use the moment to keep the
store current: a logical unit of work is complete, the diff is bounded, and
the person who knows why is still here.

Engine: `python3 "${CLAUDE_PLUGIN_ROOT}/scripts/contextly.py"`.

Message (optional): $ARGUMENTS

## 1. Assess

`git status --porcelain`. Nothing to commit: say so and stop. No `.context/`:
mention `/contextly:init` would help, but commit anyway. Never block a commit
on the context system.

## 2. Group into logical units

Read the full diff (`git diff`, `git diff --cached`, untracked files) and
group by unit of work, never by file type or timestamp: one feature or module
per commit; config and tooling apart from feature code; tests with the code
they test; formatting apart from behavior. One cohesive change is one commit.

## 3. Write the messages

```
<type>(<scope>): <summary>

<body: what changed and why, 1-3 sentences, only when the why isn't obvious>
```

Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `style`, `perf`.
Summary under 72 characters, imperative mood. No emoji unless the repo's
history uses them. Match the repo's established style. **Never reference AI,
Claude or any LLM anywhere in the message.**

## 4. Confirm and execute

If `$ARGUMENTS` carries a message, stage the relevant changes and commit with
it (tidied to conventional-commit form). Otherwise show the plan (commits,
messages, files) and wait for yes / edit / cancel. Then `git add <files>` and
`git commit` per group, foundational changes first. Never force-push, never
amend without an explicit instruction.

## 5. Sync the store

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/contextly.py" status
```

If it reports STALE, do what `/contextly:update` does: read the delta, amend
only the affected sections of `index.md`, `architecture.md` or
`conventions.md`, and set `last_sync` in `.context/state.json` to the new
HEAD. A decision visible in the diff goes through `/contextly:decide`. A pure
bugfix with nothing structural: set `last_sync` and say so. Commit the store
changes as their own `docs(context): sync to <short sha>` commit.

## 6. Report

```
Committed 2 changes
1. feat(auth): add session refresh middleware  [a1b2c3d]
2. test(auth): cover refresh token expiry cases  [e4f5g6h]
Context: architecture.md (request flow) updated, synced at e4f5g6h
```
