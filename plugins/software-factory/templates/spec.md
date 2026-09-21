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

## Test environment

Where QA runs the e2e tests and how the commit under test gets there. Decided with the user
at spec time, never assumed. QA follows this section literally.

- Target: `local` | `remote`
- Base URL: `http://localhost:<port>` (local, from plan.md) or `https://<staging host>` (remote)
- How the commit under test gets there:
  - local: QA installs and starts the app in its own worktree (default)
  - remote, `deploy-command`: `<command QA runs from its worktree, e.g. a preview deploy>`, and how to read back the deployed URL/version
  - remote, `manual`: a human deploys `dev_sha` and confirms at a gate before each QA iteration
- Version check: how QA confirms the deployed build is `dev_sha` (health/version endpoint, build header, commit in the footer) or "not available"
- Credentials: env var **names** only (never values) and where QA reads them (`.env.test`, shell env, a secrets file outside the repo)
- Test data: seed/fixtures or test accounts to use; what QA may create; what it must clean up
- Constraints: shared environment rules (no destructive operations, no data of real users, rate limits, time windows)

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

## Design constraints

Default: minimal. No abstractions, configuration or dependencies beyond what `plan.md` lists.
If some part must be extensible on purpose, say which and why (e.g. "the exporter interface will
get a second implementation next sprint"). Everything else is implemented in the smallest form.

## Definition of done

- All AC verified by QA with evidence, in the test environment above
- Unit tests: `required for new logic` | `optional` (decided with the user); existing test suite still green either way
- Lint / typecheck green
- No changes outside scope

## Open questions

Only questions that change the implementation. If there are none, write "None".
