# What the open editor shows when PostHog AI changes the workflow

Answers [What does the open editor show when PostHog AI changes the workflow?](https://github.com/Silthus/posthog/issues/288) on the map [Map: walk a new user through their first workflow, customized with PostHog AI](https://github.com/Silthus/posthog/issues/286).
Read against `upstream/master` on 2026-10-05. Facts cite code; guesses say so.

## 1. How an AI edit reaches the open editor

- PostHog AI edits workflows through the `workflows-*` MCP commands (`products/workflows/mcp/tools.yaml`: `workflows-patch-graph`, `workflows-patch-action-email`, `workflows-update`), run by the agent in its sandbox.
- The server announces the change with a realtime `resource_edited` notification (`frontend/src/types.ts:549`). The editor listens for it; there is no polling and no hook on the Max tool result.
- On that notification the editor reloads the workflow and replaces its form, with a short loading state (shipped in "edit workflow emails beside PostHog AI with auto-save and live reload", #81905).
- Nothing merges. With unsaved local edits and no autosave, the editor shows a "Keep mine" / reload banner (`products/workflows/frontend/Workflows/Workflow.tsx:41`, `WorkflowAutoSaveIndicator.tsx:39`). With autosave on, the reload wins.

## 2. Enabled workflows

- An AI edit to an active workflow stages a draft (`stage_draft`, `products/workflows/backend/presentation/views/hog_flow.py`). The reload overlays the draft, so the status bar shows "Editing draft" and "The live version keeps running until you publish." (`WorkflowStatusBar.tsx:82`) without a manual reload.
- This depends on the realtime notification arriving.

## 3. From a chip click to the canvas

1. The chip calls `openSidePanel(SidePanelTab.Max, '!<prompt>')`; the `!` prefix sends it (`frontend/src/scenes/max/maxLogic.tsx:105`). This entry point is proposed; no chip exists yet.
2. The prompt joins the conversation with the workflow scene context (`workflowAgentContext.ts`, debounced).
3. The agent runs in its sandbox, reads the workflow, and calls a `workflows-*` command.
4. The API saves (a staged draft on an active workflow) and emits `resource_edited`.
5. The editor reloads and the canvas redraws.

Slow by design (guess on size, no measurements): a cold sandbox start, the agent's own reasoning and tool calls, the context debounce, and email design rendering. A chip is not instant; it takes as long as an agent turn.

## 4. Consent and availability

- Without the organization's AI data-processing consent, `!` does not send: the prompt fills the composer and the composer's consent flow takes over (`frontend/src/scenes/max/phaiSidePanelComposerSeedLogic.ts:32`).
- Where PostHog AI is not configured (self-hosted without an LLM key), the panel shows "PostHog AI isn't set up yet" (`frontend/src/scenes/max/components/MaxNotConfigured.tsx:21`).

## 5. Selected node context

- The editor's selected node is `selectedNodeId` in `hogFlowEditorLogic`, synced with the `?node=` URL param.
- `workflowAgentContext.ts` sends only an open email step, as `editing_email_action_id`. A trigger, delay or branch selection reaches PostHog AI as nothing.
- A general `selected_action_id` (with the node's type) in the same context would let "make this 3 days" resolve to the selected delay. The email field can stay or fold into it.

## Implications for the walkthrough

- **Show progress in the panel, not on the card.** A chip triggers a full agent turn. The walkthrough should move on or wait visibly while PostHog AI works, never look stuck.
- **Survive the reload.** The editor reloads after every AI edit. Walkthrough state (current stop) must live outside the form, and the card must re-anchor to its node after the reload.
- **The walkthrough never edits locally**, so the "Keep mine" banner only appears if the user also typed; no special handling.
- **No consent:** a chip lands as a filled-in prompt behind the consent flow. Acceptable as is.
- **PostHog AI not set up:** hide the chips, keep the explanations.
- **First slice:** selected node context for every step type, independent of the walkthrough.
