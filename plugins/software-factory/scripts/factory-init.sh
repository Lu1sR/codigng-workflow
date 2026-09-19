#!/usr/bin/env bash
# factory-init.sh <repo-root> "<short title>"
# Creates .factory/runs/<run-id>/ (ignored via .git/info/exclude, never touching tracked files),
# writes run.json and prints RUN_ID / RUN_DIR / BASE_REF / BASE_SHA.
set -euo pipefail
REPO="$(cd "${1:?repo root}" && git rev-parse --show-toplevel)"
TITLE="${2:?title}"
SLUG="$(printf '%s' "$TITLE" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' | cut -c1-40)"
RUN_ID="$(date -u +%Y%m%d-%H%M)-${SLUG:-run}"
RUN_DIR="$REPO/.factory/runs/$RUN_ID"
mkdir -p "$RUN_DIR/evidence/dev" "$RUN_DIR/evidence/qa" "$REPO/.factory/worktrees"

# keep .factory out of git without editing tracked files
EXCL="$REPO/.git/info/exclude"
mkdir -p "$(dirname "$EXCL")"
grep -qxF '.factory/' "$EXCL" 2>/dev/null || echo '.factory/' >> "$EXCL"

BASE_REF="$(git -C "$REPO" rev-parse --abbrev-ref HEAD)"
BASE_SHA="$(git -C "$REPO" rev-parse HEAD)"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$RUN_DIR/run.json" <<JSON
{
  "run_id": "$RUN_ID",
  "title": $(printf '%s' "$TITLE" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))' 2>/dev/null || printf '"%s"' "$SLUG"),
  "created_at": "$NOW",
  "repo": "$REPO",
  "base_ref": "$BASE_REF",
  "base_sha": "$BASE_SHA",
  "feature_branch": "factory/$RUN_ID",
  "qa_branch": "factory/$RUN_ID-qa",
  "state": "init",
  "iteration": 0,
  "max_iterations": 3,
  "dev_sha": null,
  "history": []
}
JSON
echo "RUN_ID=$RUN_ID"
echo "RUN_DIR=$RUN_DIR"
echo "BASE_REF=$BASE_REF"
echo "BASE_SHA=$BASE_SHA"
