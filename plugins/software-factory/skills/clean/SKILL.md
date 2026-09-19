---
name: clean
description: Remove the git worktrees of a software-factory run (and optionally its branches) once the PR is merged or the run is abandoned. Use when the user runs /software-factory:clean.
argument-hint: <run-id> [--delete-branches] [--purge]
disable-model-invocation: true
---

Arguments: `$ARGUMENTS` (run id, optional `--delete-branches`, optional `--purge`).

1. `REPO=$(git rev-parse --show-toplevel)`; show `.factory/runs/<run-id>/run.json` state and the
   worktrees from `"${CLAUDE_PLUGIN_ROOT}/scripts/worktree.sh" list "$REPO"`.
2. If the state is not `done`, `failed`, `blocked` or `aborted`, warn that the run is still in
   progress and ask for confirmation before removing anything.
3. Run `"${CLAUDE_PLUGIN_ROOT}/scripts/worktree.sh" remove "$REPO" <run-id> [--delete-branches]`.
   Branches are deleted only when the flag is passed; never delete a branch with an open PR
   without telling the user first.
4. With `--purge`, also delete `.factory/runs/<run-id>` (the evidence). Confirm before doing it,
   since the evidence is not stored anywhere else unless it was attached to the PR.
