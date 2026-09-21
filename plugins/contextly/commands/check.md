---
description: Audit the .context/ store against the current code (read-only)
argument-hint: "[optional path or topic to focus on]"
allowed-tools: Bash(git:*), Bash(python3:*), Bash(ls:*), Read, Glob, Grep
---

# /contextly:check

Report how far the store has drifted from reality. **Read-only**: this
command cannot write; `/contextly:update` and `/contextly:decide` do the
writing.

Engine: `python3 "${CLAUDE_PLUGIN_ROOT}/scripts/contextly.py"`.

Focus (optional): $ARGUMENTS

## 1. Mechanical pass (free, run it first)

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/contextly.py" check
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/contextly.py" status
```

`check` verifies that every path the store names still exists, the most
common form of rot. `status` lists what changed since the last sync.
Anything this pass finds is a confirmed defect: carry it into the report, do
not re-verify it by hand. If the store is missing, the answer is
`/contextly:init`; say so and stop.

## 2. Judgement pass

The mechanical pass cannot check meaning. For each document, prioritizing the
areas `status` listed as changed, take its concrete claims and test them
against the code: do documented commands still exist in the manifests and
CI? Do named components still match (`Grep`)? Are the described data flows
still how it works? Did anything significant appear that no document
mentions: a new top-level directory, service or external dependency?

A wrong claim in `architecture.md` is the expensive kind: nothing can
regenerate it and it will be believed.

## 3. Report

Group findings by severity, most severe first: **Wrong** (quote the stale
line and the evidence against it), **Missing** (real and important but
undocumented), **Unverifiable**, and **Fine** in one line. Close with a
verdict (`fresh`, `drifting`, `stale`) and the remedy per finding:
`/contextly:update` for prose, `/contextly:decide` for an unrecorded
decision. Do not apply any of them.
