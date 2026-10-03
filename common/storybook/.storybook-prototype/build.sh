#!/bin/bash
# PROTOTYPE ONLY: static build of the first-run prototype Storybook, for sharing as a directory.
cd "$(dirname "$0")/.." || exit 1
flox activate -- bash -c "DEBUG=0 NODE_OPTIONS=--max-old-space-size=16384 pnpm exec storybook build -c .storybook-prototype -o dist-prototype"
echo "EXIT $?"
