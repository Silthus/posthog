# Claude review and dispositions

One read-only Claude Opus 5.5 review ran after draft PostHog/posthog#112079 opened. The reviewed code head was 260cca54a035935295b4c434e87efaf65b34bcd0. The full report is in claude-review.log. The review fixes are a subsequent commit; no second review run is claimed.

| Finding | Disposition |
| --- | --- |
| M1: a dismissed email chip could not be restored | Fixed. The group is per template, and the explicit AI button undismisses the provider's current items. A logic test dismisses the chip and verifies the button restores it. |
| M2: plain-text authoring included a stale visual design | Fixed. HTML presence determines the body mode. Plain-text context excludes visual design and HTML, with a focused editor-state test. |
| M3: oversized design dropped usable HTML and did not bound metadata | Fixed. The fallback tries rendered HTML before shortened text, caps metadata and labels, and measures the final payload. Separate tests exercise rendered HTML and escaped metadata. |
| M4: preflight arrival did not update availability | Fixed. The integration waits for preflight and resyncs on its success action. An HTTP-backed test delays preflight, then changes availability on refresh. |
| L1: a close call on an already closed Max panel recorded a dismissal | Fixed. The listener checks the pre-action open state. The suggested exception for moving AI to the main scene is rejected: that action deliberately closes the panel, and the session rule says it stays closed until the explicit button. |
| L2: a chat message can precede the canvas export debounce | The proposed send coordination is rejected for this slice. The existing editor commits canvas changes after its debounce; gating the agent's global send path is outside this ticket's write scope. This known timing limit is documented in the PR. No immediate-send freshness claim is made. |
| L3: auto-open replaced another panel selected by the user | Fixed. Auto-open preserves another open tab; the explicit button still switches to AI. A logic test covers Support. |
| L4: legacy disabled copy and separate analytics | Copy fixed to explain that email context requires the new AI. Additional analytics events are rejected: the specified activation funnel adds gallery, template pick, test, and create events, and existing sidebar opened/closed events already cover this panel's actions. This draft adds no new activation outcome. |

The original button-prompt acceptance criterion is superseded by the no-prompt amendment. Placeholder and suggestions are optional in that amendment; the chip names the email. No second decision is needed for prompt submission.

The primary scope gap remains unresolved. In-place AI edits and the associated backend/tool tests are absent. The MaxTool path still exists in frozen LangGraph, so the ticket's literal “path gone” fallback condition does not hold. The ticket is parked for approval of the narrower sandbox panel/context slice, with in-place unsaved-email editing proposed as a separate MCP capability.

Final code head after fixes: d1e0b0f99fd58241e93a0566b1f55df2195cf880.
