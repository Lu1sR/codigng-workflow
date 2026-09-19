#!/usr/bin/env bash
# set-state.sh <run-dir> <state> [key=value ...]
# Updates run.json: sets "state", appends a history entry, and sets extra keys (JSON-parsed when possible).
set -euo pipefail
RUN_DIR="${1:?run dir}"; STATE="${2:?state}"; shift 2
python3 - "$RUN_DIR/run.json" "$STATE" "$@" <<'PY'
import json, sys, datetime
path, state, *kv = sys.argv[1:]
d = json.load(open(path))
d["state"] = state
for item in kv:
    k, _, v = item.partition("=")
    try: v = json.loads(v)
    except Exception: pass
    d[k] = v
d.setdefault("history", []).append({"at": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"), "state": state, **{i.partition("=")[0]: d[i.partition("=")[0]] for i in kv}})
json.dump(d, open(path, "w"), indent=2)
print(f"state={state}")
PY
