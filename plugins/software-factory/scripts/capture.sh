#!/usr/bin/env bash
# capture.sh <evidence-dir> <name> -- <command> [args...]
#
# Runs the command, tees stdout+stderr into <evidence-dir>/<name>.log and writes
# <evidence-dir>/<name>.json with command, cwd, git sha, timestamps and exit code.
# Returns the command's exit code. For pipelines use:  capture.sh DIR name -- bash -c 'a | b'
set -u
EV="${1:?evidence dir}"; NAME="${2:?name}"; shift 2
[ "${1:-}" = "--" ] && shift
[ $# -gt 0 ] || { echo "capture.sh: missing command" >&2; exit 64; }
mkdir -p "$EV"
LOG="$EV/$NAME.log"; META="$EV/$NAME.json"
START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; S=$(date +%s)
SHA="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
{
  echo "# software-factory evidence"
  echo "# name: $NAME"
  echo "# command: $*"
  echo "# cwd: $PWD"
  echo "# git_sha: $SHA"
  echo "# started_at: $START"
  echo "# ----------------------------------------"
} > "$LOG"
"$@" 2>&1 | tee -a "$LOG"
RC=${PIPESTATUS[0]}
END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; E=$(date +%s)
echo "# ----------------------------------------" >> "$LOG"
echo "# exit_code: $RC  finished_at: $END  duration_s: $((E-S))" >> "$LOG"
CAP_NAME="$NAME" CAP_CMD="$*" CAP_CWD="$PWD" CAP_SHA="$SHA" CAP_START="$START" CAP_END="$END" CAP_RC="$RC" CAP_DUR="$((E-S))" CAP_LOG="$LOG" \
python3 - "$META" <<'PY' 2>/dev/null || printf '{"name":"%s","exit_code":%s,"log":"%s"}\n' "$NAME" "$RC" "$LOG" > "$META"
import json, os, sys
e = os.environ
json.dump({
  "name": e["CAP_NAME"], "command": e["CAP_CMD"], "cwd": e["CAP_CWD"], "git_sha": e["CAP_SHA"],
  "started_at": e["CAP_START"], "finished_at": e["CAP_END"], "duration_s": int(e["CAP_DUR"]),
  "exit_code": int(e["CAP_RC"]), "log": e["CAP_LOG"],
}, open(sys.argv[1], "w"), indent=2)
PY
echo "[capture] $NAME exit=$RC log=$LOG"
exit "$RC"
