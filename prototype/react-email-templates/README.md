# PROTOTYPE: React Email templates in PostHog

Throwaway code for [Silthus/posthog#528](https://github.com/Silthus/posthog/issues/528).
It is not production code and never merges.

**Question:** which path, or which mix, should posthog-node ship for React Email templates?

- **A. Render once.** Render the component with `{{ variables.<prop> }}` placeholders, upload it as a code-managed template, send by key with `data`.
- **B. Render per send.** Render with the real props on every send and send the HTML inline, as Resend does.
- **C. Hybrid.** Render per send, and also list the component in the template library, from its `PreviewProps` render, with key, hash and source path.
- **Mix.** Check each component: substitution only gets A, anything else gets C.

## Run it

```sh
cd prototype/react-email-templates
bun install
bun run start          # comparison page on http://localhost:4528
```

Other commands:

- `bun run build` writes `out/comparison.html`, one file that loads the demo images from `demo.react.email`.
- `bun run compare` prints the same results in the terminal.
- `bun run optional-prop` runs three render-once sends with and without an optional prop.
- `bun run own-render` compares a 30-line renderer on `react-dom/server` with React Email's `render`.

## What is real and what is faked

- **Real:** the React Email output (`react-email` 6.11.3, React 19), five demo templates from [`resend/react-email`](https://github.com/resend/react-email/tree/canary/apps/demo/emails) at `e0561e164e9c` (MIT, `emails/LICENSE.md`), and their images.
- **Copied from PostHog:** the Liquid settings of `nodejs/src/cdp/utils/liquid.ts` on `PostHog/posthog` master (`outputEscape: 'escape'`, entity decoding inside `{{ }}`), and the content hash of posthog-node's `email-content-hash.ts` (`feat/node-emails-send`).
- **Not used:** the `resend` SDK or API. The call site cards show Resend's code only for comparison.
- **Faked:** PostHog itself (`src/fake-posthog.ts`, in memory) and the posthog-node send paths (`src/sdk-sketch.tsx`). No email leaves the machine.
- `emails/plan-receipt-probe.tsx` is written for this prototype. It covers a conditional and an optional prop, which the demos don't.

## Files

- `src/sdk-sketch.tsx`: the three send paths and the substitution check.
- `src/own-render.tsx`: a renderer posthog-node could own, with no package from Resend.
- `src/fake-posthog.ts`: upload by key, send by key, send inline, with the 409 `template_outdated` rule.
- `src/scenarios.tsx`: one send per template, with the props a real app passes.
- `src/call-sites.ts`: each path's call site next to Resend's.
- `src/findings.ts`: the findings shown on the page.
