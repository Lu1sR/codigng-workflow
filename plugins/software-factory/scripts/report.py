#!/usr/bin/env python3
"""report.py <run-dir>

Assembles report.md (the PR body / evidence pack index) from run.json, spec.md, verdict.json,
review.md and the evidence directory. Prints the output path.
"""
import json, os, re, sys, glob, subprocess

run_dir = sys.argv[1]
J = lambda n: json.load(open(os.path.join(run_dir, n))) if os.path.exists(os.path.join(run_dir, n)) else {}
T = lambda n: open(os.path.join(run_dir, n), encoding="utf-8").read() if os.path.exists(os.path.join(run_dir, n)) else ""
run, v, spec, review = J("run.json"), J("verdict.json"), T("spec.md"), T("review.md")

def git(*args):
    try:
        return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout
    except Exception:
        return ""

def diff_stats(run):
    """Lines added/removed and files changed between base and the feature branch head."""
    repo, base, head = run.get("repo"), run.get("base_sha"), run.get("dev_sha")
    if not (repo and base and head): return None
    out = git("-C", repo, "diff", "--numstat", f"{base}..{head}")
    add = rem = files = 0
    for line in out.splitlines():
        a, r, _ = line.split("\t", 2)
        files += 1
        if a.isdigit(): add += int(a)
        if r.isdigit(): rem += int(r)
    return {"files": files, "added": add, "removed": rem}

def shortcut_markers(run):
    """shortcut: markers introduced by this run (added lines in the base..head diff)."""
    repo, base, head = run.get("repo"), run.get("base_sha"), run.get("dev_sha")
    if not (repo and base and head): return []
    out = git("-C", repo, "diff", "--unified=0", f"{base}..{head}")
    markers, fname, lineno = [], None, 0
    for line in out.splitlines():
        if line.startswith("+++ "):
            fname = line[6:] if line.startswith("+++ b/") else line[4:]
        elif line.startswith("@@"):
            m = re.search(r"\+(\d+)", line); lineno = int(m.group(1)) if m else 0
        elif line.startswith("+") and not line.startswith("+++"):
            m = re.search(r"shortcut:\s*(.*)$", line)
            if m:
                text = m.group(1).strip()
                markers.append({"file": fname, "line": lineno, "text": text,
                                "has_upgrade": bool(re.search(r"upgrade:", text))})
            lineno += 1
        elif line.startswith(" "):
            lineno += 1
    return markers

titles = dict(re.findall(r"^###\s+(AC-\d+)[:\s-]*(.*)$", spec, flags=re.M))
goal = re.search(r"^## Goal\s*$(.*?)(?=^## |\Z)", spec, flags=re.M | re.S)
rv = re.search(r"^Verdict:\s*(.*)$", review, flags=re.M)
icon = {"pass": "PASS", "fail": "FAIL", "blocked": "BLOCKED"}

L = [f"# {run.get('title', run.get('run_id'))}", "",
     f"Software-factory run `{run.get('run_id')}` - state **{run.get('state')}**, {run.get('iteration', 0)} dev/QA iteration(s).", "",
     f"- Base: `{run.get('base_ref')}` @ `{(run.get('base_sha') or '')[:12]}`",
     f"- Head: `{run.get('feature_branch')}` @ `{(run.get('dev_sha') or '')[:12]}`",
     f"- QA overall: **{icon.get(v.get('overall'), 'n/a')}** on `{(v.get('commit_sha') or '')[:12]}` at {v.get('tested_at', 'n/a')}",
     f"- Review: **{rv.group(1).strip() if rv else 'n/a'}**", ""]
if goal:
    L += ["## Goal", "", goal.group(1).strip(), ""]
L += ["## Acceptance criteria - traceability", "", "| Criterion | Status | Tests | Evidence |", "|---|---|---|---|"]
for c in v.get("criteria", []):
    L.append(f"| {c['id']} {titles.get(c['id'], '')} | {icon.get(c.get('status'), c.get('status'))} | "
             f"{'<br>'.join(f'`{t}`' for t in c.get('tests', []))} | {'<br>'.join(f'`{e}`' for e in c.get('evidence', []))} |")
L.append("")
if v.get("defects"):
    L += ["## Open defects", ""]
    for d in v["defects"]:
        L.append(f"- **{d.get('criterion')}** {d.get('title')}: expected {d.get('expected')}; actual {d.get('actual')}")
    L.append("")
stats = diff_stats(run)
if stats:
    L += ["## Diff size", "", f"{stats['files']} files, +{stats['added']} / -{stats['removed']} lines (`{(run.get('base_sha') or '')[:12]}..{(run.get('dev_sha') or '')[:12]}`)", ""]
markers = shortcut_markers(run)
L += ["## Deliberate shortcuts introduced by this run", ""]
if markers:
    for m in markers:
        flag = "" if m["has_upgrade"] else " **(no upgrade trigger)**"
        L.append(f"- `{m['file']}:{m['line']}` {m['text']}{flag}")
    missing = sum(1 for m in markers if not m["has_upgrade"])
    L += ["", f"{len(markers)} marker(s), {missing} without an upgrade trigger.", ""]
else:
    L += ["None.", ""]
lean = re.search(r"^## Lean findings\s*$(.*?)(?=^## |\Z)", review, flags=re.M | re.S)
if lean and lean.group(1).strip():
    L += ["## Lean findings (non-blocking)", "", lean.group(1).strip(), ""]
env = v.get("environment") or {}
L += ["## How to reproduce the QA run", "", "```bash",
      f"git checkout {run.get('feature_branch')}"]
L += env.get("setup_commands", [])
if env.get("test_command"): L.append(env["test_command"])
L += ["```", ""]
if review:
    summ = re.search(r"^## Summary\s*$(.*?)(?=^## |\Z)", review, flags=re.M | re.S)
    if summ: L += ["## Review summary", "", summ.group(1).strip(), ""]
L += ["## Evidence index", ""]
ev_root = os.path.join(run_dir, "evidence")
for p in sorted(glob.glob(os.path.join(ev_root, "**", "*"), recursive=True)):
    if os.path.isfile(p):
        rel = os.path.relpath(p, run_dir); size = os.path.getsize(p)
        meta = ""
        if p.endswith(".json"):
            try:
                m = json.load(open(p))
                if "exit_code" in m: meta = f" - exit {m['exit_code']}, {m.get('duration_s', '?')}s, `{m.get('command', '')[:80]}`"
            except Exception: pass
        L.append(f"- `{rel}` ({size} B){meta}")
L += ["", f"_Evidence files live in `{os.path.relpath(run_dir, run.get('repo', run_dir))}` (git-ignored). Report generated by software-factory._", ""]
out = os.path.join(run_dir, "report.md")
open(out, "w", encoding="utf-8").write("\n".join(L))
print(f"REPORT={out}")
