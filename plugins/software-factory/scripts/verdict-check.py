#!/usr/bin/env python3
"""verdict-check.py <verdict.json> <spec.md> [--evidence-root DIR]

Hard validation of the QA verdict against the approved spec:
  - valid JSON with required top-level keys
  - every acceptance criterion in the spec (### AC-n headings) has exactly one entry
  - each entry has status pass|fail|blocked, at least one test id and one evidence file
  - each referenced evidence file exists (relative to --evidence-root, default: verdict dir)
  - overall is consistent: pass only if every criterion passed
  - every failed criterion has a defect entry
Exit 0 when valid, 1 otherwise (problems listed on stderr).
"""
import json, os, re, sys

def main():
    args = sys.argv[1:]
    if len(args) < 2:
        print(__doc__); return 2
    vpath, spath = args[0], args[1]
    root = os.path.dirname(os.path.abspath(vpath))
    if "--evidence-root" in args:
        root = args[args.index("--evidence-root") + 1]
    problems = []
    try:
        v = json.load(open(vpath))
    except Exception as e:
        print(f"verdict-check: FAIL - invalid JSON: {e}", file=sys.stderr); return 1
    spec = open(spath, encoding="utf-8").read()
    spec_ids = re.findall(r"^###\s+(AC-\d+)\b", spec, flags=re.M)
    if not spec_ids:
        problems.append("spec has no '### AC-n' headings; cannot map criteria")
    for k in ("run_id", "commit_sha", "tested_at", "overall", "environment", "criteria", "defects"):
        if k not in v: problems.append(f"missing top-level key '{k}'")
    if v.get("overall") not in ("pass", "fail", "blocked"):
        problems.append("overall must be pass|fail|blocked")
    crits = v.get("criteria") or []
    seen = {}
    for c in crits:
        cid = c.get("id")
        if not cid: problems.append("criterion without id"); continue
        if cid in seen: problems.append(f"{cid}: duplicated")
        seen[cid] = c
        if c.get("status") not in ("pass", "fail", "blocked"):
            problems.append(f"{cid}: status must be pass|fail|blocked")
        if not c.get("tests"): problems.append(f"{cid}: no tests listed")
        if not c.get("evidence"): problems.append(f"{cid}: no evidence listed")
        for ev in c.get("evidence") or []:
            p = ev if os.path.isabs(ev) else os.path.join(root, ev)
            if not os.path.exists(p): problems.append(f"{cid}: evidence file not found: {ev}")
    for sid in spec_ids:
        if sid not in seen: problems.append(f"{sid}: present in spec but missing from verdict")
    for cid in seen:
        if spec_ids and cid not in spec_ids: problems.append(f"{cid}: not in spec")
    statuses = [c.get("status") for c in crits]
    if v.get("overall") == "pass" and any(s != "pass" for s in statuses):
        problems.append("overall=pass but some criteria are not pass")
    if v.get("overall") != "pass" and statuses and all(s == "pass" for s in statuses):
        problems.append("all criteria pass but overall is not pass")
    failed = {c["id"] for c in crits if c.get("status") == "fail"}
    covered = {d.get("criterion") for d in (v.get("defects") or [])}
    for f in failed - covered:
        problems.append(f"{f}: failed without a defect entry (title/repro/expected/actual)")
    for d in v.get("defects") or []:
        for k in ("criterion", "title", "repro", "expected", "actual"):
            if not d.get(k): problems.append(f"defect for {d.get('criterion')}: missing '{k}'")
    env = v.get("environment") or {}
    if not env.get("setup_commands"): problems.append("environment.setup_commands is empty (must be reproducible)")
    if not env.get("test_command"): problems.append("environment.test_command missing")
    if problems:
        print("verdict-check: FAIL", file=sys.stderr)
        for p in problems: print(f"  - {p}", file=sys.stderr)
        return 1
    print(f"verdict-check: OK - overall={v['overall']}, {len(crits)} criteria, {len(v.get('defects') or [])} defects")
    return 0

if __name__ == "__main__":
    sys.exit(main())
