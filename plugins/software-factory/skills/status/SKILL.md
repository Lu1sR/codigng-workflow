---
name: status
description: Show software-factory runs in this repository (state, iteration, branch, verdict) from .factory/runs. Use when the user runs /software-factory:status or asks how a factory run is going.
argument-hint: [run-id]
---

List the runs under `$(git rev-parse --show-toplevel)/.factory/runs/*/run.json` (most recent
first). For each, print: run id, title, state, iteration/max, feature branch, dev sha (short),
last history entry time, and the QA overall from `verdict.json` if it exists. If a run id is
given as `$ARGUMENTS`, print that run's full `run.json`, the AC table from `verdict.json`, the
review verdict line from `review.md`, and the evidence file list. Read-only: do not modify anything.
