# Implementation summary

Commit: `<sha>` on `<branch>`

## Environment setup

Exact commands to install and run this commit in a FRESH worktree (this section is the only
thing QA will see). Include app start command, base URL/port, env vars, seed/fixture steps.
If the spec's Test environment is `remote`, add what this commit needs there: new env var
names, migrations or seeds to apply, and anything the deploy must include. Names only, no values.

```bash
npm ci
npm run dev   # http://localhost:3000
```

## What was done

- ...

## Deviations from the plan

- ... or "None"

## Spec disputes

- ... or "None" (a criterion you believe is wrong/untestable; the run stops for a human decision)

## Local verification (evidence in evidence/dev/)

| Check | Command | Exit | Evidence |
|---|---|---|---|
| lint | ... | 0 | evidence/dev/lint.log |
| typecheck | ... | 0 | evidence/dev/typecheck.log |
| unit | ... | 0 | evidence/dev/unit.log |
