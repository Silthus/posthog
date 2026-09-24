#!/usr/bin/env bash
# bench.sh <baseUrl> <outDir> <runs> <scenario...>: repeated untraced runs, prints top-window and all-windows times.
set -uo pipefail
cd "$(dirname "$0")"
url="$1"; out="$2"; runs="$3"; shift 3
mkdir -p "$out"
for s in "$@"; do
    for i in $(seq 1 "$runs"); do
        timeout 300 node perf.mjs "$url" "$s" "$out/run$i" --no-trace >"$out/$s-$i.out" 2>&1
        python3 - "$out/run$i/$s.json" "$s" "$i" <<'EOF'
import json, sys
r = json.load(open(sys.argv[1]))
w = {x["app"]: x["firstRenderMs"] for x in r["windows"]}
top = w.get("workflows")
vals = [v for v in w.values() if v is not None]
print(f"{sys.argv[2]} run{sys.argv[3]}: top={top} all={max(vals) if vals else None} each={w}")
EOF
    done
done
