# Chat action transport: how a typed action list can travel from the sandbox agent to the thread

Research for [Silthus/posthog#82](https://github.com/Silthus/posthog/issues/82), part of map [#80](https://github.com/Silthus/posthog/issues/80).
All file paths are relative to the repository root. Line numbers are from the commit this branch was cut from.
Sources are the code in this tree plus the ACP spec pages on content blocks and extensibility.

## Question

On the sandbox runtime, which channels can carry a typed list of actions from the agent's final answer to the browser, so the thread renders them as buttons? What does each channel cost?

The two demo buttons are:

- "Fire a real send to your address": a follow-up. The click puts a prompt in the composer.
- "Enable the workflow": a command. The click runs the `workflows-enable` MCP tool.

## How a turn reaches the browser today

The agent is `@posthog/agent` (`products/desktop/packages/agent/package.json:2`). The tasks sandbox runs the same package (`products/tasks/backend/temporal/constants.py:55`).
It speaks ACP over the products/tasks SSE endpoint (`products/posthog_ai/frontend/types/streamTypes.ts:4-6`).
`runStreamLogic` folds the wire frames into `ThreadItem` and `ToolInvocation` records (`products/posthog_ai/frontend/types/streamTypes.ts:120-187`).
Control verbs from the browser go the other way through `POST .../tasks/{task}/runs/{run}/command/` (`products/posthog_ai/backend/message_routing.py:7-8`, `products/tasks/backend/presentation/views/api.py:3023`).
The allowed verbs are `user_message`, `cancel`, `close`, `permission_response`, `set_config_option`, `mcp_response`, `credential_response`, `pi/rpc`, `queue_get`, `queue_clear`, `side_question` (`products/tasks/backend/presentation/serializers.py:3981-3992`).

## Channel 1: the stream

### What survives to the frontend

The frontend accepts six `session/update` kinds: `agent_message_chunk`, `agent_message`, `agent_thought_chunk`, `tool_call`, `tool_call_update`, `current_mode_update` (`products/posthog_ai/frontend/types/wireTypes.ts:225-232`).
An unknown kind is dropped without an error (`products/posthog_ai/frontend/logics/runStreamLogic.ts:4017-4019`).

For a message chunk the fold reads one field: `content.text`, with `update.text` as a fallback (`products/posthog_ai/frontend/logics/runStreamLogic.ts:1554-1561`).
The chunk's `_meta`, the block `type`, and any non-text block are not read.
The typed wire shape for a chunk is `{ type?, text? }` (`products/posthog_ai/frontend/types/wireTypes.ts:119-129`).
So a custom content block or a `_meta` field on a message part reaches the browser but is discarded before the thread sees it.

For a tool frame the story is different: `_meta` is kept on the invocation (`products/posthog_ai/frontend/types/streamTypes.ts:76-77`, `runStreamLogic.ts:1037,1080`) and typed for the `posthog` and `claudeCode` keys (`wireTypes.ts:180-183`).
`_meta.ui.hidden` is read on user content blocks only (`runStreamLogic.ts:364-369`).

`_posthog/*` extension notifications also cross the relay. The frontend handles five: `permission_request`, `permission_resolved`, `sdk_session`, `usage_update`, `user_message` (`runStreamLogic.ts`, the `isPosthogNotification(notification, ...)` calls), plus the console, status, progress, task and compaction kinds listed in `wireTypes.ts:240-400`.
The agent's vocabulary is in `products/desktop/packages/agent/src/acp-extensions.ts:15-80`.
The ACP spec allows custom notifications with an underscore prefix and says an implementation "SHOULD ignore unrecognized notifications" ([extensibility](https://agentclientprotocol.com/protocol/extensibility)).
A new `_posthog/actions` notification is therefore protocol-legal. But the agent emits it, and the agent is the desktop package, which ships separately from this repo.

### Where the assistant text is rendered

`MarkdownMessage` lexes the text with `marked` into top-level blocks and renders each block through `LemonMarkdown.Renderer` (`products/posthog_ai/frontend/messages/MarkdownMessage.tsx:8-35`).
`LemonMarkdown` renders a fenced block with a language tag as a `CodeSnippet` (`frontend/src/lib/lemon-ui/LemonMarkdown/LemonMarkdown.tsx:189-211`).
It already has one language hook: `renderMermaid` intercepts a ` ```mermaid ` fence (`LemonMarkdown.tsx:105-109, 194-196`).
That is the precedent for a ` ```posthog-actions ` fence: a JSON block the agent writes at the end of its answer, pulled out by the same lexer and drawn as buttons.
The ACP content block vocabulary is text, image, audio, embedded resource, and resource link ([content](https://agentclientprotocol.com/protocol/content)). A fenced block is plain text, so it does not fork the protocol.

The adapter emits message chunks as `{ type: 'text', text }` with no `_meta` (`products/desktop/packages/agent/src/adapters/claude/claude-agent.ts:1173-1179`).
A `_meta` route on a message part needs an adapter change on top of the frontend change.

### Persistence

The text of a turn is what the run log stores and replays on bootstrap (`wireTypes.ts:1-13`).
A fenced block in the text replays with the message. A `_meta` field on a chunk would replay too, but the fold would still drop it.

### Files it touches

- Fenced block: `products/posthog_ai/frontend/messages/MarkdownMessage.tsx` (pull the fence out before render), a new small component for the buttons, and a prompt line (see Channel 2 for where prompt lines live).
- Custom part or `_meta`: also `products/posthog_ai/frontend/types/wireTypes.ts:119-129`, `runStreamLogic.ts:1554-1561`, and the adapter in `products/desktop/packages/agent`.

### Cost

- Fenced block: low. Two frontend files and one prompt string. No backend, no agent release. Risk: the model must write the block; a malformed block falls back to a code snippet. The block is visible as code until the renderer lands.
- Custom part or `_meta`: high. Needs an agent release and a frontend fold change, and the model still has to be told to emit it.

## Channel 2: a tool as the channel

### How a PostHog tool call looks on the wire

The agent reaches PostHog through one outer tool named `exec` (`services/mcp/src/tools/exec.ts:1453`, `products/posthog_ai/backend/services/system_prompt/prompt.py:40-42`).
The verb `call <tool> <json>` runs an inner tool (`exec.ts:1712-1725`).
The frontend resolves the inner name from `rawInput.command` (`products/posthog_ai/frontend/utils/toolResolver.ts:54-104`, `products/posthog_ai/frontend/components/tool/posthogExecDisplay.ts:55-83`).
The `exec` wrapper renames nothing. The registry key is the inner name, for example `workflows-enable` (`products/posthog_ai/frontend/components/tool/toolRegistry.tsx:50-56`).

The result comes back as a string, or as `{ content: [{ type: 'text', text }], _meta: { ... } }` when app data is attached, or as a `structuredContent` payload for UI-app hosts (`exec.ts:1855-1915`).
The adapter puts the MCP result on `tool_call_update.rawOutput` (`products/desktop/packages/agent/src/adapters/claude/conversion/sdk-to-acp.ts:452-470`).
The renderer receives it as `message.rawOutput` with the parsed `innerInput` (`products/posthog_ai/frontend/types/toolTypes.ts:5-28`).

### Rendering a card

A product declares `ToolRegistryEntry` rows in `products/<product>/frontend/posthogAiToolRenderers.tsx` and adds them to the manifest in `frontend/src/posthogAiToolRenderers.ts` (`products/posthog_ai/README.md:121-135`).
An entry carries `key`, `displayName`, `icon`, optional `Renderer`, optional `PermissionPreview`, `requiresPostHogOrigin`, `keepVisible` (`toolRegistry.tsx:47-76`).
`ToolRendererProps` carries the message, the icon, the display name, and turn flags. It carries no stream key and no run ids (`toolRegistry.tsx:28-45`).
A card that must act on the composer therefore needs a way to find the run. `foregroundStreamLogic` exposes the stream key the user is watching (`products/posthog_ai/frontend/logics/foregroundStreamLogic.ts:1-6`). `runInteractionLogic` is keyed by `taskId` and `runId` (`products/posthog_ai/frontend/logics/runInteractionLogic.ts:63-83`).
So a `suggest_actions` card needs one new prop or one lookup before a click can reach the composer.

### Making the agent call it

The system prompt is Claude Code's preset plus an appended string built by `PromptService` (`products/posthog_ai/backend/services/system_prompt/service.py:42-50`).
The append text lives in `products/posthog_ai/backend/services/system_prompt/prompt.py`.
A per-surface instruction is an `AttachedContextItem` of `type: 'instructions'`, hidden, static (`products/posthog_ai/README.md:61-79`).
Two precedents: `AGENT_TOOL_APPLY_BACK_CONTEXT_ITEM` tells the agent to act through tool calls (`products/posthog_ai/frontend/utils/posthogContextBlock.ts:10-21`), and the workflows editor names its skill and tools (`products/workflows/frontend/Workflows/workflowAgentContext.ts:25-36`).
Skills ship from `products/*/skills/` into the sandbox (`products/posthog_ai/skills/README.md:1-6`), and the skill count is a shared budget (`skills/README.md:20-24`).

Nothing forces the model to call a tool at the end of a turn. The prompt or the instruction item is the only lever.

### Where the tool would live

A generated tool comes from `products/<name>/mcp/tools.yaml`. A handwritten tool is registered in `services/mcp/src/tools/index.ts` (for example `workflows-enable` at line 145, defined in `services/mcp/src/tools/workflows/lifecycle.ts:29-34`).
Both run in `services/mcp`, a separate service. The sandbox reaches it at `mcp.posthog.com` with a per-run OAuth token (`products/tasks/backend/temporal/process_task/utils.py:796-806`, `products/tasks/backend/temporal/process_task/activities/start_agent_server.py:402`).
A `suggest_actions` tool has no PostHog API to call. It would echo its input as its result so the card can read it from `rawOutput` or `innerInput`.

### Permission

The client policy auto-allows every PostHog `exec` call in the task's project (`products/posthog_ai/frontend/policy/toolPolicy.ts:52-57`). A `suggest_actions` call would show no approval card.

### Files it touches

- `services/mcp/src/tools/` (new tool) and `services/mcp/src/tools/index.ts` (registration), or a `tools.yaml` entry with a backing endpoint.
- `products/<product>/frontend/posthogAiToolRenderers.tsx` and `frontend/src/posthogAiToolRenderers.ts` (card).
- `toolRegistry.tsx:28-45` (a stream key on `ToolRendererProps`) or a `foregroundStreamLogic` lookup in the card.
- `prompt.py` or an instruction item (so the agent calls it).

### Cost

Medium to high. One deploy of `services/mcp`, one registry entry, one prompt change, and a prop change so the card can act.
The result is typed and validated by the tool schema, and it replays from the run log like every tool call.
The card sits in the tool timeline, not at the end of the answer, unless `keepVisible` is set.

## Channel 3: the question channel

### What arrives

The agent maps Claude's `AskUserQuestion` to an ACP `permission_request` (`products/desktop/packages/agent/src/adapters/claude/permissions/permission-handlers.ts:421-440`).
The options are built from the first question only, one `allow_once` option per choice, ids `option_<idx>`, label in `name`, description in `_meta.description` (`permission-handlers.ts:394-401`).
The full question list rides in `toolCall._meta.questions` with `codeToolKind: 'question'` (`permission-handlers.ts:436-439`).

The frontend parses the request into a `PermissionRequestRecord` with `questions` (`products/posthog_ai/frontend/logics/runStreamLogic.ts:720-762`).
It drops `_meta.description` on an option; only `customInput` is read (`runStreamLogic.ts:701-704`).
A question is never auto-approved (`products/posthog_ai/frontend/policy/toolPolicy.ts:43-47`, `runStreamLogic.ts:3405-3410`).
`QuestionInput` renders it and replies with `respondToPermission({ optionId, answers, customInput })` (`products/posthog_ai/frontend/components/QuestionInput.tsx:74-84`).
`deliverPermission` posts a `permission_response` command (`runStreamLogic.ts:3468-3520`).
`QuestionRenderer` draws the recap in the thread (`products/posthog_ai/frontend/components/QuestionRenderer.tsx:17-66`).

### Can it carry the two demo actions as-is

It can carry two labels and the user can click one. Everything else breaks:

- The run blocks. The agent awaits the reply inside the tool call (`permission-handlers.ts:428`). The composer refuses a send while a request is pending (`runInteractionLogic.ts:864-868, 1259-1261`).
- One answer per question. Options exist on the wire for the first question only (`products/posthog_ai/frontend/policy/questionUtils.ts:157-167`). A click answers; it does not open a second choice.
- No composer insert. The answer goes back to the agent as `_meta.answers` (`questionUtils.ts:5-9`). Nothing puts text in the composer.
- The buttons die with the run. `deliverPermission` fails when the run is terminal or when the record's run is not the active run (`runStreamLogic.ts:3472-3480`). A question asked at the end of the last turn cannot be answered after the run finishes.
- Both demo buttons would be answers to a question, not actions. "Enable the workflow" would resume the agent, which then has to decide to call `workflows-enable` on its own.

### Files it touches

None to reuse as-is. To bend it: `permission-handlers.ts`, `questionUtils.ts`, `QuestionInput.tsx`, `runStreamLogic.ts:3472-3480`.

### Cost

Low to try, high to make right. It is a blocking prompt, not an action list. The map's standing preference for a non-blocking end-of-answer affordance rules it out.

## Channel 4: the click for a follow-up

### Insert text and focus

The existing insert-versus-send contract is `SuggestionItem.requiresUserInput` (`products/posthog_ai/frontend/components/suggestions/Suggestions.tsx:17-22`).
On the new-task composer: `applySuggestion` sets the description and submits unless `requiresUserInput` is set (`products/posthog_ai/frontend/scenes/TaskTracker/taskTrackerSceneLogic.ts:628-635`). The component focuses the textarea in that case (`products/posthog_ai/frontend/scenes/TaskTracker/components/TaskComposer.tsx:66-71`).
A host can also seed the composer with `composerSeedLogic.setSeed({ prompt, autoSubmit })` (`products/posthog_ai/frontend/logics/composerSeedLogic.ts:6-9, 52-70`), consumed by `applyComposerSeed` (`taskTrackerSceneLogic.ts:906-924`).

On a live run the composer is `runInteractionLogic`, exported from `api/logics` (`products/posthog_ai/frontend/api/logics.ts:16-18`).
Insert: `setComposerFormValues({ draft })` (`runInteractionLogic.ts:378-380`, used at 1433 and 1483).
Focus: `setComposerFocused(true)` (`runInteractionLogic.ts:365-366, 622, 665`).
An action button rendered in the thread of run R can call `runInteractionLogic({ taskId, runId })` for that run, or resolve the run through `foregroundStreamLogic`.

### Send

`submitComposerForm` routes a draft: a terminal run starts a new run, a busy run enqueues, an idle run sends now (`runInteractionLogic.ts:819-858`, `startNewRun` at 1345).
`sendNow` posts `user_message` with the wrapped context (`runInteractionLogic.ts:1262-1268`).
The endpoint is session-authenticated through the tasks viewset and gated by code access (`products/tasks/backend/presentation/views/api.py:3023, 3073-3084`).

### Files it touches

- A button component that calls `setComposerFormValues` and `setComposerFocused` on the run's `runInteractionLogic`.
- Nothing in the backend.

### Cost

Low. Both actions exist and are public. The only work is finding the right logic instance from a thread item.

## Channel 5: the click for a command

The three paths in the map Notes, checked against the code.

### Path A: send a message

The click submits text such as "Enable workflow <id>" through the same `submitComposerForm` path as Channel 4.
The agent runs `exec call workflows-enable {"id": ...}` in a new turn.

Approval gate as it stands:

- Client side: every PostHog `exec` call in the task's project auto-allows (`toolPolicy.ts:52-57`). No card is shown.
- Server side: `exec` demands `--confirm` for a `destructiveHint` tool only when `requireDestructiveConfirmation` is set (`services/mcp/src/tools/exec.ts:1731-1735`). Only the CLI sets it (`services/mcp/src/cli/index.ts:79, 99`). The hosted server does not (`services/mcp/src/hono/tool-executor.ts:680-700`).
- `workflows-enable` is `destructiveHint: true`, `readOnlyHint: false`, scope `hog_flow:write` (`services/mcp/schema/tool-definitions-all.json:13592-13604`).
- The only guard today is prose: `workflows-create` tells the agent to enable "only with the user's explicit approval" (`products/workflows/mcp/tools.yaml:147-149`), and the sandbox token's scopes decide whether writes are possible at all (`utils.py:794-797`, `start_agent_server.py:402`).

So a typed "enable it" and a clicked "Enable the workflow" pass the same gate today: none on the client, prose on the agent. The click is at least as explicit as the typed request.

Files: the button component, nothing else.
Cost: low. It costs one agent turn and the model tokens for it. The workflow id must be in the button text; the agent has it from its own `workflows-create` result.

### Path B: `POST /api/projects/:id/mcp_tools/<name>`

The viewset resolves scopes per tool and runs a registered `MCPTool` (`products/posthog_ai/backend/api/mcp_tools.py:77-82, 131-188`), routed at `mcp_tools` (`products/posthog_ai/backend/routes.py:7-12`).
`MCPTool` takes `team` and `user` from the request and returns text plus optional structured content (`ee/hogai/mcp_tool.py:13-51`). Registration is a decorator with scopes (`ee/hogai/mcp_tool.py:72-82`).
Three tools are registered: `execute_sql` (`ee/hogai/tools/execute_sql/mcp_tool.py:52`), the warehouse schema (`ee/hogai/tools/read_data_warehouse_schema/mcp_tool.py:19`), and taxonomy (`ee/hogai/tools/read_taxonomy/mcp_tool.py:21`).
The `services/mcp` tools, including `workflows-enable`, are not reachable here.

To use it: write a Python `MCPTool` that patches the workflow status, register it with `hog_flow:write`, and call it from the button with the generated client.
There is no approval gate on this path. The click is the approval.
The agent does not see the result unless the button also sends a message.

Files: a new module under `ee/hogai/tools/` or `products/workflows/backend/`, the generated frontend client, the button.
Cost: medium. It duplicates a tool that already exists in `services/mcp`, and each new command needs another Python tool.

### Path C: `services/mcp` from the browser

The server accepts only a bearer token that starts with `phx_` or `pha_`, or an ID-JAG token (`services/mcp/src/index.ts:190-224`). The token comes from the `Authorization` header (`services/mcp/src/lib/utils.ts:18-27`).
No cookie or session path exists. A browser call needs a token in the page or a Django proxy that mints one.

Files: a new Django proxy or token endpoint, a browser MCP client, CSP changes for the new origin.
Cost: high. New auth surface for one button.

### A fourth path the map does not list

`mcp_response` is an allowed command verb (`serializers.py:3986`). It is the desktop MCP relay: the sandbox calls a tool, and the client executes it and posts the result back (`products/desktop/docs/CLOUD-MCP-RELAY.md:52-75`). It runs in the other direction and is desktop-only. It is not a path for a browser button.

## Recommendation

The smallest combination that carries the two buttons on the sandbox runtime:

1. Transport: a ` ```posthog-actions ` fenced JSON block at the end of the assistant message (Channel 1, fenced block).
   The agent already writes markdown; the run log already persists and replays it; the fold already delivers the text (`runStreamLogic.ts:1554-1561`).
   No agent release, no `services/mcp` deploy, no wire type change.
2. Prompt: one static instruction that tells the agent to end an answer with the block when it has actions to offer. For the prototype, a paragraph in `prompt.py`. For the product shape, an `instructions` context item next to the tool it follows, in the `workflowAgentContext.ts` style.
3. Render: pull the fence out of the blocks in `MarkdownMessage.tsx:8-13` before `LemonMarkdown` sees it, and draw the buttons under the message. A malformed block falls through to the code snippet.
4. Follow-up click: `runInteractionLogic.setComposerFormValues({ draft })` then `setComposerFocused(true)` (Channel 4).
5. Command click: `runInteractionLogic.submitComposerForm` with the command text, including the workflow id (Channel 5, path A). The agent runs `workflows-enable` in the next turn.

Action shape for the block, so both kinds fit one primitive:

```json
{
  "actions": [
    {
      "kind": "insert",
      "label": "Fire a real send to your address",
      "prompt": "Send a real test of workflow <id> to my address"
    },
    { "kind": "send", "label": "Enable the workflow", "prompt": "Enable workflow <id> with workflows-enable" }
  ]
}
```

`insert` and `send` map onto the existing `requiresUserInput` split (`Suggestions.tsx:19-20`).

What this leaves open, and why it is acceptable for the prototype:

- Approval. Today a typed request and a clicked button both auto-allow on the client (`toolPolicy.ts:52-57`). If the map wants a card before a write, the change is in `toolPolicy.ts` (prompt for `destructiveHint` inner tools) and applies to both paths at once. The button then shows the existing `PermissionInput` card with the workflows `PermissionPreview` if one is declared.
- Reliability. The model may omit the block. A tool call (Channel 2) is the typed upgrade when the block proves flaky, and it reuses the same button component and the same click paths.
- Placement. The fenced block lands at the end of the answer, which is where the screenshot wanted it. A tool card would land in the tool timeline.
