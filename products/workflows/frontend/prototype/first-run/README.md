# First-run prototype (throwaway)

Answers [silthus/posthog#212](https://github.com/Silthus/posthog/issues/212): what should a paying team's first ten minutes in Workflows feel like, from the empty scene to a first delivered message?

Runs inside the real app (`<App />` in Storybook) on mocked APIs, behind the `workflows-first-run-prototype` flag.

Round 9 is one straight path from the empty Workflows tab to a first delivered email:

1. **Gallery.** The real global templates from `products/workflows/backend/templates/`, in the library's own card (cover image, steps). The orange line on each card shows only what starts it: the event (as the real event chip), an absence of events, or a schedule. One card is marked as the recommended starter, highlighted and listed first, with a one-line reason. The welcome sequence wins when the project tracks signups, otherwise the first template its events can drive. In the product a Jev decision (silthus/posthog#240) could make this pick from the project's events, people and past sends. "Picked for your data" shows the ones the project's events can drive; "All email templates" adds the rest, each with what it still needs. The last card, "Start playing", opens a blank workflow.
2. **Make it yours.** One screen in the tab: the real Unlayer editor (`EmailTemplater`, inline layout) with the team's brand applied, and the brand panel next to it (each value with its source file, controls, "Use detected", "Detect again"). "Change with PostHog AI" opens the PostHog AI side panel with a prompt about this email. "Send me a test" exports the HTML from the editor and shows it in a simulated inbox. "Enable and open workflow" goes straight to the real workflow editor with the workflow already sending. An "Enable workflow" switch under it is on by default. Off, the button reads "Open workflow", and the workflow opens as a draft. A second switch, "Capture engagement events", is also on by default. It turns on the team setting that records opens and clicks as PostHog events for insights.
3. **Enable.** Opened without enabling, the workflow is a draft. A banner says it is not sending yet, says who it will email and from which address, and a curved arrow points at Enable, which also pulses.
4. **View metrics.** Once enabled, the banner says it is sending and offers "View metrics". The real Metrics tab shows the first sends, deliveries, opens and clicks. While engagement events are off, the banner also offers "Enable engagement events". The Metrics tab works either way, because it reads the workflow's own metrics.

The brand detection stands in for the in-flight Email brand flow (silthus/posthog#198). Its final shape depends on the direction of that work, so the first-run feature can ship without it.

When the project lacks signups or emails, a banner hands the fix to an agent: "Copy prompt for your coding agent" copies a ready prompt, and "Let the Wizard do it" shows the one setup agent command. Nobody edits code by hand.

The floating bar switches the project data (signups and emails, few emails, nothing captured yet) and the own domain state (none, verifying, verified). "Start over" reloads. The Unlayer editor loads from Unlayer's CDN, so the browser needs internet access.

## Run

```sh
pnpm --filter=@posthog/storybook prototype:first-run
```

Then open `http://127.0.0.1:6212/iframe.html?id=products-workflows-prototype-first-run--tailored-gallery&viewMode=story`.

Nothing here is production code. Do not merge this branch.
