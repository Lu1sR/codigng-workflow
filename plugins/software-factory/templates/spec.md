# Spec: <short title>

Run: `<run-id>` - Source: `task.md`

## Context

Why this is needed, in 2-5 sentences. Link to the code areas involved (paths), current behaviour, and constraints found in the repo (framework, conventions, existing tests).

## Goal

One paragraph stating the observable outcome when this is done.

## Scope

- In scope: ...
- Out of scope: ... (be explicit; QA will not test these and dev must not touch them)

## Interfaces (contract for QA)

Everything QA needs to exercise the feature WITHOUT reading the implementation:
- HTTP endpoints (method, path, request/response shape, status codes)
- CLI commands / flags and expected output
- UI: routes, visible texts, roles/labels or `data-testid` values the dev MUST provide
- Data setup: fixtures, seed commands, env vars, feature flags

## Acceptance criteria

Each criterion is independently testable and has a stable id. Prefer 3-8 criteria.

### AC-1: <title>
- Given ...
- When ...
- Then ...
- Verification: e2e | unit | manual  (e2e whenever a user-facing behaviour exists)

### AC-2: <title>
- Given ...
- When ...
- Then ...
- Verification: e2e

## Definition of done

- All AC verified by QA with evidence
- Unit tests for new logic, existing test suite still green
- Lint / typecheck green
- No changes outside scope

## Open questions

Only questions that change the implementation. If there are none, write "None".
