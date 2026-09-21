# Architecture

## software-factory

A pipeline of four subagents driven by an orchestrator that runs in the
user's main session, because the two human gates (spec approval, push/PR)
need a human present.

```
task ─► factory-spec ─► [gate 1] ─► factory-dev ─► factory-qa ─┐
         (read-only)               (dev worktree) (qa worktree) │ fail: bug report, max 3 loops
                                        ▲                       │
                                        └───────────────────────┘ pass
                          factory-reviewer ─► report.md ─► [gate 2: push / PR]
```

**Role separation is enforced in three layers.** Each agent's frontmatter
lists its tools (spec and reviewer have no `Edit`). Per-agent `PreToolUse`
hooks (`plugins/software-factory/hooks/guard-paths.sh`, `plugins/software-factory/hooks/guard-bash.sh`) are the soft layer: QA
cannot write outside `tests/e2e/` or read the dev's plan and summary, the dev
cannot touch `tests/e2e/`, nobody pushes or rewrites history. The hard layer
is the orchestrator validating the **committed** diff of each role with
`plugins/software-factory/scripts/check-paths.sh`, the verdict with `plugins/software-factory/scripts/verdict-check.py`, and the
main checkout against a status baseline before and after every subagent. A
failed check stops the run; nothing is fixed up by hand.

**Isolation.** Each role works in its own git worktree under
`.factory/worktrees/<run-id>/` (branches `factory/<run-id>` and
`factory/<run-id>-qa`), excluded from git through `.git/info/exclude` so the
user's `.gitignore` is never edited. Every agent starts with empty context;
QA only receives the spec and the "Environment setup" section of the dev's
summary, so it tests black-box.

**Test environment is decided at spec time, never assumed.** `factory-spec` looks for
evidence (task text, README, CI, hosting config) and then asks the user where the e2e tests
run (`local` in QA's worktree, or `remote` against a test/staging URL), how the commit under
test gets there (QA starts the app, a deploy command QA runs from its worktree, or a human
deploys and confirms at a per-iteration gate the orchestrator enforces), how to verify the
deployed version, which credentials by env var name and which test data to use, and whether
unit tests are required or optional for the task. The spec's **Test environment** section
carries the answers; QA follows it literally, runs the version check before the suite, blocks
on a mismatch, and redacts credentials from evidence. `plugins/software-factory/scripts/verdict-check.py` requires
`environment.target` and, for remote, `environment.base_url`.

**Evidence.** Every verification command runs through `plugins/software-factory/scripts/capture.sh`,
which stores log, exit code and commit sha under `.factory/runs/<run-id>/evidence/`.
`plugins/software-factory/scripts/report.py` builds the traceability criterion → test → evidence that
becomes the PR body.

**Lean rules.** The dev works under `plugins/software-factory/templates/lean-rules.md` (reuse ladder,
no dependency outside the plan, deletion over addition, shortcut markers) and
the reviewer checks the diff against them. Blocking findings are the never-cut
list and dependencies outside the plan; lean findings alone never block.

## contextly

Two halves that meet at one file. **Commands** (`plugins/contextly/commands/*.md`) are prompts:
they hold all the judgement, surveying a repo, verifying claims, amending
Markdown. The **engine** (`plugins/contextly/scripts/contextly.py`) is deterministic: it
computes what changed since the last sync and checks path claims. They meet
at `.context/state.json`, where commands write `last_sync` and the engine
reads it.

The store is four committed documents plus config and state:

| File | Written by |
| --- | --- |
| `index.md`, `architecture.md`, `conventions.md` | `/contextly:init`, `/contextly:update`, `/contextly:commit` |
| `decisions.md` | `/contextly:decide` only, append-only |
| `config.json` | human, `/contextly:init` (`watch` and `ignore` globs) |
| `state.json` | the sync commands (`last_sync` sha) |

Nothing is gitignored and nothing is installed into `.git/`: a clone or a
worktree carries the whole store, and the only per-repo setup is a line in
`CLAUDE.md`.

**Freshness is one signal.** `changed_since()` lists watched files touched
since `last_sync`, committed or not, grouped by top-level directory for the
digest. There are no commit or day thresholds and no glob-to-section map: at
this scale, naming the changed directories is enough for a model to know which
sections to verify, and a map is one more thing that rots.

**One hook.** `SessionStart` runs `contextly.py digest`, which injects a few
lines (where the store is, fresh or STALE, what changed, broken path claims)
and never the documents themselves. Subagents do not receive SessionStart,
and contextly registers no other hook, so nothing it does reaches a factory
run. The hook catches every exception and exits 0: context bookkeeping never
breaks the session it is helping.

**Claim checking** (`check_claims()`) verifies that every repo path a document
names in an inline code span still exists. Fenced blocks are skipped; a token
is judged only when it has a known extension or its first segment exists, so
`origin/main` and `feat/<name>` stay out of the results.

## How the two coexist

- Factory agents read `.context/` through the target repo's `CLAUDE.md`, so
  conventions reach spec, dev and reviewer without duplication.
- Contextly has no PostToolUse or Stop hook and no git hook, so a factory run
  never sees the main checkout change because of it. The previous design had
  both, and both broke the factory's "main checkout unchanged" invariant
  (see ADR-003).
- The dev does not edit the store (the reviewer would flag it as out of
  scope), so after a `factory/*` branch merges the user runs
  `/contextly:update`.
- `architecture.md` in a target repo stays at architecture level: QA reads it
  via `CLAUDE.md`, and implementation notes there would weaken the black box.
