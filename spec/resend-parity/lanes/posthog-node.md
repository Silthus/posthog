Lane prompt: strand posthog-node (posthog-node)

Cast: Opus 5.5, `high`. Worktree: a new worktree of PostHog/posthog-js from `feat/node-emails-send` (PostHog/posthog-js#5312). Wall-time cap: 6 h of building; time spent waiting on another strand does not count.

You build the strand **posthog-node** of map [#461](https://github.com/Silthus/posthog/issues/461) alone, slice by slice, in this order:

1. Slice 09: `slices/09-posthog-node-template-form.md`. PR shape: new commits on PostHog/posthog-js#5312, or a draft PR stacked on it.
2. Slice 10: `slices/10-posthog-node-code-form.md`. PR shape: a draft PR stacked on 09.
3. Slice 11: `slices/11-posthog-node-emails-get.md`. PR shape: a draft PR stacked on 10.

Read first:

- The spec, `SPEC.md` on branch `spec/resend-parity` of Silthus/posthog, then each slice file in `slices/`. The slices are the spec; the strand issue only orders them.
- The strand issue on Silthus/posthog (the conductor gives its number at launch) and tick its checklist as slices finish.
- The contract [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921). Where the code must differ from it, stop and raise the difference with Michael.
- Harley's PRs this strand waits on: none.

How to build:

- Run the `impact` check once for the strand, then build each slice test-first with `/tdd` at the seams its file names. Mock only what the seam section allows. Repo skills apply where the diff touches their area.
- Per slice: a red/green test, its commits, and the PR shape above, opened as a draft with the `pr-description` skill and its owed proofs. The strand changes the worker count, not the PR count.
- You pick your own staging and subagents. Hand heavy exploration to a subagent rather than compacting repeatedly.
- When a slice waits on another strand or on Harley, build the slices you can, then wait in the foreground for the merge; do not start a watcher you leave running.
- Never use npm or yarn; posthog-js uses pnpm.
- Public repos: no usage numbers, customer names, internal metrics, Slack content or security reasoning in code, commits or PRs. Fixture addresses use `example.com`.
- Never mark a PR ready, never enqueue, never merge.

Review: when the last slice is up, run one GPT-6.1 Sol `high` review of the strand's whole diff through T3 `delegate_task`, record it with `fleet proof review-start` and `review-finish`, fix what holds in this lane, and give the fixes a final read (`--scope final`).

Hand off to the map conductor (not on any public issue):

- The draft PRs with their head SHAs and check state.
- Measurements for the retro: wall time, active time, slices, PRs and lines changed, merge conflicts, review rounds and findings (each classed as cross-slice or other), compactions, and anything redone or left unfinished.
