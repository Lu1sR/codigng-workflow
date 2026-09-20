#!/usr/bin/env python3
"""Contextly engine: freshness of a repository's `.context/` store.

    .context/
        index.md  architecture.md  conventions.md  decisions.md   curated, committed
        config.json   {"watch": [...], "ignore": [...]}
        state.json    {"last_sync": "<commit sha>"}

Three commands, all read-only:

    digest   SessionStart hook: reads the hook JSON on stdin, prints the
             additionalContext payload (empty when the repo has no store)
    status   the same information for a human or a command, plus --json
    check    every repo path a document names must exist, plus --json

Stdlib and git only. Every entry point catches broadly and exits 0 when run
as a hook: context bookkeeping never breaks the session it is helping.
"""

from __future__ import annotations

import fnmatch
import json
import os
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

sys.dont_write_bytecode = True

CONTEXT_DIR = ".context"
CURATED = ("index.md", "architecture.md", "conventions.md", "decisions.md")
DEFAULT_CONFIG = {
    "watch": ["**"],
    "ignore": [
        ".git/**", ".context/**", ".factory/**", "worktrees/**",
        "node_modules/**", "dist/**", "build/**", "target/**",
        ".venv/**", "venv/**", "**/__pycache__/**",
        "*.lock", "*-lock.json", "pnpm-lock.yaml",
    ],
}
DIGEST_MAX_GROUPS = 12


# --- repository -------------------------------------------------------------


def git(root: Path, *args: str) -> str | None:
    try:
        out = subprocess.run(
            ["git", *args], cwd=root, capture_output=True, text=True, timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return out.stdout if out.returncode == 0 else None


def repo_root(cwd: str | None = None) -> Path:
    env = os.environ.get("CLAUDE_PROJECT_DIR")
    if env and Path(env).is_dir():
        return Path(env).resolve()
    start = Path(cwd or os.getcwd())
    top = git(start, "rev-parse", "--show-toplevel")
    return Path(top.strip()).resolve() if top else start.resolve()


def context_dir(root: Path) -> Path:
    return root / CONTEXT_DIR


def is_initialized(root: Path) -> bool:
    return (context_dir(root) / "index.md").is_file()


def read_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def load_config(root: Path) -> dict:
    config = {k: list(v) for k, v in DEFAULT_CONFIG.items()}
    user = read_json(context_dir(root) / "config.json", {})
    for key in ("watch", "ignore"):
        if isinstance(user.get(key), list):
            config[key] = user[key]
    return config


def last_sync(root: Path) -> str | None:
    value = read_json(context_dir(root) / "state.json", {}).get("last_sync")
    if isinstance(value, dict):  # the pre-plugin layout kept {"commit": ..., "at": ...}
        value = value.get("commit")
    return value if isinstance(value, str) and value else None


# --- change detection -------------------------------------------------------


def matches_any(rel: str, patterns) -> bool:
    """fnmatch lets `*` cross `/`, so `src/**` and `src/*` behave the same.
    Over-matching a watch pattern only means one extra file gets noticed."""
    for pattern in patterns or []:
        if fnmatch.fnmatch(rel, pattern):
            return True
        if pattern.endswith("/**") and fnmatch.fnmatch(rel, pattern[:-3]):
            return True
    return False


def is_watched(rel: str, config: dict) -> bool:
    rel = rel.replace(os.sep, "/")
    if rel.startswith("./"):
        rel = rel[2:]
    if matches_any(rel, config["ignore"]):
        return False
    return matches_any(rel, config["watch"])


def commit_exists(root: Path, sha: str) -> bool:
    return git(root, "cat-file", "-e", f"{sha}^{{commit}}") is not None


def changed_since(root: Path, sha: str | None, config: dict) -> list[str]:
    """Watched files touched since `sha`, committed or not."""
    paths: set[str] = set()
    if sha and commit_exists(root, sha):
        diff = git(root, "diff", "--name-only", f"{sha}..HEAD") or ""
        paths.update(line for line in diff.splitlines() if line)
    # Do not strip: a porcelain line for an unstaged edit starts with a space.
    status = git(root, "status", "--porcelain") or ""
    for line in status.splitlines():
        if len(line) > 3:
            path = line[3:].strip()
            if " -> " in path:
                path = path.split(" -> ", 1)[1]
            paths.add(path.strip('"'))
    return sorted(p for p in paths if is_watched(p, config))


def group_by_dir(paths: list[str]) -> list[str]:
    """`src/api/ (4)` style summary so a digest stays short on big diffs."""
    counts: Counter[str] = Counter()
    for path in paths:
        head, sep, _ = path.partition("/")
        counts[head + "/" if sep else head] += 1
    parts = []
    for name, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])):
        parts.append(f"{name} ({n})" if n > 1 or name.endswith("/") else name)
    return parts


def freshness(root: Path) -> dict:
    config = load_config(root)
    sync = last_sync(root)
    changed = changed_since(root, sync, config) if is_initialized(root) else []
    reasons = []
    if not is_initialized(root):
        reasons.append("no context store (run /contextly:init)")
    elif not sync:
        reasons.append("no recorded sync commit")
    elif not commit_exists(root, sync):
        reasons.append(f"sync commit {sync[:8]} is not in this history")
    if changed:
        reasons.append(f"{len(changed)} watched file(s) changed since the last sync")
    return {
        "initialized": is_initialized(root),
        "last_sync": sync,
        "changed_files": changed,
        "stale": bool(reasons),
        "reasons": reasons,
    }


# --- claim checking ---------------------------------------------------------

_FENCE = re.compile(r"^\s*(```|~~~)")
_INLINE_CODE = re.compile(r"`([^`\n]+)`")
_PATHY = re.compile(r"^[\w.@][\w.@/+-]*$")
_KNOWN_EXT = (
    ".md", ".py", ".js", ".ts", ".tsx", ".jsx", ".json", ".yml", ".yaml", ".toml",
    ".sh", ".rb", ".go", ".rs", ".java", ".sql", ".prisma", ".cfg", ".ini", ".env",
    ".txt", ".html", ".css", ".mjs", ".cjs",
)


def claimed_paths(text: str):
    """Repo paths asserted in inline code spans, outside fenced blocks.
    Fenced blocks are shell, git refs and pseudo-code: noise, not claims."""
    in_fence = False
    for lineno, line in enumerate(text.splitlines(), 1):
        if _FENCE.match(line):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        for token in _INLINE_CODE.findall(line):
            token = token.strip().rstrip(".,;:")
            if not token or not _PATHY.match(token) or "://" in token or "*" in token:
                continue
            if "/" not in token and not token.endswith(_KNOWN_EXT):
                continue
            yield lineno, token.rstrip("/")


def check_claims(root: Path) -> list[dict]:
    """Every path a document names must still exist. A token is judged only
    when it plausibly refers to this repo: known extension, or its first
    segment exists. That keeps `origin/main` and `feat/<name>` out."""
    misses = []
    for doc in sorted(context_dir(root).glob("*.md")):
        try:
            text = doc.read_text(encoding="utf-8")
        except OSError:
            continue
        seen: set[str] = set()
        for lineno, token in claimed_paths(text):
            if token in seen:
                continue
            first = token.split("/", 1)[0]
            judgeable = (
                token.endswith(_KNOWN_EXT)
                or (root / first).exists()
                or (doc.parent / first).exists()
            )
            if not judgeable or (root / token).exists() or (doc.parent / token).exists():
                continue
            seen.add(token)
            misses.append({"document": doc.name, "line": lineno, "path": token})
    return misses


# --- commands ---------------------------------------------------------------


def build_digest(root: Path) -> str:
    if not is_initialized(root):
        return ""  # a repo without a store has nothing to say
    fresh = freshness(root)
    docs = [d for d in CURATED if (context_dir(root) / d).is_file()]
    lines = [
        "Contextly: this repository's durable context lives in `.context/` "
        "(" + ", ".join(f"`{d}`" for d in docs) + "). Read `.context/index.md` "
        "before architecture or \"where does X live\" questions; prefer it over "
        "re-deriving the layout.",
    ]
    if not fresh["stale"]:
        lines.append(f"Status: fresh, synced at commit {fresh['last_sync'][:8]}.")
    else:
        lines.append("Status: STALE, " + "; ".join(fresh["reasons"]) + ".")
        if fresh["changed_files"]:
            groups = group_by_dir(fresh["changed_files"])
            shown = ", ".join(groups[:DIGEST_MAX_GROUPS])
            more = f", +{len(groups) - DIGEST_MAX_GROUPS} more" if len(groups) > DIGEST_MAX_GROUPS else ""
            lines.append(f"Changed since sync: {shown}{more}. Treat the sections "
                         "covering those areas as needing verification; the rest is current.")
        lines.append("Run /contextly:update once the current task is done.")
    broken = check_claims(root)
    if broken:
        shown = "; ".join(f"{m['document']}:{m['line']} `{m['path']}`" for m in broken[:5])
        more = f" (+{len(broken) - 5} more)" if len(broken) > 5 else ""
        lines.append(f"Broken path claims in the store: {shown}{more}.")
    return "\n".join(lines)


def cmd_digest() -> int:
    try:
        payload = json.load(sys.stdin)
    except (ValueError, OSError):
        payload = {}
    try:
        summary = build_digest(repo_root(payload.get("cwd")))
    except Exception:  # never break a session over context bookkeeping
        return 0
    if summary:
        json.dump(
            {"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": summary}},
            sys.stdout,
        )
    return 0


def cmd_status(root: Path, as_json: bool) -> int:
    fresh = freshness(root)
    if as_json:
        print(json.dumps(fresh, indent=2, sort_keys=True))
        return 0 if fresh["initialized"] else 1
    if not fresh["initialized"]:
        print("contextly: not initialized (no .context/index.md)")
        return 1
    print(f"contextly: {'STALE' if fresh['stale'] else 'fresh'}")
    print(f"  last sync : {(fresh['last_sync'] or 'none')[:8]}")
    for reason in fresh["reasons"]:
        print(f"  ! {reason}")
    if fresh["changed_files"]:
        print("  changed   : " + ", ".join(group_by_dir(fresh["changed_files"])))
        for path in fresh["changed_files"][:30]:
            print(f"      {path}")
        if len(fresh["changed_files"]) > 30:
            print(f"      ... +{len(fresh['changed_files']) - 30} more")
    return 0


def cmd_check(root: Path, as_json: bool) -> int:
    if not is_initialized(root):
        print("contextly: not initialized (no .context/index.md)")
        return 1
    misses = check_claims(root)
    if as_json:
        print(json.dumps({"broken_paths": misses}, indent=2, sort_keys=True))
    elif not misses:
        print("contextly: every path named in the store exists")
    else:
        print(f"contextly: {len(misses)} broken path claim(s)")
        for m in misses:
            print(f"  {m['document']}:{m['line']}  {m['path']}")
    return 1 if misses else 0


USAGE = """usage: contextly.py <command> [--json]
  digest   SessionStart hook (hook JSON on stdin)
  status   freshness of the repo you are in
  check    every path the store names must exist"""


if __name__ == "__main__":
    args = sys.argv[1:]
    cmd = next((a for a in args if not a.startswith("-")), "status")
    as_json = "--json" in args
    if cmd == "digest":
        raise SystemExit(cmd_digest())
    if cmd == "status":
        raise SystemExit(cmd_status(repo_root(), as_json))
    if cmd == "check":
        raise SystemExit(cmd_check(repo_root(), as_json))
    print(USAGE, file=sys.stderr)
    raise SystemExit(2)
