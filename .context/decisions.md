# Architectural Decisions

Append-only log. Entries are added by /contextly:decide and never rewritten.
Ids come from the highest existing id, never from a count.

---

## ADR-001 — The agent that develops is never the agent that tests

**Date:** 2026-09-19
**Status:** Accepted
**Affects:** `plugins/software-factory/agents/`, `plugins/software-factory/skills/run/SKILL.md`, `plugins/software-factory/scripts/check-paths.sh`

**Context.** A single agent that implements a feature and then writes its own
tests verifies its understanding of the spec, not the spec. Evidence produced
by the same context that wrote the code is not independent.

**Decision.** Four separate subagents with empty starting context: spec
(read-only), dev, QA and reviewer (read-only). QA works in its own worktree
from the dev's commit, receives only the spec and the environment setup, and
may write only under `tests/e2e/`. Boundaries are enforced on committed diffs
by the orchestrator, on top of per-agent tool lists and PreToolUse guards.

**Alternatives considered.**
- One agent, dev then test — cheaper, but the tests inherit the dev's reading
  of the spec and never catch it.
- Hooks alone as enforcement — heuristic; a regex on a Bash command is not a
  guarantee. Hooks stay as the soft layer, the committed diff is the hard one.

**Consequences.** A run costs three agents' worth of context and installs
dependencies per worktree. In exchange every claim in the report points to a
file produced by a role that could not see the implementation.

---

## ADR-002 — Dev works under lean rules adapted from ponytail

**Date:** 2026-09-19
**Status:** Accepted
**Affects:** `plugins/software-factory/templates/lean-rules.md`, `plugins/software-factory/agents/factory-dev.md`, `plugins/software-factory/agents/factory-reviewer.md`

**Context.** Agents that implement a spec tend to add abstractions,
configuration and dependencies the spec did not ask for. The reviewer needs a
concrete rulebook to judge the diff against, not a taste.

**Decision.** Adapt the reuse ladder, diet rules, root-cause fixes, never-cut
list and shortcut markers from ponytail (MIT) into a template the dev reads
before coding and the reviewer checks. Dropped the YAGNI rung (scope is fixed
by the approved spec) and the "one line" rung (it pushes toward cleverness).
Lean findings in the review never block; dependencies outside the plan and
anything from the never-cut list do.

**Alternatives considered.**
- Use ponytail as a plugin — its "single verification, no frameworks" rule is
  the opposite of what QA needs; limiting its injection to the dev is fragile.

**Consequences.** The report shows diff size and shortcut markers per run, so
the trend is visible. Another dev+QA loop costs more than a few surplus lines,
which is why lean findings are advisory.

---

## ADR-003 — Contextly is a plugin here, cut to one hook and five commands

**Date:** 2026-09-20
**Status:** Accepted
**Affects:** `plugins/contextly/`, `.claude-plugin/marketplace.json`, `CLAUDE.md`

**Context.** Contextly lived in its own repository with two install modes
(vendored per repo or global), four hooks (SessionStart, PostToolUse, Stop,
git post-commit), a gitignored derived tier rebuilt by a model session, a
hand-maintained glob-to-section staleness map, and a multi-repo CLI with
headless batch initialization. About 5,400 lines to maintain four Markdown
files. Two of its hooks broke the factory: PostToolUse recorded writes made
inside factory worktrees and the Stop hook then blocked the orchestrator at
its human gates, asking it to edit the main checkout; the vendored install
also left `__pycache__` in the repo, which tripped the factory's
"main checkout unchanged" check on a fresh clone.

**Decision.** Ship contextly as a second plugin of this marketplace. Keep
what carries the value: the committed store (`index.md`, `architecture.md`,
`conventions.md`, `decisions.md`), the SessionStart digest, and the
`init`/`update`/`decide`/`check`/`commit` commands. Remove the derived tier,
the PostToolUse and Stop hooks, the git hook, the section map, the commit and
day thresholds, per-document bookkeeping in `state.json`, the multi-repo
commands, the headless init, the installer, and the `worktree` and `recap`
commands. Freshness is one signal: watched files changed since `last_sync`.
Slash-command claim checking was dropped with it: plugin commands are
namespaced and their files live outside the repo, so the check had nothing
reliable to resolve against.

**Alternatives considered.**
- Patch the two conflicts in place (ignore `.factory/**`, stop writing
  bytecode) — fixes the symptoms and keeps the 5,000 lines nobody uses.
- Keep the Stop hook off by default — a disabled feature is still code to
  read, and the digest plus `/contextly:commit` already surface the debt.
- Keep the derived tier — it is gitignored, so no clone or worktree has it,
  and a model reads a package manifest faster than it maintains a summary of it.

**Consequences.** Installation is `/plugin install contextly@codigng-workflow`;
the only per-repo setup is `/contextly:init` and a line in `CLAUDE.md`. The
store is complete in every clone and worktree. A factory run cannot be
affected by contextly, since subagents do not receive SessionStart. What was
removed stays in the Contextly repository's history (its last full commit is
`ecd7c4f`), including the six decision records that led here.

---

## ADR-004 — Show the workflow through one optional, read-only mod

**Date:** 2026-10-12
**Status:** Accepted
**Affects:** `plugins/workflow-ui/`, `plugins/software-factory/skills/run/SKILL.md`, `.claude-plugin/marketplace.json`

**Context.** A factory run waits on a person three times (spec approval, a
manual deploy, push/PR), and that wait was only visible as the orchestrator's
text in the transcript. Seeing a run meant calling `/software-factory:status`
again and again, and a subagent showed as one collapsed line until it ended,
so a guard refusing the dev or QA surfaced only in the final summary.
Contextly's staleness showed once, at session start. Claude Code's function
hooks (mods) can draw a band, a pane and a status line and observe every
subagent's tool calls.

**Decision.** Add `workflow-ui`, a third plugin of the marketplace and
optional: one hooks module that polls `.factory/runs/` and
`contextly.py status --json`, observes `agent.spawn`, `tool.call` and
`turn.complete`, and draws a band at each human state, a `/factory` pane with
a runs tab and an agents tab, and a status line. It writes nothing and always
passes events through unchanged. The band, pane and status line share one
module because they share one reader of the run files; the subagent view is a
tab of the same pane for the same reason. The factory gains an explicit
`awaiting_deploy` state so the manual deploy wait is detected exactly instead
of inferred from the spec.

**Alternatives considered.**
- One mod per surface — the three would read and poll the same files three times.
- Fold guards (no AI trailers in commits, append-only `decisions.md`) into the same mod — they block calls, a different risk from a view, and should be switchable on their own.
- Infer the deploy gate from `dev_done` plus the spec's Test environment — a heuristic over free text, where one `plugins/software-factory/scripts/set-state.sh` call makes it exact.
- Build it into `software-factory` — a session without mod support would carry code it cannot run; as a separate plugin the other two work unchanged without it.

**Consequences.** The gates are visible without reading the transcript, and a
guard refusal is visible while the subagent runs. The mod needs a Claude Code
build with function hooks; without one it is simply not installed. Because it
writes nothing, it cannot affect the factory's main-checkout invariant or
contextly's freshness (the problem behind ADR-003). The guards stay a
separate, future plugin.

---
