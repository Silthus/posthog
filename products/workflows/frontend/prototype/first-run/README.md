# First-run prototype (throwaway)

Answers [silthus/posthog#212](https://github.com/Silthus/posthog/issues/212): what should a paying team's first ten minutes in Workflows feel like, from the empty scene to a first delivered message?

Three structurally different variants on a simulated backend, switchable with `?variant=A|B|C` or the floating bar (arrow keys work too).

- **A, Send yourself one first.** The first screen is a composer. One click sends a template to the signed-in user from the sandbox sender. Domain, people and workflow-versus-broadcast come after the first delivery.
- **B, Setup checklist.** Five rows in sending order: sender, people, when to send, message, test and go live. Each row shows its state from the project data and expands in place. The canvas never appears.
- **C, Recipes from your data.** A gallery of starter recipes graded against the project's events and people. A recipe opens as a filled-in canvas next to a "before this can send" panel with fixes.

Scenario knobs in the floating bar: DNS verifies instantly or stays pending, how many people have an `email`, which events the project sends. The State button shows the simulated backend.

Assumed: a sandbox sender that emails only the signed-in user ([#225](https://github.com/Silthus/posthog/issues/225)). The email domain wizard, Audience and Email brand are in flight elsewhere; dashed "In flight" boxes mark where they plug in.

## Run

```sh
pnpm --filter=@posthog/storybook prototype:first-run
```

Then open `http://127.0.0.1:6212/iframe.html?id=products-workflows-prototype-first-run--first-run&viewMode=story&variant=A`.

Nothing here is production code. Do not merge this branch.
