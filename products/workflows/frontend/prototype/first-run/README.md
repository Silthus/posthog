# First-run prototype (throwaway)

Answers [silthus/posthog#212](https://github.com/Silthus/posthog/issues/212): what should a paying team's first ten minutes in Workflows feel like, from the empty scene to a first delivered message?

Runs inside the real app (`<App />` in Storybook) on mocked APIs, behind the `workflows-first-run-prototype` flag.

Round 5 builds on the tailored gallery (variant G of round 4):

1. **Gallery.** The real global templates from `products/workflows/backend/templates/`, in the library's own card (cover image, steps, trigger), spread across the full width. "Picked for your data" shows the ones the project's events can drive, "All email templates" shows every email template with what each still needs.
2. **Your email brand.** A bar above the gallery shows what was read from the team's GitHub repo while it reads it, file by file. "Review brand" lists every value with the file it came from, a control to change it, "Edited by you · Use detected" and "Detect again". It stands in for the in-flight Email brand flow (silthus/posthog#198), which owns connecting GitHub and picking the repo.
3. **Make it yours.** A template opens in the real Unlayer editor (`EmailTemplater`, inline layout) with the brand applied: logo, button colors, font, text and background. Click any text to edit it. Brand changes and PostHog AI edits push into the live canvas.
4. **Send yourself a test.** The HTML is exported from the editor, so the test shows exactly what is on the canvas, with the recipient's name filled in.
5. **Turn it on.** The real template's workflow goes live from `onboarding@trial.posthog.com` with the team's name, opens in the real workflow editor, and Quick start lists what to try next.

The floating bar switches the project data (signups and emails, few emails, nothing captured yet) and the own domain state (none, verifying, verified). "Start over" reloads. The Unlayer editor loads from Unlayer's CDN, so the browser needs internet access.

## Run

```sh
pnpm --filter=@posthog/storybook prototype:first-run
```

Then open `http://127.0.0.1:6212/iframe.html?id=products-workflows-prototype-first-run--tailored-gallery&viewMode=story`.

Nothing here is production code. Do not merge this branch.
