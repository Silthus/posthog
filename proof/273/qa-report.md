# QA handoff for #273

Draft PR: https://github.com/PostHog/posthog/pull/111923

Clean code head: `4e143b0fd52bcff72b7dd9d578966a2f00336271`.

Ready for Michael's review under map #253's fork-CI exception. The PR stays a draft. No decision remains open.

## Review outcome

Two rounds, each with eight independent native GPT-6.1 Sol reviewers: correctness, security, production, design, tests, UI, fresh eyes, and adversary. Every reviewer covered the full increment and relevant callers. The second round found no new fixes or calls on the clean head.

Round 1's Tests reviewer found one missing behavioral test. The new rendered-consumer test proves that release opens the pending welcome automatically. Omitting the hold dependency makes it fail; restoring the dependency makes it pass. Fixed in `4e143b0fd52bcff72b7dd9d578966a2f00336271`.

Round 1's Adversary reviewer raised one outside-scope follow-up, below. The other six reviewers found nothing. Round 2's eight reviewers found nothing. No findings were rejected. No bot review findings or unresolved threads were present during observation.

## Proof

- `red-gallery.log` and `red-shared.log`: original gallery and late-holder failures.
- `green-gallery.log`: the same behavior green after implementation.
- `red-consumer.log` and `green-consumer.log`: automatic-opening mutation red and restored green.
- `typescript-final.log`, `frontend-fix-final.log`, `affected-jest-final.log`: final frontend gate, including eight suites and 50 passing tests.
- `preflight-final.log`: strict preflight against upstream master, zero failures.
- `pre-push-final.log`: final code push with hooks enabled, zero failures.
- `gallery-before.png`, `gallery-after.png`, `gallery-narrow.png`: rendered Storybook proof.
- `browser-before.log`, `browser-after.log`, `browser-variants.log`: browser checks. Gallery has no modal after the fix. Existing workflows with flag on or off retain the welcome.

The browser proof predates the final test-only commit; production files are identical. Final gate and review use the clean code head.

## Calls made

- Preserve the pending nav-card click while held, rather than discard it. Opening can resume when a eligible scene releases its hold.
- Hold during setup detection, rather than wait until the gallery is visible.
- Use product-local lifecycle and props callbacks, rather than a shared Workflows condition or subscription.
- Requeue a welcome that opened before its holder mounted, rather than leave it visible over the gallery.

## Read first and merge risk

Low risk. The shared modal's pending/open state and opening effect deserve the first read. Workflows is the only hold caller and mounts behind `workflows-first-run` on the Workflows tab.

Increment relative to the accepted gallery plus fetched master: four production files, +95/-7; three test files, +132/-4; seven total files, +227/-11. Parent commits remain in the PR against master.

## Follow-up

The App's lazy ProductEmptyStateGate can leave a pre-gallery loading interval where existing welcome readiness opens the modal before the tab mounts. The holder hides and requeues it before the gallery appears. Changing shell readiness or moving the hold into WorkflowsScene falls outside #273's write scope. No separate work was dispatched.

## Gaps

- Upstream Actions await maintainer approval with `action_required`, including frontend, backend, Python, and Storybook. Available checks passed or skipped, with no failing or pending check. Map #253 explicitly accepts this fork-CI gap.
- CodeRabbit CLI was signed out and skipped. No remote review arrived during the bounded observation after PR creation.
- The requested all-GPT native panel replaces the skill's complementary Claude family.
- T3 preview reported no available host. Headless Playwright supplied Storybook proof.
- PostHog screenshot upload lacked permission. Images are published on the fork proof branch.
- Assigning the verified human driver to the upstream PR failed with permission denied. The PR's Agent context identifies human-driven work.
- Preflight sees inherited parent changes and advises backend/OpenAPI verification. Their proof is linked in README.md. Its stale-fork freshness advisory does not describe upstream freshness; this head contains fetched upstream master.

No reply draft or open question remains. No ready-state change, queue action, or merge occurred.
