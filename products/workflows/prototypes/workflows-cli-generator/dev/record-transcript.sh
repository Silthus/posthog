#!/usr/bin/env bash
# Runs every command the evidence records, in order, and prints the state after each one.
# Start the stub first: node dev/fake-posthog.mjs
#
# The credentials here are for the local stub. Nothing in this file is a real key.

set -u
cd "$(dirname "$0")/.."

export POSTHOG_CLI_HOST=http://localhost:8099
export POSTHOG_CLI_PROJECT_ID=2
export POSTHOG_CLI_API_KEY=phx_localstub_not_a_real_key

CLI="node bin/posthog-workflows.mjs"

say() { printf '\n$ %s\n' "$*"; }

# The files that were already here before the first command ran. Every "working tree" line
# below is the difference against this, so a file any command wrote would show up alone.
BASELINE=$(mktemp)
/usr/bin/git status --short --untracked-files=all -- . | sort > "$BASELINE"

state() {
    printf -- '--- state: project 2 ---\n'
    curl -sS "$POSTHOG_CLI_HOST/__stub/state" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.stringify(JSON.parse(d),null,2)))'
    printf -- '--- state: working tree, new since the first command ---\n'
    /usr/bin/git status --short --untracked-files=all -- . | sort | comm -13 "$BASELINE" - | sed 's/^/  /'
    printf -- '  (empty: the command wrote no file into the repository)\n'
}

say "node bin/posthog-workflows.mjs check example/onboarding.workflow.ts   # no credentials"
env -u POSTHOG_CLI_API_KEY -u POSTHOG_CLI_PROJECT_ID -u POSTHOG_CLI_HOST $CLI check example/onboarding.workflow.ts
printf 'exit=%s\n' "$?"
state

say "$CLI check example/onboarding.workflow.ts   # with credentials, nothing pushed yet"
ONBOARDING_WEBHOOK_SECRET=stub-signing-key-v1 $CLI check example/onboarding.workflow.ts
printf 'exit=%s\n' "$?"
state

say "$CLI push example/onboarding.workflow.ts"
ONBOARDING_WEBHOOK_SECRET=stub-signing-key-v1 $CLI push example/onboarding.workflow.ts
printf 'exit=%s\n' "$?"
state

say "$CLI push example/onboarding.workflow.ts   # again, nothing changed"
ONBOARDING_WEBHOOK_SECRET=stub-signing-key-v1 $CLI push example/onboarding.workflow.ts
printf 'exit=%s\n' "$?"
state

say "$CLI diff example/onboarding.workflow.ts"
ONBOARDING_WEBHOOK_SECRET=stub-signing-key-v1 $CLI diff example/onboarding.workflow.ts
printf 'exit=%s\n' "$?"
state

printf '\n# someone edits the workflow in the PostHog UI: activates it and renames a step\n'
ID=$(curl -sS "$POSTHOG_CLI_HOST/__stub/state" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(JSON.parse(d)[0].id))')
curl -sS -X POST "$POSTHOG_CLI_HOST/__stub/drift" -H 'Content-Type: application/json' \
    -d "{\"id\":\"$ID\",\"patch\":{\"status\":\"active\"}}" >/dev/null
state

say "$CLI diff example/onboarding.workflow.ts   # after the drift"
ONBOARDING_WEBHOOK_SECRET=stub-signing-key-v1 $CLI diff example/onboarding.workflow.ts
printf 'exit=%s\n' "$?"
state

say "$CLI push example/onboarding.workflow.ts   # the next push wins"
ONBOARDING_WEBHOOK_SECRET=stub-signing-key-v1 $CLI push example/onboarding.workflow.ts
printf 'exit=%s\n' "$?"
state

say "$CLI push example/onboarding.workflow.ts   # rotated secret only"
ONBOARDING_WEBHOOK_SECRET=stub-signing-key-v2-rotated $CLI push example/onboarding.workflow.ts
printf 'exit=%s\n' "$?"
state

say "$CLI push --force example/onboarding.workflow.ts   # rotation lands"
ONBOARDING_WEBHOOK_SECRET=stub-signing-key-v2-rotated $CLI push --force example/onboarding.workflow.ts
printf 'exit=%s\n' "$?"
state

say "$CLI push example/onboarding.workflow.ts   # the secret is not set"
env -u ONBOARDING_WEBHOOK_SECRET $CLI push example/onboarding.workflow.ts
printf 'exit=%s\n' "$?"
state

say "$CLI push example/two-workflows.workflow.ts   # two workflows in one file"
$CLI push example/two-workflows.workflow.ts
printf 'exit=%s\n' "$?"
state

say "$CLI check --json example/two-workflows.workflow.ts   # what CI reads"
$CLI check --json example/two-workflows.workflow.ts
printf 'exit=%s\n' "$?"

say "$CLI check example/nothing.workflow.ts"
$CLI check example/nothing.workflow.ts
printf 'exit=%s\n' "$?"

say "$CLI check example/unfinished.workflow.ts"
$CLI check example/unfinished.workflow.ts
printf 'exit=%s\n' "$?"

say "node node_modules/jiti/lib/jiti-cli.mjs example/onboarding.workflow.ts   # the file as a program"
node node_modules/jiti/lib/jiti-cli.mjs example/onboarding.workflow.ts
printf 'exit=%s\n' "$?"

printf '\n--- what jiti cached, and where ---\n'
find node_modules/.cache/jiti -type f 2>/dev/null | head -5 || printf '(no cache directory)\n'
printf '\n--- working tree after every command ---\n'
/usr/bin/git status --short
printf '(only the prototype source, which is what we wrote by hand)\n'
