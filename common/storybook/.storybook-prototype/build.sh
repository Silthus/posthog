#!/bin/bash
# PROTOTYPE ONLY (#245): static build of the decision step prototype Storybook, for sharing as a directory.
cd "$(dirname "$0")/.." || exit 1
DEBUG=0 NODE_OPTIONS=--max-old-space-size=12288 pnpm exec storybook build -c .storybook-prototype -o dist-prototype
