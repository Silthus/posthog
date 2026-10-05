# Workflow walkthrough prototype

Throwaway UI prototype. Nothing in this directory ships. It answers one question from [Silthus/posthog#287](https://github.com/Silthus/posthog/issues/287): how should a guided walkthrough of a new user's first workflow look and feel?

Two variants, both in `WorkflowWalkthrough.stories.tsx`:

- **Coach marks** (`CoachMarks`, `CoachMarksBesideSidePanel`, `CoachMarksWithoutPostHogAi`): a Lemon `Popover` card anchored to the selected node on the canvas. Each stop selects its node through `hogFlowEditorLogic.setSelectedNodeId`, which also runs `fitView`.
- **PostHog AI leads** (`PostHogAiLeads`): a look-alike of the PostHog AI side panel carries the walkthrough as one message per stop, with chips as suggestions under the message. The canvas selects the node of the current stop.

Both share `useWalkthrough.ts` (stop index, transcript, chip state) and `walkthroughStops.ts` (fixed copy per step type, filled from the node config). There are no AI calls: a chip shows the prompt it would send, waits a simulated agent turn, then applies a canned change through `workflowLogic`, so the status bar shows "Editing draft" and the finish stop reads "Publish your changes".

## Run it

```sh
pnpm storybook
```

Then open `Products/Workflows/Prototype/Walkthrough` at http://localhost:6006. The stories are excluded from visual regression tests.

## Why it is shaped this way

- Walkthrough state lives in React state outside the workflow form, because an AI edit reloads the workflow and would wipe form-held state.
- The coach mark re-resolves its anchor node when the graph remounts and re-measures once the canvas stops panning.
- `chipsEnabled={false}` shows what a workspace without PostHog AI gets: the explanations stay, the chips go.
