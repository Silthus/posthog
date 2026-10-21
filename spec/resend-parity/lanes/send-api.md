Lane prompt: strand send-api (the code-content send API)

Cast: Opus 5.5, `high`. Worktree: a new worktree from `spec/code-managed-templates` (PostHog/posthog#118924). Wall-time cap: 12 h of building; time spent waiting on another strand does not count.

You build the strand **send-api** of map [#461](https://github.com/Silthus/posthog/issues/461) alone, slice by slice, in this order:

1. Slice 01: `slices/01-attribution-python-and-send-route.md`. PR shape: new commits on the restacked draft PostHog/posthog#120628.
2. Slice 02: `slices/02-email-send-policy.md`. PR shape: a draft PR stacked on #118924 with `gh stack`.
3. Slice 03: `slices/03-email-send-command.md`. PR shape: a draft PR stacked on 02.
4. Slice 04: `slices/04-send-route-code-form.md`. PR shape: a draft PR stacked on 03.
5. Slice 07: `slices/07-send-route-admission-checks.md`. PR shape: a draft PR stacked on 04.
6. Slice 05: `slices/05-idempotent-enqueue.md`. PR shape: a draft PR stacked on 07, built once Harley's store lands.
7. Slice 06: `slices/06-send-route-idempotency.md`. PR shape: a draft PR stacked on 05.
8. Slice 08: `slices/08-email-status-record.md`. PR shape: its own draft PR on `master` once slice 04 merges, so the stack stays shallow.

Read first:

- The spec, `SPEC.md` on branch `spec/resend-parity` of Silthus/posthog, then each slice file in `slices/`. The slices are the spec; the strand issue only orders them.
- The strand issue on Silthus/posthog (the conductor gives its number at launch) and tick its checklist as slices finish.
- The contract [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921). Where the code must differ from it, stop and raise the difference with Michael.
- Harley's PRs this strand waits on: PostHog/posthog#120446, #120392 and #120510 merged, before slice 05.

How to build:

- Run the `impact` check once for the strand, then build each slice test-first with `/tdd` at the seams its file names. Mock only what the seam section allows. Repo skills apply where the diff touches their area.
- Per slice: a red/green test, its commits, and the PR shape above, opened as a draft with the `pr-description` skill and its owed proofs. The strand changes the worker count, not the PR count.
- You pick your own staging and subagents. Hand heavy exploration to a subagent rather than compacting repeatedly.
- When a slice waits on another strand or on Harley, build the slices you can, then wait in the foreground for the merge; do not start a watcher you leave running.
- Keep the stack shallow: ask Michael to merge #118924 and the refactors before the stack grows past three layers. Slice 04 owes the cross-version proof.
- Public repos: no usage numbers, customer names, internal metrics, Slack content or security reasoning in code, commits or PRs. Fixture addresses use `example.com`.
- Never mark a PR ready, never enqueue, never merge.

Review: when the last slice is up, run one GPT-6.1 Sol `high` review of the strand's whole diff through T3 `delegate_task`, record it with `fleet proof review-start` and `review-finish`, fix what holds in this lane, and give the fixes a final read (`--scope final`).

Hand off to the map conductor (not on any public issue):

- The draft PRs with their head SHAs and check state.
- Measurements for the retro: wall time, active time, slices, PRs and lines changed, merge conflicts, review rounds and findings (each classed as cross-slice or other), compactions, and anything redone or left unfinished.
