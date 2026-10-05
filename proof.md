# Workflows first-run AI proof

Ticket: https://github.com/Silthus/posthog/issues/261
Implementation head: 260cca54a035935295b4c434e87efaf65b34bcd0
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

- `hogli test products/workflows/frontend/firstRun/firstRunEmailAgentLogic.test.ts`: final-test.log, exit 0.
- `pnpm --filter=@posthog/frontend typescript:check`: final-typescript.log, exit 0.
- `pnpm --filter=@posthog/frontend lint`: final-lint.log, exit 0, existing warnings.
- `pnpm --filter=@posthog/frontend format:check`: final-format.log, exit 0.
- `hogli ci:preflight --strict --against origin/feat/workflows-first-run-make-it-yours`: final-preflight.log, exit 0, inherited branch freshness advisory.
- The first-run folder also passed its existing Jest suites: gate-tests.log.

## Browser proof

The scratch Storybook story renders the production first-run screen and the real side panel with repository template fixtures and a fake `example.com` sender. It uses a 1600px viewport and then a viewport that leaves the scene exactly 520px wide. Screenshots use deviceScaleFactor 2. The scratch story and temporary Storybook config were removed before the final gate.

- full.png: selected email and empty AI composer at full width.
- narrow.png: the same scene at exactly 520px.
- email-two.png: switching to email 2 updates the visible context chip.
- interaction.log: switching updates context; closing stays closed across switching; the button reopens AI with the current email.

No LLM prompt was submitted. No live backend, email send, or workflow creation was exercised.

## Other checks

CodeRabbit reported `not_authenticated`, so its local pass was skipped.
The PostHog PR image uploader refused this account after the explicit public-upload confirmation. These assets are stored on the fork instead.
A read-only merge-tree check found inherited parent-stack conflicts against upstream master in email.service.ts, its tests, and broadcastTestSendLogic.ts. No file in this ticket's increment conflicts.
