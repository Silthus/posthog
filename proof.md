# Workflows first-run AI proof

Ticket: https://github.com/Silthus/posthog/issues/261
Final implementation head: d1e0b0f99fd58241e93a0566b1f55df2195cf880
Claude review head: 260cca54a035935295b4c434e87efaf65b34bcd0
Draft PR: https://github.com/PostHog/posthog/pull/112079
Parent: a8c22c7ee3f83 (PostHog/posthog#112053)
Date: 2026-10-05

This proof covers panel opening and attached context. It does not cover AI applying edits to the unsaved email. The scope decision remains pending on the ticket.

## Test-first evidence

- red-panel.log: opening Make it yours fails the panel-open assertion before implementation.
- green-panel.log: the same panel/context behavior passes after implementation.
- red-runtime.log and green-runtime.log: switching to the legacy runtime clears the context after the fix.
- red-budget.log and green-budget.log: escaped oversized content stays parseable and under 64,000 characters after the fix.

## Final local gate

All commands ran through `.codex/with-flox` in the ticket worktree.

- `hogli test products/workflows/frontend/firstRun/firstRunEmailAgentLogic.test.ts`: review-final-test.log, exit 0.
- `pnpm --filter=@posthog/frontend typescript:check`: review-final-typescript.log, exit 0.
- `pnpm --filter=@posthog/frontend lint`: review-final-lint.log, exit 0, existing warnings.
- `pnpm --filter=@posthog/frontend format:check`: review-final-format.log, exit 0.
- `hogli ci:preflight --strict --against origin/feat/workflows-first-run-make-it-yours`: review-final-preflight.log, exit 0, inherited branch freshness advisory.
- The first-run folder also passed its existing Jest suites: review-first-run-tests.log.

## Browser proof

The scratch Storybook story renders the production first-run screen and the real side panel with repository template fixtures and a fake `example.com` sender. It uses a 1600px viewport and then a viewport that leaves the scene exactly 520px wide. Screenshots use deviceScaleFactor 2. The scratch story and temporary Storybook config were removed before the final gate.

- full.png: selected email and empty AI composer at full width.
- narrow.png: the same scene at exactly 520px.
- email-two.png: switching to email 2 updates the visible context chip.
- review-interaction.log: switching updates context; closing stays closed across switching; the button reopens AI with the current email.

No LLM prompt was submitted. No live backend, email send, or workflow creation was exercised.

## Other checks

CodeRabbit reported `not_authenticated`, so its local pass was skipped.
The PostHog PR image uploader refused this account after the explicit public-upload confirmation. These assets are stored on the fork instead.
A read-only merge-tree check found inherited parent-stack conflicts against upstream master in email.service.ts, its tests, and broadcastTestSendLogic.ts. No file in this ticket's increment conflicts.

## Review fixes

The single read-only Claude Opus 5.5 review ran after the draft opened, against the original head. claude-review.log records its report; review-response.md records every disposition. The subsequent fix commit has a green local gate and refreshed screenshots on its tree.

Each concrete fix has red/green evidence: dismiss, plaintext, html-budget, metadata, preflight, close, and other-panel logs. The final test runs all cases without skipping. The screenshot source is in proof-story.tsx; it is scratch and is absent from the implementation branch.

A chat message sent inside the canvas export debounce can still attach the previous committed design. No real LLM run or in-place AI edit is claimed. The scope question is recorded on the ticket.
