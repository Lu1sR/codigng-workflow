#!/usr/bin/env bash
# worktree.sh add    <repo-root> <run-id> dev|qa <start-ref>   -> prints WORKTREE= and BRANCH=
# worktree.sh reset  <repo-root> <run-id> qa <ref>             -> moves the qa branch/worktree to <ref>
# worktree.sh remove <repo-root> <run-id> [--delete-branches]
# worktree.sh list   <repo-root>
#
# Layout: <repo>/.factory/worktrees/<run-id>/dev.wt  (branch factory/<run-id>)
#         <repo>/.factory/worktrees/<run-id>/qa.wt   (branch factory/<run-id>-qa)
set -euo pipefail
ACTION="${1:?action}"; REPO="$(cd "${2:?repo}" && git rev-parse --show-toplevel)"
case "$ACTION" in
  add)
    RUN_ID="${3:?run id}"; ROLE="${4:?dev|qa}"; START="${5:?start ref}"
    case "$ROLE" in dev) BR="factory/$RUN_ID" ;; qa) BR="factory/$RUN_ID-qa" ;; *) echo "role must be dev|qa" >&2; exit 1 ;; esac
    WT="$REPO/.factory/worktrees/$RUN_ID/$ROLE.wt"
    mkdir -p "$(dirname "$WT")"
    if [ -d "$WT" ]; then echo "WORKTREE=$WT"; echo "BRANCH=$BR"; exit 0; fi
    if git -C "$REPO" show-ref --verify --quiet "refs/heads/$BR"; then
      git -C "$REPO" worktree add "$WT" "$BR" >/dev/null
    else
      git -C "$REPO" worktree add -b "$BR" "$WT" "$START" >/dev/null
    fi
    echo "WORKTREE=$WT"; echo "BRANCH=$BR"
    ;;
  reset)
    RUN_ID="${3:?run id}"; ROLE="${4:?role}"; REF="${5:?ref}"
    WT="$REPO/.factory/worktrees/$RUN_ID/$ROLE.wt"
    [ -d "$WT" ] || { echo "no worktree at $WT" >&2; exit 1; }
    git -C "$WT" reset --hard "$REF" >/dev/null
    echo "WORKTREE=$WT"; echo "HEAD=$(git -C "$WT" rev-parse HEAD)"
    ;;
  remove)
    RUN_ID="${3:?run id}"; DEL="${4:-}"
    for ROLE in dev qa; do
      WT="$REPO/.factory/worktrees/$RUN_ID/$ROLE.wt"
      [ -d "$WT" ] && git -C "$REPO" worktree remove --force "$WT" && echo "removed $WT"
    done
    git -C "$REPO" worktree prune
    if [ "$DEL" = "--delete-branches" ]; then
      git -C "$REPO" branch -D "factory/$RUN_ID-qa" 2>/dev/null && echo "deleted branch factory/$RUN_ID-qa" || true
      git -C "$REPO" branch -D "factory/$RUN_ID" 2>/dev/null && echo "deleted branch factory/$RUN_ID" || true
    fi
    rmdir "$REPO/.factory/worktrees/$RUN_ID" 2>/dev/null || true
    ;;
  list) git -C "$REPO" worktree list ;;
  *) echo "unknown action $ACTION" >&2; exit 1 ;;
esac
