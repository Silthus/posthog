# Welcome modal proof

Ticket: https://github.com/Silthus/posthog/issues/273

Implementation head: 4e143b0fd52bcff72b7dd9d578966a2f00336271.
Parent gallery head: 6fefaffd3e1ded001a0022e910ae2990328d3a00.

The gallery test fails on the parent because requesting the welcome opens it over the gallery. The inherited hold implementation also fails when the modal opens before the welcoming surface mounts. `red-gallery.log` and `red-shared.log` record those failures. `green-gallery.log` records the same tests passing after the fix. `affected-jest-final.log` records the affected suites passing on the implementation head.

`red-consumer.log` records the rendered consumer test failing with `welcomeHeld` omitted from the opening effect dependencies. `green-consumer.log` records that same test passing with the correct dependency restored. This catches a pending welcome stranded after hold release without another explicit open request. `qa-report.md` carries the review handoff.

Final local gate:

- `.codex/with-flox pnpm --filter=@posthog/frontend typescript:check`: `typescript-final.log`.
- `.codex/with-flox pnpm --filter=@posthog/frontend fix`: `frontend-fix-final.log`.
- `.codex/with-flox env DEBUG=0 pnpm --filter=@posthog/frontend exec jest --runInBand --silent src/lib/components/NavPanelAdvertisement ../products/workflows/frontend/firstRun`: `affected-jest-final.log`.
- `.codex/with-flox hogli ci:preflight --strict --against upstream/master`: `preflight-final.log`.
- The actual first push, with pre-push hooks enabled: `pre-push.log`.
- The actual final code push, with pre-push hooks enabled: `pre-push-final.log`.

The feature layer adds no API or backend changes. Preflight also sees the inherited template/gallery commits. Their backend typecheck and OpenAPI proof is linked from https://github.com/Silthus/posthog/issues/257#issuecomment-5991156441. Preflight's freshness advisory checks the fork's older master; the implementation head contains the fetched upstream master, with no commits behind it.

Browser proof uses the existing Storybook gallery with a temporary nav-card-arrival story. Only repository mock data and public templates appear in the screenshots. The temporary stories are excluded from the implementation branch.

- `gallery-before.png`: the parent implementation shows a welcome modal above the gallery.
- `gallery-after.png`: the gallery has no welcome modal.
- `gallery-narrow.png`: a narrow scene has no welcome modal.
- `browser-before.log`, `browser-after.log`, `browser-variants.log`: browser assertions and runtime-error checks.

To reproduce, temporarily replace `products/workflows/frontend/firstRun/WorkflowsFirstRun.stories.tsx` with `WelcomeHold.proof.stories.tsx`. From the repository root, run `.codex/with-flox pnpm --filter=@posthog/storybook start` after changing its port to 6373, or run `.codex/with-flox env DEBUG=0 NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter=@posthog/storybook exec storybook dev -p 6373 --no-open --ci` after building the existing products and workers. Run `.codex/with-flox pnpm --filter=@posthog/storybook exec node <path-to-capture.cjs> after` and the equivalent command for `verify-returning.cjs`. Restore the story afterward.

The T3 preview host was unavailable, so the proof uses headless Playwright at device scale factor 2. Screenshot upload to PostHog/pr-assets returned a permission error; this fork branch provides the images instead.
