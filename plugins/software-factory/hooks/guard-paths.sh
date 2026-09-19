#!/usr/bin/env bash
# PreToolUse guard for file-writing/reading tools.
#
# Usage (in an agent's frontmatter hooks):
#   guard-paths.sh allow <prefix...>   -> the path MUST match one prefix (relative prefix
#                                        match, or absolute path containing "/<prefix>")
#   guard-paths.sh deny  <fragment...> -> the path must NOT contain any fragment
#
# Reads the hook JSON on stdin, extracts tool_input.file_path (or notebook_path).
# Exit 2 blocks the call and feeds stderr back to the agent. Exit 0 allows.
set -u
MODE="${1:-}"; shift || true
[ -z "$MODE" ] && exit 0

INPUT="$(cat)"
extract() {
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$INPUT" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' 2>/dev/null
  elif command -v python3 >/dev/null 2>&1; then
    printf '%s' "$INPUT" | python3 -c 'import sys,json
d=json.load(sys.stdin); t=d.get("tool_input",{}) or {}
print(t.get("file_path") or t.get("notebook_path") or "")' 2>/dev/null
  else
    printf '%s' "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//'
  fi
}
PATH_IN="$(extract)"
[ -z "$PATH_IN" ] && exit 0   # nothing to judge (tool without a path)

# normalise: strip leading ./
REL="${PATH_IN#./}"

case "$MODE" in
  allow)
    for p in "$@"; do
      p="${p#./}"
      case "$REL" in
        "$p"*) exit 0 ;;          # relative prefix match
        */"$p"*) exit 0 ;;        # absolute path containing /<prefix>
      esac
    done
    echo "software-factory guard: writing to '$PATH_IN' is not allowed for this role. Allowed locations: $*" >&2
    exit 2
    ;;
  deny)
    for f in "$@"; do
      case "$REL" in
        *"$f"*)
          echo "software-factory guard: '$PATH_IN' is off-limits for this role (matches '$f')." >&2
          exit 2 ;;
      esac
    done
    exit 0
    ;;
  *) exit 0 ;;
esac
