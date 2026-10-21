posthog-node: send a React Email component with react()
Label: wayfinder:implement
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: Spec: Resend parity, section "posthog-node", Open decision 1
Cast: Opus 5.5, high
Repository: PostHog/posthog-js
Base: ticket 03's branch

Charted only if Michael pulls `react()` in (Open decision 1). #526 lists it as a strong follow-up, and #120921 calls it a Node language extra, outside the parity surface: posthog-python gets no counterpart.

## What to build

A Resend call site `react: <Welcome name="Jane" />` becomes `content: react('Welcome to Acme', <Welcome name="Jane" />)`, and the component renders unchanged.

- posthog-node renders with `react-dom/server` as an optional peer dependency, with no Resend package (#528).
- `react(subject, element)` produces the same code content as `html(subject, renderedHtml)`; it sends no `text`, and the server derives it (spec pin).
- `subject` is required, because the component's `<Preview>` writes a `<title>` that is not the subject (#528).
- Without `react-dom` installed, the call returns a `validation_error` with why and fix, not a crash.

## Test seams

- The `emails` namespace with `fetch` mocked: a component with a conditional, a loop and a `Date` prop renders to the expected HTML in the request body, with no `text` (the #528 probe components).
- A missing peer returns the documented error.

## Proof

- Red then green at the seams.
- Live, with Harley's code-content route on a local stack: the three #528 demo templates land in the dev mail catcher and match a Resend render of the same props. Until the route exists, a recorded gap.

## Acceptance criteria

- [ ] The same component and props give the same HTML as Resend's render.
- [ ] `react-dom` stays optional.

## Blocked by

- Native: ticket 03.

## How to build (map #461)

- Run the `impact` check, then build test-first with `/tdd` at the seams named above. Mock only what the seam section allows.
- Repo skills apply where the diff touches their area.
- Read the contract [PostHog/posthog#120921](https://github.com/PostHog/posthog/issues/120921) first. Where the code must differ from it, stop and raise the difference with Michael.
- Public repo: no usage numbers, customer names, internal metrics, Slack content or security reasoning in code, commits or the PR. Fixture addresses use `example.com`.
- Shipped means a reviewed draft PR: the design pass, the owed proofs, the description with `pr-description`, and one cross-family review recorded with `fleet proof`. Never mark ready, enqueue or merge.
