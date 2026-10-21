posthog-node: upload the React preview render as a code-managed template
Label: wayfinder:implement
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: Spec: Resend parity, section "posthog-node", Open decision 1
Cast: Opus 5.5, high
Repository: PostHog/posthog-js
Base: ticket 05's branch

Charted only if Michael pulls `react()` in (Open decision 1). It is a Node language extra, outside the parity surface of #120921.

## What to build

A React email shows in the PostHog template library like any code-managed template (#528, posthog-node PR 2):

- posthog-node renders a component with its `PreviewProps` and uploads the result by the send's `key` as a "Managed by code" template, through the existing upload by key, with `source` filled as for template files.
- Each React send to that key links to the template, so its logs, metrics and preview sit on one entry.
- A send by key alone (`libraryTemplate(key)`) to a preview-render template is refused with why and fix, because the stored render holds preview data, not a real recipient's (#528).
- The upload is explicit (`uploadTemplate` for a component), run in a deploy step, CI or by the agent, never by a send.

## Test seams

- The `emails` namespace with `fetch` mocked: the upload body for a component with `PreviewProps`, and `source` filled.
- The refusal of a key-only send to a preview-render template, at the server's answer.

## Proof

- Local stack: upload the three #528 demo templates, see them as "Managed by code" in the library, send one with real props, and see the email in the dev mail catcher.

## Acceptance criteria

- [ ] No send uploads.
- [ ] A key-only send to a preview-render template never goes out.

## Blocked by

- Native: ticket 05.
- Named: the server refusal of a key-only send to a preview-render template is not in #120921; raise it with Harley before this ticket starts.

## How to build (map #461)

- Run the `impact` check, then build test-first with `/tdd` at the seams named above. Mock only what the seam section allows.
- Repo skills apply where the diff touches their area.
- Read the contract [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921) first. Where the code must differ from it, stop and raise the difference with Michael.
- Public repo: no usage numbers, customer names, internal metrics, Slack content or security reasoning in code, commits or the PR. Fixture addresses use `example.com`.
- Shipped means a reviewed draft PR: the design pass, the owed proofs, the description with `pr-description`, and one cross-family review recorded with `fleet proof`. Never mark ready, enqueue or merge.
