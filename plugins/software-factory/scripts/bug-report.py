#!/usr/bin/env python3
"""bug-report.py <run-dir> <iteration> [review.md]

Builds bug-report-<iteration>.md for the dev agent from verdict.json (failed/blocked criteria
and defects) and, optionally, blocking findings from review.md. Prints the output path.
"""
import json, os, re, sys

run_dir, it = sys.argv[1], sys.argv[2]
review = sys.argv[3] if len(sys.argv) > 3 else None
v = json.load(open(os.path.join(run_dir, "verdict.json")))
out = os.path.join(run_dir, f"bug-report-{it}.md")
lines = [f"# Bug report (iteration {it})", "",
         f"Tested commit: `{v.get('commit_sha')}` - overall: **{v.get('overall')}**", "",
         "Fix the defects below so the acceptance criteria pass. Do not change what the tests assert;",
         "if you believe a test contradicts the spec, say so in impl-summary.md under '## Spec disputes'", ""]
bad = [c for c in v.get("criteria", []) if c.get("status") != "pass"]
lines += ["## Criteria not passing", ""]
for c in bad:
    lines.append(f"- **{c['id']}** ({c['status']}): tests {', '.join(c.get('tests', []))}; evidence {', '.join(c.get('evidence', []))}")
    if c.get("notes"): lines.append(f"  - notes: {c['notes']}")
lines += ["", "## Defects", ""]
for i, d in enumerate(v.get("defects", []), 1):
    lines += [f"### D{i}: {d.get('title')} ({d.get('criterion')})", "",
              f"- Repro: {d.get('repro')}", f"- Expected: {d.get('expected')}", f"- Actual: {d.get('actual')}"]
    if d.get("evidence"): lines.append(f"- Evidence: {', '.join(d['evidence'])}")
    lines.append("")
if review and os.path.exists(review):
    txt = open(review, encoding="utf-8").read()
    m = re.search(r"^## Blocking findings\s*$(.*?)(?=^## |\Z)", txt, flags=re.M | re.S)
    if m and m.group(1).strip():
        lines += ["## Blocking review findings", "", m.group(1).strip(), ""]
open(out, "w", encoding="utf-8").write("\n".join(lines))
print(f"BUG_REPORT={out}")
