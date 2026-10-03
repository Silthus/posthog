# First-run prototype (throwaway)

Answers [silthus/posthog#212](https://github.com/Silthus/posthog/issues/212): what should a paying team's first ten minutes in Workflows feel like, from the empty scene to a first delivered message?

Runs inside the real app (`<App />` in Storybook) on mocked APIs, behind the `workflows-first-run-prototype` flag.

Round 4 starts from an example instead of a pitch, and every variant leads through the same three steps:

1. **Make it yours.** The email is already in the team's brand (logo and colors from its website, standing in for the in-flight Email brand detector). PostHog AI changes it on request, and the text stays editable.
2. **Send yourself a test.** It lands in a simulated inbox, exactly as users will get it.
3. **Turn it on.** It goes out from `onboarding@trial.posthog.com` with the team's name on it. The workflow opens live in the real editor, a banner leads to the team's own domain, and Quick start lists what to try next.

The examples come from the real template library, filtered to what the project's events support.

- **F, Example first.** The best fit is already open. Other picks and the full library are one click away.
- **G, Tailored gallery.** Three templates picked for your data, previewed in your brand. One opens a focused workspace for the three steps.
- **H, PostHog AI walks you through.** A chat says what it found, offers the fitting emails, takes changes, sends the test and turns it on. The email stays in view.
- **I, Your brand first.** A generic email next to the same email in your brand, then pick one and go through the steps.

The floating bar switches the variant (arrow keys work too), the project data (signups and emails, few emails, nothing captured yet) and the own domain state (none, verifying, verified). `?variant=F` to `I` in the URL picks a variant. "Start over" reloads.

## Run

```sh
pnpm --filter=@posthog/storybook prototype:first-run
```

Then open `http://127.0.0.1:6212/iframe.html?id=products-workflows-prototype-first-run--variant-f-example-first&viewMode=story`.

Nothing here is production code. Do not merge this branch.
