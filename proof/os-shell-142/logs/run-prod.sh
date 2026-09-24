#!/usr/bin/env bash
# Serve the production frontend build (frontend/dist) from Django, with no Vite dev server.
#   run-prod.sh <worktree> <web-port> [persisted-flags=os-shell]
# Build first with: pnpm --filter=@posthog/frontend build
# Same databases and services as run.sh (stack.env). JS_URL is empty, so the page loads /static/* from Django,
# and WhiteNoise serves frontend/dist through the static finders.
set -euo pipefail
STACK_DIR=/home/coder/dev/os-shell-stack
WT="$(realpath "$1")"
WEB_PORT="$2"
if [[ $# -ge 3 ]]; then FLAGS="$3"; else FLAGS="os-shell"; fi
case "$WEB_PORT" in 8000 | 8010 | 8020 | 8234) echo "demo port" >&2; exit 1 ;; esac
[[ -f "$WT/frontend/dist/index.html" ]] || { echo "no build in $WT/frontend/dist" >&2; exit 1; }
"$STACK_DIR/personhog.sh" start >/dev/null
export OS_STACK_ENV="$STACK_DIR/stack.env" OS_STACK_WEB_PORT="$WEB_PORT" OS_STACK_WORKERS="${WORKERS:-1}"
export SITE_URL="http://localhost:$WEB_PORT" JS_URL="" PERSISTED_FEATURE_FLAGS="$FLAGS"
cd "$WT"
setsid nohup flox activate -- bash -c '
    source "$OS_STACK_ENV"
    export JS_URL=""
    export PROMETHEUS_MULTIPROC_DIR=$(mktemp -d)
    python -m granian --interface asgi posthog.asgi:application \
        --host 127.0.0.1 --port "$OS_STACK_WEB_PORT" --workers "$OS_STACK_WORKERS"
' >"$WT/.scratch/142/web-prod-$WEB_PORT.log" 2>&1 </dev/null &
echo $! >"$WT/.scratch/142/web-prod-$WEB_PORT.pid"
for _ in $(seq 1 120); do
    [[ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$WEB_PORT/_livez" || true)" == "200" ]] && { echo "ready on $WEB_PORT"; exit 0; }
    sleep 2
done
echo "not ready" >&2
exit 1
