# First-run prototype (throwaway)

Answers [silthus/posthog#212](https://github.com/Silthus/posthog/issues/212): what should a paying team's first ten minutes in Workflows feel like, from the empty scene to a first delivered message?

Round 2 runs inside the real app (`<App />` in Storybook) on mocked APIs, behind the `workflows-first-run-prototype` flag. One flow, value first:

1. **Workflows tab.** Instead of the empty state, the tab says why a welcome email matters and shows what the project already captures: the signup event, how many people have an email, and the logo and colors picked up from the website (the in-flight Email brand detector).
2. **Send me an example.** One click sends the branded welcome email to the signed-in user only.
3. **The inbox.** A simulated inbox shows the email as it lands. Its footer links back into Workflows.
4. **The workflow.** The link opens the real editor on a "Welcome new signups" draft with the email step selected, so the team can edit it.
5. **Enable.** The workflow sends from a shared PostHog address with the team's name until the team adds its own domain. A banner says so and leads to the domain. When the domain verifies, the banner offers a one-click switch.
6. **Quick start.** The existing Quick start popover opens with a Workflows list the team can work through in any order: own domain, brand, re-engagement, a broadcast, templates.

The floating bar switches project data (signups and emails, few emails, nothing captured yet) and the own domain state (none, verifying, verified). "Start over" reloads.

## Run

```sh
pnpm --filter=@posthog/storybook prototype:first-run
```

Then open `http://127.0.0.1:6212/iframe.html?id=products-workflows-prototype-first-run--signups-and-emails&viewMode=story`.

Nothing here is production code. Do not merge this branch.
