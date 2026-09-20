---
description: Append an architectural decision record to .context/decisions.md
argument-hint: "<what was decided, in your own words>"
allowed-tools: Bash(git:*), Bash(grep:*), Read, Edit, Glob, Grep
---

# /contextly:decide

Record a decision before the reasoning evaporates. Decisions are the least
regenerable thing in the store: no scan of the codebase recovers why an
option was rejected.

Decision: $ARGUMENTS

## 1. Capture

If `.context/` is missing, say so and point at `/contextly:init`.

**Use the conversation you are already in.** If the user just worked through
the tradeoffs with you, the context, alternatives and consequences are
already established: write them up. Never make the user repeat what was just
discussed. Only ask when there is genuinely nothing to work from: what was
decided, and what else was on the table and why this won.

## 2. Number it

```bash
grep -o '^## ADR-[0-9]\{3\}' .context/decisions.md | sort | tail -1
```

Take the **highest existing id** and add one. Never count entries: a count
collides with an existing id the moment any entry is removed. The first entry
is `ADR-001`.

## 3. Ground it

Check the code for what the decision refers to, so the entry names a real
path, command or symbol. If the decision contradicts an existing document,
note it; the fix goes through `/contextly:update`.

## 4. Append

Add to the **end** of `.context/decisions.md`:

```markdown
## ADR-NNN — <decision as a statement>

**Date:** YYYY-MM-DD
**Status:** Accepted
**Affects:** `path/one`, `path/two`

**Context.** What problem or question forced the choice.

**Decision.** What was chosen, concretely.

**Alternatives considered.**
- <Option A> — <why rejected, one sentence>
- <Option B> — <why rejected, one sentence>

**Consequences.** What this makes easy, what it makes hard, what it rules out.

---
```

Rules: the title is a statement ("Use Supabase RLS for row-level auth", not
"Auth decision"); context describes the problem, never the solution; if no
alternatives were weighed write "No alternatives formally evaluated", never
invent rejected options; where rationale is not recoverable write "not
recorded"; write as the team's record, with no AI, Claude or LLM references.

## 5. Never rewrite

Existing entries are permanent. A reversed decision gets a **new** entry, and
the old one's `Status` becomes `Superseded by ADR-NNN`. That one-line status
change is the only edit ever made to a past entry.

Report the id, title and file in two or three lines. An ADR is not a sync;
leave `state.json` alone.
