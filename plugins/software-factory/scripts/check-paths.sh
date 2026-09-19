#!/usr/bin/env bash
# check-paths.sh <worktree> <base-ref> allow|deny <prefix...>
#
# Hard enforcement of role boundaries on COMMITTED work:
#   - fails if the worktree has uncommitted changes
#   - allow: every file changed since <base-ref> must start with one of the prefixes
#   - deny : no file changed since <base-ref> may start with any of the prefixes
set -euo pipefail
WT="${1:?worktree}"; BASE="${2:?base ref}"; MODE="${3:?allow|deny}"; shift 3
cd "$WT"
if [ -n "$(git status --porcelain --untracked-files=all)" ]; then
  echo "check-paths: FAIL - uncommitted changes in $WT:" >&2
  git status --porcelain --untracked-files=all >&2
  exit 1
fi
FILES="$(git diff --name-only "$BASE" HEAD)"
if [ -z "$FILES" ]; then echo "check-paths: FAIL - no committed changes since $BASE" >&2; exit 1; fi
BAD=()
while IFS= read -r f; do
  hit=0
  for p in "$@"; do p="${p#./}"; case "$f" in "$p"*) hit=1; break ;; esac; done
  if [ "$MODE" = allow ] && [ $hit -eq 0 ]; then BAD+=("$f"); fi
  if [ "$MODE" = deny ]  && [ $hit -eq 1 ]; then BAD+=("$f"); fi
done <<< "$FILES"
if [ ${#BAD[@]} -gt 0 ]; then
  echo "check-paths: FAIL - files outside the role boundary ($MODE $*):" >&2
  printf '  %s\n' "${BAD[@]}" >&2
  exit 1
fi
echo "check-paths: OK ($(printf '%s\n' "$FILES" | wc -l | tr -d ' ') files, $MODE $*)"
printf '%s\n' "$FILES" | sed 's/^/  /'
