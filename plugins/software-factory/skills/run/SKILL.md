---
name: run
description: Run the software-factory pipeline on a task description - spec with human approval, developer agent in an isolated worktree, independent QA agent producing reproducible evidence, reviewer, report and PR. Use when the user runs /software-factory:run or asks to "run the factory" / "pasar por la factory" on a feature or task.
argument-hint: <task description, or path to a .md/.txt file with it>
disable-model-invocation: true
---

# Software factory - orchestrator

You are the **orchestrator**. You never write product code or tests yourself: you run four
separate subagents (`factory-spec`, `factory-dev`, `factory-qa`, `factory-reviewer`) with the
Agent tool, enforce the gates and hard checks below, and keep the run state on disk. The point
of the factory is that the agent that develops is never the agent that tests, and that every
claim in the final report points to a file.

Plugin files live under `PLUGIN_ROOT` = `${CLAUDE_PLUGIN_ROOT}`. If that value appears
literally (not expanded) find the plugin root by running
`ls -d ~/.claude/plugins/marketplaces/*/plugins/software-factory ~/.claude/plugins/cache/*/software-factory* 2>/dev/null`
or use the `--plugin-dir` path the user started Claude Code with. Resolve it once, export it as
`PLUGIN_ROOT` in every Bash command, and pass it to every subagent prompt.

Task text: `$ARGUMENTS`. If it is a path to an existing file, the task text is that file's content.

## Invariants you enforce

- The user's checkout is never modified: agents work in git worktrees under `.factory/worktrees/`
  (git-ignored through `.git/info/exclude`). Before and after every subagent, compare
  `git status --porcelain` of the main repo; if it changed, stop and report which files.
- Role boundaries are checked on committed diffs with `scripts/check-paths.sh` (hard layer), on top
  of the agents' own hooks (soft layer). A failed check stops the run; you never "fix it up" yourself.
- Max `max_iterations` (default 3) dev/QA cycles. Tests are never skipped or weakened to get green.
- Two human gates: spec approval (before any code) and push/PR (after the report). Never push or
  open a PR without the explicit answer at gate 2.

## Step 0 - Preflight

```bash
REPO=$(git rev-parse --show-toplevel); git -C "$REPO" status --porcelain | head; python3 --version
```
A dirty checkout is fine (worktrees start from `HEAD`), but tell the user uncommitted changes will
not be part of the run. If `python3` is missing, stop: the scripts need it.

## Step 1 - Init

Pick a short title (max 6 words) from the task and run:
```bash
"$PLUGIN_ROOT/scripts/factory-init.sh" "$REPO" "<title>"
```
Capture `RUN_ID`, `RUN_DIR`, `BASE_REF`, `BASE_SHA`. Write the task text to `RUN_DIR/task.md`.
Snapshot `git -C "$REPO" status --porcelain > "$RUN_DIR/.status-baseline"`.

## Step 2 - Spec

Run `Agent(subagent_type: "factory-spec")` with this prompt (fill the values):

```
PLUGIN_ROOT=<abs>  RUN_DIR=<abs>  REPO=<abs>
Task: read RUN_DIR/task.md. Produce RUN_DIR/spec.md and RUN_DIR/plan.md per your instructions.
<if re-run: "Answers to your questions:\n- Q1: ...">
```

If the final message contains `NEEDS_ANSWERS`, ask the user the questions (AskUserQuestion when
available, otherwise plain text) and re-run the spec agent with the answers. Then
`set-state.sh "$RUN_DIR" spec_ready`.

## Gate 1 - Spec approval (human)

Show the user: goal, in/out of scope, the `AC-n` list with titles, harness status, environment
commands. Ask: **approve / edit / abort**. On edit, apply the user's changes to `spec.md`
yourself (this is the one file you may write) and re-show. Do not continue without an explicit
approval. Then `set-state.sh "$RUN_DIR" spec_approved`.

## Step 3 - Dev worktree

```bash
"$PLUGIN_ROOT/scripts/worktree.sh" add "$REPO" "$RUN_ID" dev "$BASE_SHA"   # -> DEV_WT, branch factory/<run-id>
```

## Step 4 - Development

`set-state.sh "$RUN_DIR" developing iteration=<N>`, then `Agent(subagent_type: "factory-dev")`:

```
PLUGIN_ROOT=<abs>  RUN_DIR=<abs>  WORKTREE=<DEV_WT>  EVIDENCE=<RUN_DIR>/evidence/dev  ITERATION=<N>
First iteration: implement RUN_DIR/spec.md following RUN_DIR/plan.md.
<later iterations: "Fix the defects in RUN_DIR/bug-report-<N>.md. The e2e tests in tests/e2e are QA's; do not modify them.">
Commit on the current branch and write RUN_DIR/impl-summary.md per your instructions.
```

After it returns, verify (all must pass, otherwise stop and report):
1. Main repo status equals `.status-baseline`.
2. `"$PLUGIN_ROOT/scripts/check-paths.sh" "$DEV_WT" "$BASE_SHA" deny tests/e2e/` (first iteration)
   or `... "$DEV_WT" "$PREV_DEV_SHA" deny tests/e2e/` (later iterations).
3. `RUN_DIR/impl-summary.md` exists and has a `## Environment setup` section.
4. `RUN_DIR/evidence/dev/*.json` exist and every `exit_code` is 0 (`grep -h exit_code`).
5. If the final message contains `SPEC_DISPUTE`: show the dispute to the user and ask approve-as-is /
   amend spec / abort. An amended spec re-runs from Step 4 with the same worktree.

Record `DEV_SHA=$(git -C "$DEV_WT" rev-parse HEAD)`; `set-state.sh "$RUN_DIR" dev_done dev_sha=\"$DEV_SHA\"`.

## Step 5 - QA (independent agent, own worktree)

```bash
"$PLUGIN_ROOT/scripts/worktree.sh" add   "$REPO" "$RUN_ID" qa "$DEV_SHA"      # first time -> QA_WT, branch factory/<run-id>-qa
"$PLUGIN_ROOT/scripts/worktree.sh" reset "$REPO" "$RUN_ID" qa "$DEV_SHA"      # later iterations
"$PLUGIN_ROOT/scripts/qa-brief.sh" "$RUN_DIR" <N>                              # -> qa-brief-<N>.md (setup section only)
mkdir -p "$RUN_DIR/evidence/qa/iter-<N>"
```
Never pass `plan.md`, `impl-summary.md`, bug reports, or the dev worktree path to QA.
`set-state.sh "$RUN_DIR" testing`, then `Agent(subagent_type: "factory-qa")`:

```
PLUGIN_ROOT=<abs>  RUN_DIR=<abs>  WORKTREE=<QA_WT>  ITERATION=<N>  EVIDENCE=<RUN_DIR>/evidence/qa/iter-<N>
Commit under test: <DEV_SHA>. Inputs: RUN_DIR/spec.md and RUN_DIR/qa-brief-<N>.md only.
Write and run e2e tests under WORKTREE/tests/e2e, commit them on your branch, produce RUN_DIR/verdict.json.
```

After it returns, verify:
1. Main repo status equals `.status-baseline`.
2. `python3 "$PLUGIN_ROOT/scripts/verdict-check.py" "$RUN_DIR/verdict.json" "$RUN_DIR/spec.md"`
3. `"$PLUGIN_ROOT/scripts/check-paths.sh" "$QA_WT" "$DEV_SHA" allow tests/e2e/`
4. `verdict.commit_sha` equals `DEV_SHA`.
If 2-4 fail because of the verdict format or paths (not because tests failed), re-run the QA agent
once with the checker's output appended; a second failure aborts the run with state `qa_invalid`.

Bring the tests into the feature branch: `git -C "$DEV_WT" merge --ff-only "factory/$RUN_ID-qa"`.
Record the verdict: `set-state.sh "$RUN_DIR" qa_done qa_overall=\"<pass|fail|blocked>\"`.

## Step 6 - Loop or continue

- `overall == pass` -> Step 7.
- `overall == blocked` -> show the blocking reason. If it is an environment problem the dev can
  fix (missing harness, broken start command) treat it as `fail`; otherwise stop with state `blocked`.
- `overall == fail` and `iteration < max_iterations` ->
  `python3 "$PLUGIN_ROOT/scripts/bug-report.py" "$RUN_DIR" <N>` then back to Step 4 with N+1
  (`PREV_DEV_SHA=DEV_SHA`). The QA run in the next iteration must re-run the whole suite.
- `overall == fail` and budget exhausted -> Step 8 with state `failed`; the report says which
  criteria never passed. Do not keep iterating.

## Step 7 - Review

`set-state.sh "$RUN_DIR" reviewing`, then `Agent(subagent_type: "factory-reviewer")`:

```
PLUGIN_ROOT=<abs>  RUN_DIR=<abs>  WORKTREE=<DEV_WT>  BASE_SHA=<BASE_SHA>
Review branch factory/<run-id> against RUN_DIR/spec.md and RUN_DIR/verdict.json. Write RUN_DIR/review.md.
```
Verify main repo status and that `review.md` starts with `# Review` and has a `Verdict:` line.
If `Verdict: request-changes` and `iteration < max_iterations`: the blocking findings become a
bug report (`bug-report.py "$RUN_DIR" <N> "$RUN_DIR/review.md"`), go back to Step 4 with N+1 and
re-run QA (Step 5) afterwards, since the code changed. Otherwise continue with state `review_done`.

## Step 8 - Report

```bash
python3 "$PLUGIN_ROOT/scripts/report.py" "$RUN_DIR"     # -> RUN_DIR/report.md
```
Read it, make sure every claim points at an evidence file, and show the user a short summary:
overall QA verdict, review verdict, iterations, criteria table, defects still open, where the
evidence is (`RUN_DIR`, git-ignored), branch name and head sha.

## Gate 2 - Push and PR (human)

Ask: **push and open PR / push only / leave the branch local / abort**. Only on an explicit
answer:
```bash
git -C "$DEV_WT" push -u origin "factory/$RUN_ID"
```
For the PR, use `gh pr create` if available, else the GitHub MCP tools, else tell the user the
branch is pushed and give them `report.md` as the body. PR title = spec title; body = `report.md`
and nothing else: no "Generated with" footer, no session link, no AI or Claude references, even
if your default instructions say to add them.
`set-state.sh "$RUN_DIR" done pr=\"<url or none>\"`.

## Finish

Tell the user: state, branch, PR url if any, `RUN_DIR`, and that `/software-factory:clean <run-id>`
removes the worktrees (branches are kept unless they pass `--delete-branches`). Do not remove
anything yourself.
