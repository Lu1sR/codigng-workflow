# Lean rules

Less code that does exactly what the spec says. These rules are adapted from the
[ponytail](https://github.com/DietrichGebert/ponytail) project (MIT) for a pipeline where the scope
is already fixed by an approved spec, a separate QA agent tests the result, and a separate reviewer
reads the diff. They apply to the developer and are checked by the reviewer.

## 1. Reuse ladder (developer, before writing anything)

Stop at the first rung that holds. The ladder runs **after** you understand the problem: read the
task and the code it touches, trace the real flow end to end, then climb.

1. **Already in this codebase?** Reuse the helper, util, or pattern that is already here. Grep first.
2. **Standard library does it?** Use it.
3. **Native platform feature covers it?** CSS over JS, a DB constraint over app logic, a framework
   feature over a hand-rolled one.
4. **An already-installed dependency solves it?** Use it.
5. **Only then:** write the minimum code that works.

Scope questions ("does this need to exist?") are not yours: the spec was approved. Implement it.

## 2. Diet rules (developer writes, reviewer checks against the diff)

- No new dependency unless `plan.md` lists it. **Blocking in review.**
- No abstraction, interface, configuration flag, or flexibility that the spec does not require.
  One implementation means no interface. One caller means no layer.
- Fewest files possible. Prefer editing an existing file over creating a new one.
- Deletion over addition. Boring over clever.
- Shortest working diff wins, once you understand the problem. The smallest change in the wrong
  place is a second bug, not efficiency.
- Between two equally short options, pick the one that is correct on edge cases.
- No speculative test helpers or fixtures. One test per behaviour, using the repo's framework.

## 3. Bug fixes: root cause, not symptom (developer, fix iterations)

A QA defect names a symptom on one path. Before patching:

- Find the function that actually produces the wrong behaviour.
- Grep every caller of that function. Fix the shared function once; do not add a guard per caller.
- Patching only the path the defect names leaves a sibling caller broken and costs another QA round.

## 4. Never cut (developer and reviewer)

Lean never means removing or skipping:

- Input validation at trust boundaries (HTTP, CLI, files, external services).
- Error handling that prevents data loss or leaves state inconsistent.
- Security: auth, authz, secrets, injection, unsafe defaults.
- Accessibility of UI you create or change.
- Anything the spec or the interface contract asks for explicitly (paths, status codes, `data-testid`).

## 5. Deliberate shortcuts are marked

When you knowingly ship a simplification with a real ceiling (global lock, O(n²) scan, naive
heuristic, hard-coded limit), mark it where it lives:

```
// shortcut: <the ceiling>; upgrade: <the trigger that says it is time to revisit>
# shortcut: single process lock; upgrade: when more than one worker runs
```

The reviewer requires a marker on every conscious simplification. The run report lists the
markers this run introduced and flags any without an `upgrade:` trigger.
