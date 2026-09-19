#!/usr/bin/env bash
# PreToolUse guard for Bash.
#
#   guard-bash.sh worktree  -> agent may build/test/commit inside its worktree, but must not
#                              push, touch other worktrees/branches, or rewrite history.
#   guard-bash.sh readonly  -> agent must not mutate the repository at all.
#
# Heuristic (soft) layer. The hard layer is scripts/check-paths.sh run by the orchestrator.
set -u
MODE="${1:-worktree}"
INPUT="$(cat)"
if command -v jq >/dev/null 2>&1; then
  CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)"
elif command -v python3 >/dev/null 2>&1; then
  CMD="$(printf '%s' "$INPUT" | python3 -c 'import sys,json;print((json.load(sys.stdin).get("tool_input",{}) or {}).get("command",""))' 2>/dev/null)"
else
  CMD="$INPUT"
fi
[ -z "$CMD" ] && exit 0

deny() { echo "software-factory guard ($MODE): blocked command: $1" >&2; exit 2; }

# Always forbidden for any factory agent
echo "$CMD" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+push' && deny "git push (the orchestrator pushes)"
echo "$CMD" | grep -Eq 'git[[:space:]]+worktree' && deny "git worktree (managed by the orchestrator)"
echo "$CMD" | grep -Eq 'git[[:space:]]+(reset[[:space:]]+--hard|clean[[:space:]]+-[a-zA-Z]*f|branch[[:space:]]+-D|rebase|filter-branch|push[[:space:]]+--force)' && deny "history-rewriting git command"
echo "$CMD" | grep -Eq 'git[[:space:]]+checkout[[:space:]]+(--[[:space:]]+)?\.($|[[:space:]])' && deny "git checkout . (discarding work)"
echo "$CMD" | grep -Eq 'rm[[:space:]]+-[a-zA-Z]*r[a-zA-Z]*[[:space:]]+(/|~|\$HOME|\.\.)' && deny "recursive delete outside the worktree"
echo "$CMD" | grep -Eq '(^|[[:space:]])(sudo|chmod[[:space:]]+-R[[:space:]]+777)([[:space:]]|$)' && deny "privilege escalation"

if [ "$MODE" = "readonly" ]; then
  echo "$CMD" | grep -Eq 'git[[:space:]]+(commit|merge|checkout|switch|stash|add|rm|mv|tag|cherry-pick|revert|am|apply)' && deny "repository mutation (read-only role)"
  echo "$CMD" | grep -Eq '(^|[;&|[:space:]])(rm|mv|cp|touch|mkdir|tee|sed[[:space:]]+-i|npm[[:space:]]+(install|i|ci|uninstall)|pip[[:space:]]+install|yarn[[:space:]]+(add|install)|pnpm[[:space:]]+(add|install))([[:space:]]|$)' && deny "filesystem/dependency mutation (read-only role)"
  echo "$CMD" | grep -Eq '[^<>]>[^>&]|>>' && deny "output redirection to a file (read-only role)"
fi
exit 0
