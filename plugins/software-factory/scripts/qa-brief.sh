#!/usr/bin/env bash
# qa-brief.sh <run-dir> <iteration>
# Builds qa-brief-<iteration>.md for the QA agent from impl-summary.md, exposing ONLY the
# "## Environment setup" section (how to install/run), never the implementation notes.
set -euo pipefail
RUN_DIR="${1:?run dir}"; IT="${2:?iteration}"
SRC="$RUN_DIR/impl-summary.md"; OUT="$RUN_DIR/qa-brief-$IT.md"
[ -f "$SRC" ] || { echo "qa-brief: $SRC not found" >&2; exit 1; }
{
  echo "# QA brief (iteration $IT)"
  echo
  echo "You are testing the commit recorded in run.json (dev_sha). The only implementation"
  echo "information you get is how to set up and run the project, below. Everything else"
  echo "comes from spec.md. Do not look for more."
  echo
  awk '/^## Environment setup/{p=1; print; next} /^## /{if(p){exit}} p{print}' "$SRC"
} > "$OUT"
grep -q '^## Environment setup' "$SRC" || { echo "qa-brief: impl-summary.md has no '## Environment setup' section" >&2; exit 1; }
echo "QA_BRIEF=$OUT"
